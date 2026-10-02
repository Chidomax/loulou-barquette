import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { clean, gate, rateLimit } from "./lib"

/*
 * Qui agit ?
 * - Responsable, équipe et livreurs : compte personnel (code reçu par e-mail).
 * - Accès cuisine partagé (tablette du restaurant) : identifiant + mot de passe définis par le responsable,
 *   puis prénom + code personnel de l'employé pour chaque prise de service. Aucun droit responsable sur cet accès.
 * Chaque fonction sensible vérifie ces droits côté serveur.
 */

export type Kind = "admin" | "staff" | "driver" | "kitchen"
export type Actor =
  | { ok: true; kind: Kind; label: string; userId?: Id<"users">; employeeId?: Id<"employees">; sessionId?: Id<"kitchenSessions"> }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "EMPLOYEE"; message: string }

const KITCHEN_SESSION_DAYS = 30
const SHORT_SESSION_HOURS = 12
const EMPLOYEE_SHIFT_HOURS = 12
const PBKDF2_ITERATIONS = 120_000

// ---------- Outils cryptographiques (Web Crypto)
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("")
function randomHex(bytes: number) { const b = new Uint8Array(bytes); crypto.getRandomValues(b); return hex(b) }
export async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))) }
async function pbkdf2(secret: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"])
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, key, 256))
}
/** Comparaison à temps constant (évite de deviner une empreinte caractère par caractère). */
function same(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 }

// ---------- Vérification de l'acteur (comptes personnels ou accès cuisine)
async function findSession(ctx: QueryCtx | MutationCtx, kt: string) {
  if (!/^[0-9a-f]{64}$/.test(kt)) return null
  const h = await sha256(kt)
  const s = await ctx.db.query("kitchenSessions").withIndex("by_hash", (q) => q.eq("tokenHash", h)).first()
  if (!s || s.revokedAt || s.expiresAt < Date.now()) return null
  return s
}

/**
 * Vérifie que l'appelant a l'un des rôles autorisés.
 * kt : jeton de l'accès cuisine partagé (stocké sur l'appareil du restaurant).
 * needEmployee : pour l'accès cuisine, exige qu'un employé se soit identifié (prénom + code).
 */
export async function actor(ctx: QueryCtx | MutationCtx, kt: string | undefined, allowed: Kind[], needEmployee = false): Promise<Actor> {
  if (kt) {
    if (!allowed.includes("kitchen")) return { ok: false, code: "FORBIDDEN", message: "Cette action est réservée au responsable." }
    const s = await findSession(ctx, kt)
    if (!s) return { ok: false, code: "UNAUTHENTICATED", message: "Accès cuisine expiré ou retiré. Reconnectez l'appareil." }
    let emp: Doc<"employees"> | null = null
    if (s.employeeId && (s.employeeUntil ?? 0) > Date.now()) {
      emp = await ctx.db.get(s.employeeId)
      if (emp && !emp.active) emp = null
    }
    if (needEmployee && !emp) return { ok: false, code: "EMPLOYEE", message: "Indiquez qui est en service : prénom et code personnel." }
    return { ok: true, kind: "kitchen", label: emp ? `${emp.prenom} (cuisine)` : "Accès cuisine", employeeId: emp?._id, sessionId: s._id }
  }
  const g = await gate(ctx, allowed.filter((k) => k !== "kitchen") as ("admin" | "staff" | "driver")[])
  if (!g.ok) return g
  return { ok: true, kind: g.role, label: g.user.name || g.user.email || "Compte", userId: g.user._id }
}

const KIND_LABEL: Record<Kind, Doc<"auditLog">["actorKind"]> = { admin: "responsable", staff: "equipe", driver: "livreur", kitchen: "cuisine" }

/** Trace une action dans l'historique (jamais modifié ni supprimé par l'application). */
export async function audit(ctx: MutationCtx, a: Extract<Actor, { ok: true }> | "systeme", action: string, extra: { order?: Doc<"orders">; detail?: string; motif?: string } = {}) {
  await ctx.db.insert("auditLog", {
    action,
    orderId: extra.order?._id,
    orderNum: extra.order?.num,
    actor: a === "systeme" ? "Système" : a.label,
    actorKind: a === "systeme" ? "systeme" : KIND_LABEL[a.kind],
    detail: extra.detail ? clean(extra.detail, 300) : undefined,
    motif: extra.motif ? clean(extra.motif, 200) : undefined,
  })
}

// ---------- Accès cuisine : réglage par le responsable
export const isAdmin = internalQuery({ args: {}, handler: async (ctx) => (await gate(ctx, ["admin"])).ok })

export const kitchenConfig = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const k = await ctx.db.query("kitchenAccess").first()
    const sessions = (await ctx.db.query("kitchenSessions").collect())
      .filter((s) => !s.revokedAt && s.expiresAt > Date.now())
      .map((s) => ({ _id: s._id, label: s.label, since: s._creationTime, lastSeenAt: s.lastSeenAt }))
    const employees = (await ctx.db.query("employees").collect()).map((e) => ({ _id: e._id, prenom: e.prenom, active: e.active, locked: (e.lockedUntil ?? 0) > Date.now() }))
    return { ok: true as const, login: k?.login ?? "", configured: !!k, sessions, employees }
  },
})

/** Définit l'identifiant et le mot de passe de l'accès cuisine. Un changement ferme toutes les sessions cuisine. */
export const setKitchenAccess = action({
  args: { login: v.string(), password: v.string() },
  handler: async (ctx, a): Promise<{ ok: boolean; message: string }> => {
    if (!(await getAuthUserId(ctx)) || !(await ctx.runQuery(internal.access.isAdmin, {}))) return { ok: false, message: "Réservé au responsable." }
    const login = clean(a.login, 60)
    if (login.length < 3) return { ok: false, message: "Identifiant trop court (3 caractères minimum)." }
    if (a.password.length < 10 || a.password.length > 128) return { ok: false, message: "Mot de passe : 10 caractères minimum." }
    if (/^(.)\1+$/.test(a.password) || /^(0123456789|1234567890|azertyuiop|motdepasse)/i.test(a.password)) return { ok: false, message: "Mot de passe trop simple." }
    const salt = randomHex(16)
    const passwordHash = await pbkdf2(a.password, salt, PBKDF2_ITERATIONS)
    await ctx.runMutation(internal.access.storeKitchenAccess, { login, passwordHash, salt, iterations: PBKDF2_ITERATIONS })
    return { ok: true, message: "Accès cuisine enregistré. Les appareils déjà connectés doivent se reconnecter." }
  },
})

export const storeKitchenAccess = internalMutation({
  args: { login: v.string(), passwordHash: v.string(), salt: v.string(), iterations: v.number() },
  handler: async (ctx, a) => {
    const k = await ctx.db.query("kitchenAccess").first()
    if (k) await ctx.db.patch(k._id, { ...a, failed: 0, lockedUntil: undefined })
    else await ctx.db.insert("kitchenAccess", { ...a, failed: 0 })
    const now = Date.now()
    for (const s of await ctx.db.query("kitchenSessions").collect()) if (!s.revokedAt) await ctx.db.patch(s._id, { revokedAt: now })
    const admin = await gateActor(ctx)
    if (admin) await audit(ctx, admin, "Accès cuisine modifié", { detail: `Identifiant : ${a.login}. Toutes les sessions cuisine fermées.` })
  },
})

async function gateActor(ctx: MutationCtx) {
  const g = await gate(ctx, ["admin"])
  return g.ok ? ({ ok: true, kind: "admin", label: g.user.name || g.user.email || "Responsable", userId: g.user._id } as const) : null
}

export const revokeSession = mutation({
  args: { sessionId: v.optional(v.id("kitchenSessions")) },
  handler: async (ctx, { sessionId }) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const now = Date.now()
    const list = sessionId ? [await ctx.db.get(sessionId)] : await ctx.db.query("kitchenSessions").collect()
    let n = 0
    for (const s of list) if (s && !s.revokedAt) { await ctx.db.patch(s._id, { revokedAt: now }); n++ }
    await audit(ctx, { ok: true, kind: "admin", label: g.user.name || g.user.email || "Responsable" }, sessionId ? "Appareil cuisine déconnecté" : "Tous les appareils cuisine déconnectés", { detail: `${n} session(s)` })
    return { ok: true as const }
  },
})

// ---------- Connexion d'un appareil cuisine
export const kitchenLoginInfo = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("kitchenAccess").first(),
})

export const kitchenLogin = action({
  args: { login: v.string(), password: v.string(), remember: v.boolean(), label: v.string() },
  handler: async (ctx, a): Promise<{ ok: true; token: string } | { ok: false; message: string }> => {
    const gateOk = await ctx.runMutation(internal.access.loginAttempt, {})
    if (!gateOk) return { ok: false, message: "Trop de tentatives. Réessayez dans 15 minutes ou contactez le responsable." }
    const k = await ctx.runQuery(internal.access.kitchenLoginInfo, {})
    if (!k) return { ok: false, message: "L'accès cuisine n'est pas encore configuré par le responsable." }
    if ((k.lockedUntil ?? 0) > Date.now()) return { ok: false, message: "Accès cuisine verrouillé après plusieurs erreurs. Réessayez dans 15 minutes." }
    const hash = await pbkdf2(a.password, k.salt, k.iterations)
    const good = clean(a.login, 60).toLowerCase() === k.login.toLowerCase() && same(hash, k.passwordHash)
    if (!good) { await ctx.runMutation(internal.access.loginFailed, {}); return { ok: false, message: "Identifiant ou mot de passe incorrect." } }
    const token = randomHex(32)
    await ctx.runMutation(internal.access.openSession, { tokenHash: await sha256(token), remember: a.remember, label: clean(a.label, 60) || "Appareil" })
    return { ok: true, token }
  },
})

export const loginAttempt = internalMutation({ args: {}, handler: async (ctx) => await rateLimit(ctx, "kitchen:login", 10, 15 * 60_000) })

export const loginFailed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const k = await ctx.db.query("kitchenAccess").first()
    if (!k) return
    const failed = k.failed + 1
    await ctx.db.patch(k._id, failed >= 5 ? { failed: 0, lockedUntil: Date.now() + 15 * 60_000 } : { failed })
    await audit(ctx, "systeme", failed >= 5 ? "Accès cuisine verrouillé 15 min" : "Échec de connexion cuisine")
  },
})

export const openSession = internalMutation({
  args: { tokenHash: v.string(), remember: v.boolean(), label: v.string() },
  handler: async (ctx, a) => {
    const now = Date.now()
    const k = await ctx.db.query("kitchenAccess").first()
    if (k) await ctx.db.patch(k._id, { failed: 0 })
    await ctx.db.insert("kitchenSessions", { tokenHash: a.tokenHash, label: a.label, lastSeenAt: now, expiresAt: now + (a.remember ? KITCHEN_SESSION_DAYS * 24 : SHORT_SESSION_HOURS) * 3600_000 })
    await audit(ctx, "systeme", "Appareil cuisine connecté", { detail: a.label })
  },
})

/** État de l'appareil cuisine (pour l'écran) : session valide ? employé en service ? */
export const kitchenMe = query({
  args: { kt: v.string() },
  handler: async (ctx, { kt }) => {
    const s = await findSession(ctx, kt)
    if (!s) return { ok: false as const }
    let employee: { _id: Id<"employees">; prenom: string } | null = null
    if (s.employeeId && (s.employeeUntil ?? 0) > Date.now()) {
      const e = await ctx.db.get(s.employeeId)
      if (e?.active) employee = { _id: e._id, prenom: e.prenom }
    }
    const employees = (await ctx.db.query("employees").collect()).filter((e) => e.active).map((e) => ({ _id: e._id, prenom: e.prenom }))
    return { ok: true as const, label: s.label, employee, employees }
  },
})

export const kitchenLogout = mutation({
  args: { kt: v.string() },
  handler: async (ctx, { kt }) => {
    const s = await findSession(ctx, kt)
    if (s) await ctx.db.patch(s._id, { revokedAt: Date.now() })
    return { ok: true as const }
  },
})

// ---------- Employés (prénom + code personnel)
export const saveEmployee = action({
  args: { employeeId: v.optional(v.id("employees")), prenom: v.string(), pin: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ ok: boolean; message: string }> => {
    if (!(await getAuthUserId(ctx)) || !(await ctx.runQuery(internal.access.isAdmin, {}))) return { ok: false, message: "Réservé au responsable." }
    const prenom = clean(a.prenom, 30)
    if (prenom.length < 2) return { ok: false, message: "Indiquez le prénom." }
    if (!a.employeeId && !a.pin) return { ok: false, message: "Choisissez un code personnel." }
    if (a.pin !== undefined && !/^\d{4,6}$/.test(a.pin)) return { ok: false, message: "Code personnel : 4 à 6 chiffres." }
    if (a.pin && /^(\d)\1+$|^(0123|1234|2345|3456|4567|5678|6789)/.test(a.pin)) return { ok: false, message: "Code trop simple (évitez 1111 ou 1234)." }
    let pin: { pinHash: string; salt: string } | undefined
    if (a.pin) { const salt = randomHex(16); pin = { salt, pinHash: await pbkdf2(a.pin, salt, PBKDF2_ITERATIONS) } }
    return await ctx.runMutation(internal.access.storeEmployee, { employeeId: a.employeeId, prenom, ...pin })
  },
})

export const storeEmployee = internalMutation({
  args: { employeeId: v.optional(v.id("employees")), prenom: v.string(), pinHash: v.optional(v.string()), salt: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = await gateActor(ctx)
    if (!admin) return { ok: false, message: "Réservé au responsable." }
    if (a.employeeId) {
      await ctx.db.patch(a.employeeId, { prenom: a.prenom, ...(a.pinHash ? { pinHash: a.pinHash, salt: a.salt!, failed: 0, lockedUntil: undefined } : {}) })
      await audit(ctx, admin, a.pinHash ? "Code employé réinitialisé" : "Employé modifié", { detail: a.prenom })
      return { ok: true, message: a.pinHash ? "Code personnel réinitialisé." : "Employé modifié." }
    }
    await ctx.db.insert("employees", { prenom: a.prenom, pinHash: a.pinHash!, salt: a.salt!, active: true, failed: 0 })
    await audit(ctx, admin, "Employé ajouté", { detail: a.prenom })
    return { ok: true, message: `${a.prenom} peut prendre son service sur l'accès cuisine.` }
  },
})

/** Désactive un employé : il ne peut plus s'identifier, sans déconnecter l'appareil cuisine. */
export const setEmployeeActive = mutation({
  args: { employeeId: v.id("employees"), active: v.boolean() },
  handler: async (ctx, a) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const e = await ctx.db.get(a.employeeId)
    if (!e) return { ok: false as const, code: "NOT_FOUND", message: "Employé introuvable." }
    await ctx.db.patch(a.employeeId, { active: a.active })
    if (!a.active) for (const s of await ctx.db.query("kitchenSessions").collect()) if (s.employeeId === a.employeeId) await ctx.db.patch(s._id, { employeeId: undefined, employeeUntil: undefined })
    await audit(ctx, { ok: true, kind: "admin", label: g.user.name || g.user.email || "Responsable" }, a.active ? "Employé réactivé" : "Accès employé retiré", { detail: e.prenom })
    return { ok: true as const }
  },
})

export const employeeForPin = internalQuery({
  args: { kt: v.string(), employeeId: v.id("employees") },
  handler: async (ctx, a) => {
    const s = await findSession(ctx, a.kt)
    const e = await ctx.db.get(a.employeeId)
    return s && e ? { sessionId: s._id, e } : null
  },
})

/** Prise de service sur l'appareil cuisine : prénom + code personnel (5 erreurs = verrouillage 15 min). */
export const startShift = action({
  args: { kt: v.string(), employeeId: v.id("employees"), pin: v.string() },
  handler: async (ctx, a): Promise<{ ok: boolean; message: string }> => {
    const r = await ctx.runQuery(internal.access.employeeForPin, { kt: a.kt, employeeId: a.employeeId })
    if (!r) return { ok: false, message: "Appareil non connecté ou employé introuvable." }
    if (!r.e.active) return { ok: false, message: "Cet accès a été retiré par le responsable." }
    if ((r.e.lockedUntil ?? 0) > Date.now()) return { ok: false, message: "Code bloqué après plusieurs erreurs. Réessayez dans 15 minutes ou demandez au responsable." }
    if (!/^\d{4,6}$/.test(a.pin)) return { ok: false, message: "Code incorrect." }
    const good = same(await pbkdf2(a.pin, r.e.salt, PBKDF2_ITERATIONS), r.e.pinHash)
    return await ctx.runMutation(internal.access.shiftResult, { sessionId: r.sessionId, employeeId: a.employeeId, good })
  },
})

export const shiftResult = internalMutation({
  args: { sessionId: v.id("kitchenSessions"), employeeId: v.id("employees"), good: v.boolean() },
  handler: async (ctx, a) => {
    const e = await ctx.db.get(a.employeeId)
    if (!e) return { ok: false, message: "Employé introuvable." }
    if (!a.good) {
      const failed = e.failed + 1
      await ctx.db.patch(e._id, failed >= 5 ? { failed: 0, lockedUntil: Date.now() + 15 * 60_000 } : { failed })
      await audit(ctx, "systeme", failed >= 5 ? "Code employé bloqué 15 min" : "Code employé incorrect", { detail: e.prenom })
      return { ok: false, message: failed >= 5 ? "Code bloqué pour 15 minutes." : `Code incorrect (${5 - failed} essai${5 - failed > 1 ? "s" : ""} restant${5 - failed > 1 ? "s" : ""}).` }
    }
    const now = Date.now()
    await ctx.db.patch(e._id, { failed: 0, lockedUntil: undefined })
    await ctx.db.patch(a.sessionId, { employeeId: e._id, employeeUntil: now + EMPLOYEE_SHIFT_HOURS * 3600_000, lastSeenAt: now })
    await audit(ctx, "systeme", "Prise de service", { detail: e.prenom })
    return { ok: true, message: `Bon service, ${e.prenom} !` }
  },
})

export const endShift = mutation({
  args: { kt: v.string() },
  handler: async (ctx, { kt }) => {
    const s = await findSession(ctx, kt)
    if (!s) return { ok: false as const }
    const e = s.employeeId ? await ctx.db.get(s.employeeId) : null
    await ctx.db.patch(s._id, { employeeId: undefined, employeeUntil: undefined })
    if (e) await audit(ctx, "systeme", "Fin de service", { detail: e.prenom })
    return { ok: true as const }
  },
})

// ---------- Historique (responsable : tout ; équipe : commandes du jour seulement, via orders.staffList)
export const auditList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const rows = await ctx.db.query("auditLog").order("desc").take(Math.min(Math.max(limit ?? 200, 1), 500))
    return { ok: true as const, rows }
  },
})
