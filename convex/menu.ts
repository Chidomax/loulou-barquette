import { v } from "convex/values"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { clean, gate } from "./lib"
import { getShop } from "./shop"

// ---------- Lecture publique
export const publicData = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("menuItems").withIndex("by_position").collect()
    const zones = await ctx.db.query("zones").withIndex("by_position").collect()
    const hero = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "hero")).first()
    const une = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "une")).collect()
    const bandeau = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "bandeau")).first()
    const livreur = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "livreur")).first()
    const galerie = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "galerie")).collect()
    const s = await ctx.db.query("siteSettings").first()
    const shop = await getShop(ctx)
    const ingredients = await ctx.db.query("ingredients").collect()
    return {
      // Ouverture, pause et horaires : l'écran les affiche, le serveur les vérifie à chaque commande
      shop: { open: shop.open, pausedUntil: shop.pausedUntil ?? null, pauseReason: shop.pauseReason ?? "", hours: shop.hours, prepMinutes: shop.prepMinutes, autoAccept: shop.autoAccept },
      outIngredients: ingredients.filter((g) => g.outOfStock).map((g) => g._id as string),
      bannerUrl: bandeau?.imageUrl ?? null,
      livreurUrl: livreur?.imageUrl ?? null,
      galerie: galerie.map((p) => ({ _id: p._id, title: p.title ?? "", imageUrl: p.imageUrl })),
      settings: { heroTitle: s?.heroTitle ?? "", heroText: s?.heroText ?? "", annonce: s?.annonce ?? "" },
      items: items.filter((i) => i.active).map((i) => ({ _id: i._id, name: i.name, category: i.category, price: i.price, description: i.description ?? "", imageUrl: i.imageUrl ?? null, outOfStock: !!i.outOfStock, groups: i.optionGroups ?? null })),
      zones: zones.map((z) => ({ name: z.name, fee: z.fee, delai: z.delai, lat: z.lat, lng: z.lng })),
      heroUrl: hero?.imageUrl ?? null,
      une: une.map((p) => ({ _id: p._id, title: p.title ?? "", subtitle: p.subtitle ?? "", imageUrl: p.imageUrl })),
    }
  },
})

// ---------- Gérant
export const adminItems = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const items = await ctx.db.query("menuItems").withIndex("by_position").collect()
    const une = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "une")).collect()
    const hero = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "hero")).first()
    const zones = await ctx.db.query("zones").withIndex("by_position").collect()
    const bandeau = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "bandeau")).first()
    const livreur = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "livreur")).first()
    const galerie = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", "galerie")).collect()
    const s = await ctx.db.query("siteSettings").first()
    const settings = { heroTitle: s?.heroTitle ?? "", heroText: s?.heroText ?? "", annonce: s?.annonce ?? "" }
    return { ok: true as const, items, une, hero, zones, bandeau, livreur, galerie, settings }
  },
})

export const updateItem = mutation({
  args: { itemId: v.id("menuItems"), price: v.optional(v.number()), active: v.optional(v.boolean()), description: v.optional(v.string()), name: v.optional(v.string()), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const patch: Record<string, unknown> = {}
    if (args.price !== undefined) {
      if (!Number.isFinite(args.price) || args.price < 0 || args.price > 500) return { ok: false as const, code: "INVALID", message: "Prix invalide." }
      patch.price = Math.round(args.price * 100) / 100
    }
    if (args.active !== undefined) patch.active = args.active
    if (args.description !== undefined) patch.description = clean(args.description, 160)
    if (args.name !== undefined && clean(args.name, 80)) patch.name = clean(args.name, 80)
    if (args.category !== undefined && clean(args.category, 60)) patch.category = clean(args.category, 60)
    await ctx.db.patch(args.itemId, patch)
    return { ok: true as const }
  },
})

export const addItem = mutation({
  args: { name: v.string(), category: v.string(), price: v.number(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    if (!clean(args.name, 80) || !clean(args.category, 60) || !(args.price >= 0 && args.price <= 500)) return { ok: false as const, code: "INVALID", message: "Nom, catégorie ou prix invalide." }
    const last = await ctx.db.query("menuItems").withIndex("by_position").order("desc").first()
    await ctx.db.insert("menuItems", { name: clean(args.name, 80), category: clean(args.category, 60), price: Math.round(args.price * 100) / 100, description: clean(args.description, 160), position: (last?.position ?? 0) + 1, active: true })
    return { ok: true as const }
  },
})

export const updateZone = mutation({
  args: { zoneId: v.id("zones"), fee: v.number(), delai: v.string() },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    if (!(args.fee >= 0 && args.fee <= 50)) return { ok: false as const, code: "INVALID", message: "Frais invalides." }
    await ctx.db.patch(args.zoneId, { fee: Math.round(args.fee * 100) / 100, delai: clean(args.delai, 30) })
    return { ok: true as const }
  },
})

export const updatePromoText = mutation({
  args: { promoId: v.id("promos"), title: v.string(), subtitle: v.string() },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    await ctx.db.patch(args.promoId, { title: clean(args.title, 60), subtitle: clean(args.subtitle, 100) })
    return { ok: true as const }
  },
})

export const updateSettings = mutation({
  args: { heroTitle: v.string(), heroText: v.string(), annonce: v.string() },
  handler: async (ctx, a) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const row = { heroTitle: clean(a.heroTitle, 80), heroText: clean(a.heroText, 200), annonce: clean(a.annonce, 160) }
    const s = await ctx.db.query("siteSettings").first()
    if (s) await ctx.db.patch(s._id, row)
    else await ctx.db.insert("siteSettings", row)
    return { ok: true as const }
  },
})

/** Suppression définitive d'un plat (les commandes passées gardent son nom et son prix). Renvoie la photo à effacer. */
export const deleteItemInternal = internalMutation({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, a) => {
    const it = await ctx.db.get(a.itemId)
    if (!it) return null
    await ctx.db.delete(a.itemId)
    return it.imageFileId ?? null
  },
})

// ---------- Aides internes pour les photos (appelées par appFiles.ts après vérification du rôle)
export const getItemInternal = internalQuery({ args: { itemId: v.id("menuItems") }, handler: (ctx, a) => ctx.db.get(a.itemId) })
export const getPromoInternal = internalQuery({ args: { promoId: v.id("promos") }, handler: (ctx, a) => ctx.db.get(a.promoId) })

export const setItemImage = internalMutation({
  args: { itemId: v.id("menuItems"), imageUrl: v.optional(v.string()), imageFileId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const item = await ctx.db.get(a.itemId)
    if (!item) return null
    await ctx.db.patch(a.itemId, { imageUrl: a.imageUrl, imageFileId: a.imageFileId, imageCleanupFileId: item.imageFileId })
    return item.imageFileId ?? null
  },
})
export const clearItemCleanup = internalMutation({ args: { itemId: v.id("menuItems") }, handler: (ctx, a) => ctx.db.patch(a.itemId, { imageCleanupFileId: undefined }) })

export const addPromo = internalMutation({
  args: { kind: v.union(v.literal("hero"), v.literal("une"), v.literal("bandeau"), v.literal("livreur"), v.literal("galerie")), imageUrl: v.string(), imageFileId: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, a) => {
    let oldFileId: string | null = null
    // Emplacements uniques (une seule photo à la fois) : la nouvelle remplace l'ancienne
    if (a.kind === "hero" || a.kind === "bandeau" || a.kind === "livreur") {
      const old = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", a.kind)).first()
      if (old) { oldFileId = old.imageFileId ?? null; await ctx.db.delete(old._id) }
    }
    const last = await ctx.db.query("promos").withIndex("by_kind", (q) => q.eq("kind", a.kind)).order("desc").first()
    await ctx.db.insert("promos", { kind: a.kind, imageUrl: a.imageUrl, imageFileId: a.imageFileId, title: clean(a.title, 60), position: a.kind === "une" || a.kind === "galerie" ? -Date.now() : (last?.position ?? 0) + 1 })
    return oldFileId
  },
})
export const deletePromoInternal = internalMutation({
  args: { promoId: v.id("promos") },
  handler: async (ctx, a) => {
    const p = await ctx.db.get(a.promoId)
    if (!p) return null
    await ctx.db.delete(a.promoId)
    return p.imageFileId ?? null
  },
})

// ---------- Données de départ (exécuté une seule fois)
const IMG = "https://assets.macaly-user-data.dev/zgfxow2hgzl8wsnnzizdoesa/tbvviwl9i723zscfyynjrjtl/"
const P = {
  hero: IMG + "3wfyFH065cttc6nbeOdNz/hero-o6TtXnDE.webp",
  livreur: IMG + "ffWYIa9QwpkG2fdVbJa0Y/livreur-L5-2h9Xt.webp",
  romazava: IMG + "u9iHl0LgAf_F8oaY3WSIh/romazava-o1Pypi8A.webp",
  mataba: IMG + "atZmyPCMdf_PcVkVhS_yZ/mataba-Bd0wrdIY.webp",
  tacos: IMG + "WHBOAmYstQ6sQd96qQ5G_/tacos-o78iwCRE.webp",
  wings: IMG + "UotbPqVIMPNna_XRnWQRp/wings-Hte9lCG5.webp",
  cuisse: IMG + "OdrzCC2xSZfJ5R9a1apCS/cuisse-FMj5BdJT.webp",
  alloco: IMG + "fsA20k9ie0zF8mIVcLElH/alloco-HYUllt-a.webp",
  samoussas: IMG + "9trytAAqq-3A2NvTGqvd1/samoussas-5ws7eWm9.webp",
  viande: IMG + "6yfYNaS7zyGAuFx8doEcy/viande-FtNQwGog.webp",
  boissons: IMG + "clR2ZV9SdG0E2F447LzVL/boissons-vnP5VJRR.webp",
  frites: IMG + "usN1n6wDkzImuibRTD13Z/frites-9wc7PnHz.webp",
}

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("menuItems").first()) return "déjà initialisé"
    const items: [string, string, number, string, string?][] = [
      ["Samoussas poulet x4", "Entrées", 2, "Croustillants, farce au poulet", P.samoussas],
      ["Pastel viande hachée x3", "Entrées", 2.2, "Chaussons dorés à la viande hachée"],
      ["Samoussas bœuf", "Entrées", 2, "Croustillants, farce au bœuf", P.samoussas],
      ["Romazava bœuf", "Plats mahorais", 13, "Mijoté de brèdes et bœuf, riz blanc", P.romazava],
      ["Mataba poisson", "Plats mahorais", 13, "Feuilles de manioc au coco et poisson", P.mataba],
      ["Mtsolola bœuf tripes", "Plats mahorais", 14, "Plat complet traditionnel"],
      ["Cuisse au four", "Plats mahorais", 12, "Cuisse de poulet rôtie, riz blanc", P.cuisse],
      ["Côte de bœuf maturée 400g", "Grillades", 32, "Sauce au poivre, frites", P.viande],
      ["Entrecôte maturée 250g", "Grillades", 25, "Sauce au poivre, frites", P.viande],
      ["Gigot d'agneau poêlé", "Grillades", 18, "Sauce au poivre"],
      ["Tacos M", "Snacks", 8, "Viande et sauce au choix, frites", P.tacos],
      ["Tacos L", "Snacks", 9, "Viande et sauce au choix, frites", P.tacos],
      ["Tacos XL", "Snacks", 13, "Viande et sauce au choix, frites", P.tacos],
      ["Wings x8", "Snacks", 7.5, "Ailes de poulet croustillantes", P.wings],
      ["Wings x16", "Snacks", 15.5, "Ailes de poulet croustillantes", P.wings],
      ["Menu solo wings", "Snacks", 11.5, "7 wings, frites, boisson", P.wings],
      ["+ Frites", "Accompagnements", 3, "", P.frites],
      ["+ Alloco", "Accompagnements", 5, "Banane plantain dorée", P.alloco],
      ["Coca-Cola 33 cl", "Boissons", 2, "", P.boissons],
      ["Jus tropical", "Boissons", 2.5, "", P.boissons],
      ["Eau pétillante", "Boissons", 2, "", P.boissons],
    ]
    let pos = 1
    for (const [name, category, price, description, imageUrl] of items)
      await ctx.db.insert("menuItems", { name, category, price, description, imageUrl, position: pos++, active: true })
    // Coordonnées approximatives (centre des quartiers) pour l'estimation du temps de trajet
    const zones: [string, number, string, number, number][] = [
      ["Mamoudzou centre", 2, "20–30 min", -12.7806, 45.2279],
      ["Cavani", 2, "20–30 min", -12.7895, 45.2215],
      ["Mtsapéré", 2.5, "25–35 min", -12.7920, 45.2140],
      ["Kawéni", 2.5, "25–35 min", -12.7640, 45.2210],
      ["Doujani / Mgombani", 3, "30–40 min", -12.8030, 45.2120],
      ["Passamaïnty", 3, "30–40 min", -12.8070, 45.2270],
      ["Tsoundzou 1 et 2", 3.5, "35–45 min", -12.8130, 45.2030],
      ["Vahibé", 4, "40–50 min", -12.8080, 45.1900],
      ["Majicavo", 4, "40–50 min", -12.7420, 45.2160],
    ]
    pos = 1
    for (const [name, fee, delai, lat, lng] of zones) await ctx.db.insert("zones", { name, fee, delai, lat, lng, position: pos++ })
    await ctx.db.insert("promos", { kind: "hero", imageUrl: P.hero, position: 1 })
    await ctx.db.insert("promos", { kind: "une", title: "Suivez votre livreur", subtitle: "Sa position en direct sur la carte", imageUrl: P.livreur, position: 1 })
    await ctx.db.insert("promos", { kind: "une", title: "Plats mahorais", subtitle: "Romazava, mataba, mtsolola", imageUrl: P.romazava, position: 2 })
    await ctx.db.insert("promos", { kind: "une", title: "Tacos généreux", subtitle: "Préparés à la commande, dès 8 €", imageUrl: P.tacos, position: 3 })
    await ctx.db.insert("promos", { kind: "une", title: "Grillades maturées", subtitle: "Sauce au poivre maison", imageUrl: P.viande, position: 4 })
    return "ok"
  },
})

// ---------- Zones de livraison de Loulou Barquette (coordonnées approximatives du centre de chaque quartier)
export const ZONES_LOULOU: [string, number, string, number, number][] = [
  ["Tsoundzou 1 et 2", 1.5, "15–25 min", -12.8135, 45.2025],
  ["Ironi Bé", 3, "25–35 min", -12.8360, 45.1960],
  ["Passamaïnty / Doujani", 3, "25–35 min", -12.8030, 45.2085],
  ["Mtsapéré / Cavani", 3.5, "30–40 min", -12.7905, 45.2175],
  ["Mgombani / Mamoudzou", 4, "30–45 min", -12.7815, 45.2270],
  ["Kawéni", 4.5, "35–50 min", -12.7640, 45.2210],
  ["Hauts Vallons", 5, "40–55 min", -12.7555, 45.2120],
]

/** Remplace la grille des zones par celle du restaurant (exécuté une fois). */
export const resetZones = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const z of await ctx.db.query("zones").collect()) await ctx.db.delete(z._id)
    let pos = 1
    for (const [name, fee, delai, lat, lng] of ZONES_LOULOU) await ctx.db.insert("zones", { name, fee, delai, lat, lng, position: pos++ })
    return ZONES_LOULOU.length
  },
})
