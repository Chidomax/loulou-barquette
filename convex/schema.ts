import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export const roleValidator = v.union(v.literal("admin"), v.literal("staff"), v.literal("driver"))

export const orderStatus = v.union(
  v.literal("attente_paiement"),
  v.literal("recue"),
  v.literal("preparation"),
  v.literal("prete"),
  v.literal("en_livraison"),
  v.literal("livree"),
  v.literal("recuperee"),
  v.literal("annulee"),
)

// Options d'un plat (ex. tacos) : groupes de choix définis par le responsable
export const optionChoice = v.object({
  id: v.string(),
  label: v.string(),
  price: v.number(), // supplément en euros (0 si inclus)
  ingredientId: v.optional(v.id("ingredients")), // ingrédient partagé : sa rupture touche tous les produits
  off: v.optional(v.boolean()), // choix indisponible (sans ingrédient suivi)
  exclusive: v.optional(v.boolean()), // ex. « Sans sauce » : retire les autres choix du groupe
  count: v.optional(v.number()), // ex. taille M = 1 viande
  sub: v.optional(v.object({ label: v.string(), choices: v.array(v.object({ id: v.string(), label: v.string() })) })),
})
export const optionGroup = v.object({
  id: v.string(),
  label: v.string(),
  min: v.number(),
  max: v.number(),
  repeat: v.optional(v.boolean()), // même choix plusieurs fois (ex. poulet × 2)
  countFrom: v.optional(v.string()), // nombre requis donné par le choix d'un autre groupe (ex. taille)
  showIf: v.optional(v.object({ group: v.string(), choice: v.string() })),
  choices: v.array(optionChoice),
})

export const actorKind = v.union(v.literal("responsable"), v.literal("equipe"), v.literal("livreur"), v.literal("cuisine"), v.literal("systeme"))

export default defineSchema({
  ...authTables,

  // Comptes de l'équipe (connexion par code e-mail). Les clients n'ont pas de compte.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleValidator),
    // Profil client (facultatif)
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    defaultZone: v.optional(v.string()),
    defaultAddress: v.optional(v.string()),
    loyaltyPoints: v.optional(v.number()),
  }).index("email", ["email"]),

  // Invitations : le gérant ajoute une adresse e-mail et un rôle ; le rôle est attribué à la première connexion.
  invites: defineTable({
    email: v.string(),
    role: roleValidator,
    displayName: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  }).index("by_email", ["email"]),

  menuItems: defineTable({
    name: v.string(),
    category: v.string(),
    price: v.number(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageFileId: v.optional(v.string()),
    imageCleanupFileId: v.optional(v.string()),
    position: v.number(),
    active: v.boolean(),
    // Rupture gérée par l'équipe pendant le service (durée limitée ou retour manuel)
    outOfStock: v.optional(v.boolean()),
    outUntil: v.optional(v.number()),
    outReason: v.optional(v.string()),
    optionGroups: v.optional(v.array(optionGroup)),
  }).index("by_position", ["position"]).index("by_name", ["name"]),

  // Ingrédients partagés entre plusieurs produits (viandes, sauces, suppléments, boissons…)
  ingredients: defineTable({
    name: v.string(),
    kind: v.string(),
    outOfStock: v.boolean(),
    outUntil: v.optional(v.number()),
    outReason: v.optional(v.string()),
    position: v.number(),
  }).index("by_position", ["position"]),

  zones: defineTable({
    name: v.string(),
    fee: v.number(),
    delai: v.string(),
    lat: v.number(),
    lng: v.number(),
    position: v.number(),
  }).index("by_position", ["position"]).index("by_name", ["name"]),

  // Visuels marketing (bannière, « À la une »)
  promos: defineTable({
    kind: v.union(v.literal("hero"), v.literal("une"), v.literal("bandeau"), v.literal("livreur"), v.literal("galerie")),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    imageUrl: v.string(),
    imageFileId: v.optional(v.string()),
    position: v.number(),
  }).index("by_kind", ["kind", "position"]),

  orders: defineTable({
    num: v.string(),
    trackingToken: v.string(),
    nom: v.string(),
    tel: v.string(),
    mode: v.union(v.literal("livraison"), v.literal("emporter"), v.literal("surplace")),
    zone: v.optional(v.string()),
    adresse: v.optional(v.string()),
    note: v.optional(v.string()),
    destLat: v.optional(v.number()),
    destLng: v.optional(v.number()),
    lignes: v.array(v.object({ article: v.string(), qte: v.number(), pu: v.number(), details: v.optional(v.array(v.string())) })),
    sousTotal: v.number(),
    frais: v.number(),
    total: v.number(),
    payMethod: v.union(v.literal("cb"), v.literal("tr"), v.literal("place")),
    emetteurTr: v.optional(v.string()),
    montantTr: v.number(),
    montantCb: v.number(),
    paidTr: v.number(),
    paidCb: v.number(),
    status: orderStatus,
    driverId: v.optional(v.id("users")),
    driverName: v.optional(v.string()),
    deliveryStartedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    anonymized: v.optional(v.boolean()),
    customerId: v.optional(v.id("users")),
    pointsAwarded: v.optional(v.number()),
    remise: v.optional(v.number()),
    pointsUsed: v.optional(v.number()),
    pointsRefunded: v.optional(v.boolean()),
    // Suivi en cuisine
    acceptedAt: v.optional(v.number()),
    promisedAt: v.optional(v.number()), // heure à laquelle la commande doit être prête
    readyAt: v.optional(v.number()),
    handedAt: v.optional(v.number()),
    handedTo: v.optional(v.union(v.literal("client"), v.literal("livreur"))),
    noteInterne: v.optional(v.string()),
    checked: v.optional(v.array(v.number())),
    refusReason: v.optional(v.string()),
    problems: v.optional(v.array(v.object({ type: v.string(), message: v.string(), at: v.number(), by: v.string() }))),
    printCount: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_token", ["trackingToken"])
    .index("by_status", ["status"])
    .index("by_driver", ["driverId", "status"]),

  // Paiements Stripe (alimentés par le webhook) — séparés par mode test/live
  payments: defineTable({
    orderId: v.id("orders"),
    sessionId: v.string(),
    part: v.union(v.literal("tr"), v.literal("cb")),
    amount: v.number(),
    status: v.union(v.literal("open"), v.literal("paid"), v.literal("expired")),
    mode: v.union(v.literal("test"), v.literal("live")),
  })
    .index("by_session", ["sessionId"])
    .index("by_order_and_mode", ["orderId", "mode"])
    .index("by_mode", ["mode"]),

  // Dernière position connue du livreur, uniquement pendant une livraison (effacée à la remise)
  driverLocations: defineTable({
    orderId: v.id("orders"),
    driverId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    heading: v.optional(v.number()),
    speed: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_order", ["orderId"]),

  // Limitation du nombre de requêtes (anti-abus)
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  counters: defineTable({ name: v.string(), value: v.number() }).index("by_name", ["name"]),

  // Réglages du service : ouverture, pause, horaires, acceptation automatique (une seule ligne)
  shopSettings: defineTable({
    open: v.boolean(),
    pausedUntil: v.optional(v.number()),
    pauseReason: v.optional(v.string()),
    autoAccept: v.boolean(),
    prepMinutes: v.number(),
    // 7 jours, du dimanche (0) au samedi (6) ; null = fermé
    hours: v.array(v.union(v.null(), v.object({ open: v.string(), close: v.string() }))),
  }),

  // Historique des actions (qui, quoi, quand, pourquoi). Jamais modifié ni supprimé par l'application.
  auditLog: defineTable({
    action: v.string(),
    orderId: v.optional(v.id("orders")),
    orderNum: v.optional(v.string()),
    actor: v.string(),
    actorKind,
    detail: v.optional(v.string()),
    motif: v.optional(v.string()),
  }).index("by_order", ["orderId"]),

  // Accès cuisine partagé (tablette, ordinateur du restaurant) : identifiant + mot de passe haché
  kitchenAccess: defineTable({
    login: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    iterations: v.number(),
    failed: v.number(),
    lockedUntil: v.optional(v.number()),
  }),
  kitchenSessions: defineTable({
    tokenHash: v.string(),
    label: v.string(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
    employeeId: v.optional(v.id("employees")),
    employeeUntil: v.optional(v.number()),
  }).index("by_hash", ["tokenHash"]),
  // Employés en cuisine : prénom + code personnel (haché) pour attribuer les actions
  employees: defineTable({
    prenom: v.string(),
    pinHash: v.string(),
    salt: v.string(),
    active: v.boolean(),
    failed: v.number(),
    lockedUntil: v.optional(v.number()),
  }),

  // Textes de la page d'accueil modifiables par le gérant (une seule ligne)
  siteSettings: defineTable({
    heroTitle: v.optional(v.string()),
    heroText: v.optional(v.string()),
    annonce: v.optional(v.string()),
  }),

  // Connexion au logiciel de caisse (une seule ligne). La clé de lecture n'est conservée que sous forme d'empreinte.
  posConfig: defineTable({
    webhookUrl: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    apiKeyHash: v.optional(v.string()),
    apiKeyHint: v.optional(v.string()),
    lastEvent: v.optional(v.string()),
    lastAt: v.optional(v.number()),
    lastOk: v.optional(v.boolean()),
    lastError: v.optional(v.string()),
  }),
})
