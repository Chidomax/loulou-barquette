import { useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { api } from '@/convex/_generated/api'

const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast.success('Copié')) }

export function PosAdmin() {
  const cfg = useQuery(api.caisse.config, {})
  const save = useMutation(api.caisse.saveWebhook)
  const newSecret = useAction(api.caisse.newSecret)
  const sendTest = useAction(api.caisse.sendTest)
  const createKey = useAction(api.caisse.createApiKey)
  const revoke = useMutation(api.caisse.revokeApiKey)
  const [url, setUrl] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (cfg && cfg.ok && !loaded) { setUrl(cfg.webhookUrl); setLoaded(true) } }, [cfg, loaded])

  if (cfg === undefined) return <p className="text-muted-foreground">Chargement…</p>
  if (!cfg.ok) return <p className="text-destructive">{cfg.message}</p>

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const secret = cfg && cfg.ok && cfg.webhookSecret ? undefined : (await newSecret({})).secret
      const r = await save({ url, secret })
      if (r.ok) toast.success(r.message ?? 'Enregistré'); else toast.error(r.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Relier votre logiciel de caisse</h2>
        <p className="mt-1 text-sm text-muted-foreground">Le site fonctionne avec toutes les caisses. Choisissez la façon qui convient à la vôtre : votre prestataire de caisse saura laquelle utiliser.</p>
      </div>

      <section className="space-y-3 rounded-[1.25rem] bg-secondary p-5">
        <h3 className="text-lg font-bold">Sans configuration</h3>
        <p className="text-sm">Dans l'onglet Commandes : <b>Tickets cuisine</b> imprime les commandes sur n'importe quelle imprimante (tickets 58 ou 80 mm), et <b>CSV pour la caisse</b> télécharge les commandes dans un fichier que toutes les caisses et tous les tableurs savent importer.</p>
      </section>

      <form onSubmit={saveUrl} className="space-y-3 rounded-[1.25rem] bg-secondary p-5">
        <h3 className="text-lg font-bold">Envoi automatique à la caisse</h3>
        <p className="text-sm">Chaque commande est envoyée à votre caisse dès qu'elle est confirmée, puis à chaque étape (préparation, prête, livrée, annulée). Collez ici l'adresse de réception fournie par votre caisse ou votre prestataire (Zapier, Make…).</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" placeholder="https://…" className="w-full rounded-lg border bg-background px-3 py-2" />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{url ? 'Enregistrer' : 'Désactiver'}</button>
          {cfg.webhookUrl && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const r = await sendTest({}); if (r.ok) toast.success(r.message); else toast.error(r.message) } finally { setBusy(false) } }} className="rounded-full border bg-background px-5 py-2 text-sm font-semibold">Envoyer une commande de test</button>}
        </div>
        {cfg.webhookSecret && (
          <div className="text-sm">
            <p className="font-semibold">Secret de signature</p>
            <p className="text-xs text-muted-foreground">À donner à votre prestataire : il permet à la caisse de vérifier que les commandes viennent bien de votre site (en-tête <code>X-Loulou-Signature</code>).</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-background px-3 py-2">{showSecret ? cfg.webhookSecret : '•'.repeat(32)}</code>
              <button type="button" aria-label={showSecret ? 'Masquer' : 'Afficher'} onClick={() => setShowSecret(!showSecret)} className="rounded-lg border bg-background p-2">{showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              <button type="button" aria-label="Copier le secret" onClick={() => copy(cfg.webhookSecret)} className="rounded-lg border bg-background p-2"><Copy className="size-4" /></button>
            </div>
          </div>
        )}
        {cfg.lastAt && (
          <p className={`text-sm ${cfg.lastOk ? 'text-success' : 'text-destructive'}`}>
            Dernier envoi ({cfg.lastEvent}) le {new Date(cfg.lastAt).toLocaleString('fr-FR', { timeZone: 'Indian/Mayotte' })} : {cfg.lastOk ? 'reçu par la caisse' : `échec, ${cfg.lastError}. Nouvel essai automatique.`}
          </p>
        )}
      </form>

      <section className="space-y-3 rounded-[1.25rem] bg-secondary p-5">
        <h3 className="text-lg font-bold">Lecture des commandes par la caisse</h3>
        <p className="text-sm">Pour les caisses qui viennent chercher les commandes elles-mêmes. Créez une clé et donnez-la à votre prestataire avec l'adresse ci-dessous.</p>
        <div className="flex items-center gap-2 text-sm">
          <code className="flex-1 truncate rounded-lg bg-background px-3 py-2">{cfg.apiUrl}</code>
          <button type="button" aria-label="Copier l'adresse" onClick={() => copy(cfg.apiUrl)} className="rounded-lg border bg-background p-2"><Copy className="size-4" /></button>
        </div>
        {newKey ? (
          <div className="space-y-1 rounded-lg bg-background p-3 text-sm">
            <p className="font-semibold">Votre nouvelle clé (affichée une seule fois)</p>
            <div className="flex items-center gap-2"><code className="flex-1 break-all">{newKey}</code><button type="button" aria-label="Copier la clé" onClick={() => copy(newKey)} className="rounded-lg border p-2"><Copy className="size-4" /></button></div>
          </div>
        ) : cfg.apiKeyHint ? <p className="text-sm">Clé active : <code>{cfg.apiKeyHint}</code></p> : <p className="text-sm text-muted-foreground">Aucune clé active.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={async () => { const r = await createKey({}); if (r.ok) { setNewKey(r.key); toast.success('Clé créée') } else toast.error(r.message) }} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">{cfg.apiKeyHint ? 'Remplacer la clé' : 'Créer une clé'}</button>
          {cfg.apiKeyHint && <button type="button" onClick={async () => { await revoke({}); setNewKey(null); toast.success('Clé révoquée') }} className="rounded-full border bg-background px-5 py-2 text-sm font-semibold">Révoquer</button>}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Fiche technique pour le prestataire</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>Lecture : <code>GET {cfg.apiUrl}?depuis=&lt;horodatage en ms&gt;</code> avec l'en-tête <code>Authorization: Bearer &lt;clé&gt;</code>. Réponse JSON <code>{'{ commandes: [...], prochainDepuis }'}</code>, ou CSV avec <code>&format=csv</code>. 120 requêtes par minute au maximum.</p>
            <p>Envoi automatique : <code>POST</code> JSON <code>{'{ evenement, envoyeLe, commande }'}</code>, événements <code>commande.recue</code>, <code>commande.preparation</code>, <code>commande.prete</code>, <code>commande.en_livraison</code>, <code>commande.livree</code>, <code>commande.recuperee</code>, <code>commande.annulee</code>. Signature : HMAC-SHA256 du texte <code>horodatage + "." + corps</code> avec le secret, dans <code>X-Loulou-Signature: sha256=…</code> et <code>X-Loulou-Timestamp</code>. En cas d'échec, trois nouveaux essais (30 s, 2 min, 8 min).</p>
            <p>Chaque commande contient : numéro, date, statut, mode, quartier, adresse, client, lignes (article, quantité, prix unitaire), sous-total, frais de livraison, remise, total TTC en euros, détail du paiement et reste à encaisser.</p>
          </div>
        </details>
      </section>
    </div>
  )
}
