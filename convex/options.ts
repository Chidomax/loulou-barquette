import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { actor, audit } from "./access"
import { clean } from "./lib"
import { getShop } from "./shop"
import { endOfService, hhmmFr } from "./shared"
import { optionGroup } from "./schema"

const duration = v.union(v.literal("30m"), v.literal("1h"), v.literal("service"), v.literal("manuel"))

async function untilFor(ctx: MutationCtx, d: "30m" | "1h" | "service" | "manuel") {
  const now = Date.now()
  if (d === "30m") return now + 30 * 60_000
  if (d === "1h") return now + 60 * 60_000
  if (d === "service") return endOfService(await getShop(ctx), now)
  return undefined // retour manuel
}
const untilText = (u?: number) => (u ? `jusqu'à ${hhmmFr(u)}` : "jusqu'à remise en vente manuelle")

/** Disponibilités pour l'équipe : plats, ingrédients partagés et produits qui les utilisent. */
export const availability = query({
  args: { kt: v.optional(v.string()) },
  handler: async (ctx, { kt }) => {
    const a = await actor(ctx, kt, ["admin", "staff", "kitchen"])
    if (!a.ok) return a
    const items = (await ctx.db.query("menuItems").withIndex("by_position").collect()).filter((i) => i.active)
    const ingredients = await ctx.db.query("ingredients").withIndex("by_position").collect()
    const usedBy = (id: Id<"ingredients">) => items.filter((i) => i.optionGroups?.some((g) => g.choices.some((c) => c.ingredientId === id))).map((i) => i.name)
    return {
      ok: true as const,
      role: a.kind,
      items: items.map((i) => ({ _id: i._id, name: i.name, category: i.category, price: i.price, imageUrl: i.imageUrl ?? null, outOfStock: !!i.outOfStock, outUntil: i.outUntil ?? null, outReason: i.outReason ?? "", hasOptions: !!i.optionGroups?.length, groups: i.optionGroups ?? [] })),
      ingredients: ingredients.map((g) => ({ _id: g._id, name: g.name, kind: g.kind, outOfStock: g.outOfStock, outUntil: g.outUntil ?? null, outReason: g.outReason ?? "", usedBy: usedBy(g._id) })),
    }
  },
})

/** Rupture ou retour en vente d'un plat (équipe et responsable, employé identifié sur l'accès cuisine). */
export const setItemStock = mutation({
  args: { kt: v.optional(v.string()), itemId: v.id("menuItems"), out: v.boolean(), duration: v.optional(duration), motif: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const who = await actor(ctx, a.kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    const it = await ctx.db.get(a.itemId)
    if (!it) return { ok: false as const, code: "NOT_FOUND", message: "Plat introuvable." }
    const until = a.out ? await untilFor(ctx, a.duration ?? "service") : undefined
    await ctx.db.patch(a.itemId, { outOfStock: a.out, outUntil: until, outReason: a.out ? clean(a.motif, 100) || undefined : undefined })
    if (until) await ctx.scheduler.runAt(until, internal.options.restore, { kind: "item", id: a.itemId, until })
    await audit(ctx, who, a.out ? "Rupture" : "Remis en vente", { detail: `${it.name}${a.out ? ` ${untilText(until)}` : ""}`, motif: a.motif })
    return { ok: true as const }
  },
})

/** Rupture d'un ingrédient partagé : il devient indisponible dans tous les produits qui l'utilisent. */
export const setIngredientStock = mutation({
  args: { kt: v.optional(v.string()), ingredientId: v.id("ingredients"), out: v.boolean(), duration: v.optional(duration), motif: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const who = await actor(ctx, a.kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    const g = await ctx.db.get(a.ingredientId)
    if (!g) return { ok: false as const, code: "NOT_FOUND", message: "Ingrédient introuvable." }
    const until = a.out ? await untilFor(ctx, a.duration ?? "service") : undefined
    await ctx.db.patch(a.ingredientId, { outOfStock: a.out, outUntil: until, outReason: a.out ? clean(a.motif, 100) || undefined : undefined })
    if (until) await ctx.scheduler.runAt(until, internal.options.restore, { kind: "ingredient", id: a.ingredientId, until })
    await audit(ctx, who, a.out ? "Rupture ingrédient" : "Ingrédient remis en vente", { detail: `${g.name}${a.out ? ` ${untilText(until)} (tous les produits liés)` : ""}`, motif: a.motif })
    return { ok: true as const }
  },
})

/** Retour en vente programmé (uniquement si la rupture n'a pas été modifiée entre-temps). */
export const restore = internalMutation({
  args: { kind: v.union(v.literal("item"), v.literal("ingredient")), id: v.string(), until: v.number() },
  handler: async (ctx, a) => {
    const doc = (await ctx.db.get(a.id as Id<"menuItems"> | Id<"ingredients">)) as Doc<"menuItems"> | Doc<"ingredients"> | null
    if (!doc || !doc.outOfStock || doc.outUntil !== a.until) return
    await ctx.db.patch(doc._id, { outOfStock: false, outUntil: undefined, outReason: undefined })
    await audit(ctx, "systeme", a.kind === "item" ? "Remis en vente (fin de rupture)" : "Ingrédient remis en vente (fin de rupture)", { detail: doc.name })
  },
})

// ---------- Responsable : ingrédients et règles des options
export const addIngredient = mutation({
  args: { name: v.string(), kind: v.string() },
  handler: async (ctx, a) => {
    const who = await actor(ctx, undefined, ["admin"])
    if (!who.ok) return who
    const name = clean(a.name, 40)
    if (name.length < 2) return { ok: false as const, code: "INVALID", message: "Nom trop court." }
    const last = await ctx.db.query("ingredients").withIndex("by_position").order("desc").first()
    await ctx.db.insert("ingredients", { name, kind: clean(a.kind, 30) || "autre", outOfStock: false, position: (last?.position ?? 0) + 1 })
    await audit(ctx, who, "Ingrédient ajouté", { detail: name })
    return { ok: true as const }
  },
})

/** Modifie les règles d'un plat à options (prix des choix, minimum/maximum…). Vérifie la cohérence avant d'enregistrer. */
export const saveGroups = mutation({
  args: { itemId: v.id("menuItems"), groups: v.array(optionGroup) },
  handler: async (ctx, a) => {
    const who = await actor(ctx, undefined, ["admin"])
    if (!who.ok) return who
    const it = await ctx.db.get(a.itemId)
    if (!it) return { ok: false as const, code: "NOT_FOUND", message: "Plat introuvable." }
    const ids = new Set<string>()
    for (const g of a.groups) {
      if (!g.id || ids.has(g.id)) return { ok: false as const, code: "INVALID", message: "Identifiants de groupes en double." }
      ids.add(g.id)
      if (!(g.min >= 0 && g.max >= g.min && g.max <= 10)) return { ok: false as const, code: "INVALID", message: `${g.label} : minimum et maximum incohérents.` }
      if (!g.choices.length) return { ok: false as const, code: "INVALID", message: `${g.label} : au moins un choix.` }
      for (const c of g.choices) if (!(c.price >= 0 && c.price <= 100)) return { ok: false as const, code: "INVALID", message: `${c.label} : prix invalide.` }
    }
    for (const g of a.groups) {
      if (g.countFrom && !ids.has(g.countFrom)) return { ok: false as const, code: "INVALID", message: `${g.label} : dépendance inconnue.` }
      if (g.showIf && !ids.has(g.showIf.group)) return { ok: false as const, code: "INVALID", message: `${g.label} : condition inconnue.` }
    }
    await ctx.db.patch(a.itemId, { optionGroups: a.groups.map((g) => ({ ...g, label: clean(g.label, 40), choices: g.choices.map((c) => ({ ...c, label: clean(c.label, 40), price: Math.round(c.price * 100) / 100 })) })) })
    await audit(ctx, who, "Options modifiées", { detail: it.name })
    return { ok: true as const }
  },
})

// ---------- Mise en place des tacos à composer (exemple du cahier des besoins, à valider avec le restaurant)
export const seedTacos = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("ingredients").first()) return "déjà en place"
    const add = async (name: string, kind: string, position: number) => ctx.db.insert("ingredients", { name, kind, outOfStock: false, position })
    let p = 1
    const viandes = [] as { id: string; label: string; ing: Id<"ingredients"> }[]
    for (const [id, label] of [["poulet", "Poulet"], ["hache", "Viande hachée"], ["cordon", "Cordon bleu"], ["tenders", "Tenders"], ["merguez", "Merguez"]]) viandes.push({ id, label, ing: await add(label, "Viande", p++) })
    const sauces = [] as { id: string; label: string; ing: Id<"ingredients"> }[]
    for (const [id, label] of [["algerienne", "Algérienne"], ["blanche", "Blanche"], ["barbecue", "Barbecue"], ["samourai", "Samouraï"], ["harissa", "Harissa"], ["ketchup", "Ketchup"], ["mayo", "Mayonnaise"]]) sauces.push({ id, label, ing: await add(label, "Sauce", p++) })
    const fromage = await add("Fromage râpé", "Supplément", p++)
    const oeuf = await add("Œuf", "Supplément", p++)
    const bacon = await add("Bacon de dinde", "Supplément", p++)
    const coca = await add("Coca-Cola 33 cl", "Boisson", p++)
    const jus = await add("Jus tropical", "Boisson", p++)
    const eau = await add("Eau pétillante", "Boisson", p++)
    await add("Frites", "Accompagnement", p++)
    await add("Sauce fromagère", "Sauce", p++)

    const service = { label: "Service", choices: [{ id: "dans", label: "Dans le tacos" }, { id: "apart", label: "À part" }] }
    const groups = [
      { id: "taille", label: "Taille", min: 1, max: 1, choices: [
        { id: "M", label: "M · 1 viande", price: 0, count: 1 },
        { id: "L", label: "L · 2 viandes", price: 1, count: 2 },
        { id: "XL", label: "XL · 3 viandes", price: 5, count: 3 },
      ] },
      { id: "viandes", label: "Viandes", min: 1, max: 3, repeat: true, countFrom: "taille", choices: viandes.map((x) => ({ id: x.id, label: x.label, price: 0, ingredientId: x.ing })) },
      { id: "sauces", label: "Sauces", min: 1, max: 2, choices: [
        ...sauces.map((x) => ({ id: x.id, label: x.label, price: 0, ingredientId: x.ing, sub: service })),
        { id: "sans", label: "Sans sauce", price: 0, exclusive: true },
      ] },
      { id: "supplements", label: "Suppléments", min: 0, max: 3, choices: [
        { id: "fromage", label: "Fromage râpé", price: 1, ingredientId: fromage },
        { id: "oeuf", label: "Œuf", price: 1, ingredientId: oeuf },
        { id: "bacon", label: "Bacon de dinde", price: 1.5, ingredientId: bacon },
      ] },
      { id: "retraits", label: "Retraits", min: 0, max: 2, choices: [
        { id: "sansfromagere", label: "Sans sauce fromagère", price: 0 },
        { id: "sansfrites", label: "Sans frites dans le tacos", price: 0 },
      ] },
      { id: "formule", label: "Formule", min: 1, max: 1, choices: [
        { id: "seul", label: "Tacos seul", price: 0 },
        { id: "menu", label: "Menu : frites + boisson", price: 3 },
      ] },
      { id: "boisson", label: "Boisson du menu", min: 1, max: 1, showIf: { group: "formule", choice: "menu" }, choices: [
        { id: "coca", label: "Coca-Cola 33 cl", price: 0, ingredientId: coca },
        { id: "jus", label: "Jus tropical", price: 0, ingredientId: jus },
        { id: "eau", label: "Eau pétillante", price: 0, ingredientId: eau },
      ] },
      { id: "saucefrites", label: "Sauce pour les frites", min: 0, max: 1, showIf: { group: "formule", choice: "menu" }, choices: [
        { id: "ketchup", label: "Ketchup", price: 0, ingredientId: sauces[5].ing },
        { id: "mayo", label: "Mayonnaise", price: 0, ingredientId: sauces[6].ing },
        { id: "algerienne", label: "Algérienne", price: 0, ingredientId: sauces[0].ing },
      ] },
    ]
    // Remplace les trois tacos fixes par un tacos à composer
    const old = (await ctx.db.query("menuItems").collect()).filter((i) => /^Tacos (M|L|XL)$/.test(i.name))
    const pos = old[0]?.position ?? 11
    const imageUrl = old.find((i) => i.imageUrl)?.imageUrl
    for (const o of old) await ctx.db.delete(o._id)
    await ctx.db.insert("menuItems", { name: "Tacos à composer", category: "Snacks", price: 8, description: "Taille, viandes et sauces au choix. Frites et sauce fromagère dans le tacos.", imageUrl, position: pos, active: true, optionGroups: groups })
    return "ok"
  },
})
