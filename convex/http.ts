import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { auth } from "./auth"
import { apiKeyHash } from "./caisse"

const http = httpRouter()

auth.addHttpRoutes(http)

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const signature = req.headers.get("stripe-signature")
    if (!signature) return new Response("missing signature", { status: 400 })
    const payload = await req.text()
    if (payload.length > 512_000) return new Response("too large", { status: 413 })
    const mode = (req.headers.get("x-stripe-mode") === "live" ? "live" : "test") as "test" | "live"
    const result = await ctx.runAction(internal.stripe.handleWebhook, { payload, signature, mode })
    return new Response(JSON.stringify({ received: result.success }), { status: result.success ? 200 : 400 })
  }),
})

// Lecture des commandes par le logiciel de caisse : GET /caisse/commandes?depuis=<horodatage ms>&format=json|csv
// En-tête obligatoire : Authorization: Bearer <clé créée dans l'espace équipe, onglet Caisse>
http.route({
  path: "/caisse/commandes",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = req.headers.get("authorization") ?? ""
    const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
    if (!/^lb_[0-9a-f]{48}$/.test(key)) return new Response(JSON.stringify({ erreur: "Clé manquante ou invalide" }), { status: 401, headers: { "Content-Type": "application/json" } })
    const check = await ctx.runMutation(internal.caisse.checkKey, { hash: await apiKeyHash(key) })
    if (check === "limit") return new Response(JSON.stringify({ erreur: "Trop de requêtes, réessayez dans une minute" }), { status: 429, headers: { "Content-Type": "application/json" } })
    if (check !== "ok") return new Response(JSON.stringify({ erreur: "Clé refusée" }), { status: 401, headers: { "Content-Type": "application/json" } })
    const url = new URL(req.url)
    const depuis = Number(url.searchParams.get("depuis") ?? "")
    const since = Number.isFinite(depuis) && depuis > 0 ? depuis : Date.now() - 24 * 3600_000
    const commandes = await ctx.runQuery(internal.caisse.listForPos, { since, limit: 200 })
    const noStore = { "Cache-Control": "no-store" }
    if (url.searchParams.get("format") === "csv") {
      const safe = (s: unknown) => { const t = String(s ?? ""); const n = /^[=+\-@\t\r]/.test(t) ? "'" + t : t; return '"' + n.replace(/"/g, '""') + '"' }
      const head = ["numero", "date", "statut", "mode", "quartier", "client", "telephone", "article", "quantite", "prix_unitaire", "total_ligne", "frais_livraison", "remise", "total_commande", "paiement", "reste_a_encaisser"]
      const rows = commandes.flatMap((c) => c.lignes.map((l) => [c.numero, c.creeLe, c.statutLibelle, c.mode, c.quartier, c.client.nom, c.client.telephone, l.article, l.quantite, l.prixUnitaire.toFixed(2), l.total.toFixed(2), c.fraisLivraison.toFixed(2), c.remise.toFixed(2), c.total.toFixed(2), c.paiement.methode, c.paiement.resteAEncaisser.toFixed(2)]))
      const csv = "\ufeff" + [head, ...rows].map((r) => r.map(safe).join(";")).join("\r\n")
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", ...noStore } })
    }
    return new Response(JSON.stringify({ commandes, prochainDepuis: commandes.length ? Date.parse(commandes[commandes.length - 1].creeLe) : since }), { headers: { "Content-Type": "application/json; charset=utf-8", ...noStore } })
  }),
})

export default http
