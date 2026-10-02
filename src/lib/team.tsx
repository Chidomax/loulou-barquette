import { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Doc } from '@/convex/_generated/dataModel'
import { eur } from '@/lib/shop'

// ---------- Accès : compte personnel (rôle) ou appareil cuisine (jeton stocké sur l'appareil)
export type Kind = 'admin' | 'staff' | 'driver' | 'kitchen'
export type TeamCtx = { kt?: string; kind: Kind; label: string; logout: () => void }
export const TeamContext = createContext<TeamCtx | null>(null)
export function useTeam() {
  const c = useContext(TeamContext)
  if (!c) throw new Error('TeamContext manquant')
  return c
}
/** Arguments communs à envoyer au serveur (jeton cuisine si l'appareil est un accès cuisine). */
export function useKtArgs() { const { kt } = useTeam(); return kt ? { kt } : {} }

const KT_KEY = 'lb_kt'
export const readKt = () => { try { return window.localStorage.getItem(KT_KEY) || window.sessionStorage.getItem(KT_KEY) } catch { return null } }
export const saveKt = (kt: string, remember: boolean) => { try { (remember ? window.localStorage : window.sessionStorage).setItem(KT_KEY, kt) } catch { /* ignore */ } }
export const clearKt = () => { try { window.localStorage.removeItem(KT_KEY); window.sessionStorage.removeItem(KT_KEY) } catch { /* ignore */ } }

// ---------- Commandes
export type Order = Omit<Doc<'orders'>, 'trackingToken' | 'customerId'> & { trackingToken?: undefined; customerId?: undefined }
export type Status = Doc<'orders'>['status']

export const STATUS: Record<Status, { label: string; dot: string; pill: string }> = {
  attente_paiement: { label: 'Paiement en attente', dot: 'bg-muted-foreground', pill: 'bg-secondary text-muted-foreground' },
  recue: { label: 'Nouvelle', dot: 'bg-primary', pill: 'bg-primary/10 text-primary' },
  preparation: { label: 'En préparation', dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-900' },
  prete: { label: 'Prête', dot: 'bg-emerald-600', pill: 'bg-emerald-100 text-emerald-900' },
  en_livraison: { label: 'Remise au livreur', dot: 'bg-sky-600', pill: 'bg-sky-100 text-sky-900' },
  livree: { label: 'Livrée', dot: 'bg-emerald-700', pill: 'bg-secondary text-foreground' },
  recuperee: { label: 'Remise au client', dot: 'bg-emerald-700', pill: 'bg-secondary text-foreground' },
  annulee: { label: 'Annulée', dot: 'bg-muted-foreground', pill: 'bg-secondary text-muted-foreground line-through' },
}
export const MODE_LABEL: Record<Order['mode'], string> = { livraison: 'Livraison', emporter: 'À emporter', surplace: 'Sur place' }
export const time = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })
export const dateTime = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })
export const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] }
export const itemsCount = (o: Order) => o.lignes.reduce((s, l) => s + l.qte, 0)
export const payText = (o: Order) => {
  if (o.payMethod === 'place') return { label: `À encaisser : ${eur(o.total)}`, paid: false }
  if (o.paidCb + o.paidTr >= o.total - 0.001) return { label: o.payMethod === 'tr' ? `Payée en ligne (titre-resto ${eur(o.paidTr)} + carte ${eur(o.paidCb)})` : 'Payée en ligne', paid: true }
  return { label: 'Paiement en ligne non reçu', paid: false }
}

/**
 * Exécute une action serveur avec un retour honnête : « en cours », puis réussi ou échoué.
 * Jamais de succès affiché avant la réponse du serveur.
 */
export async function run<T extends { ok: boolean; message?: string }>(p: Promise<T>, okMsg: string, pending?: string): Promise<T | null> {
  const id = pending ? toast.loading(pending) : undefined
  try {
    const r = await p
    if (r.ok) toast.success(okMsg, { id })
    else toast.error(r.message ?? 'Action impossible.', { id })
    return r
  } catch {
    toast.error("Échec : la connexion a été perdue. L'action n'a pas été enregistrée, réessayez.", { id })
    return null
  }
}

// ---------- Alerte sonore (répétée tant qu'une commande attend d'être acceptée)
export function beep() {
  try {
    const ctx = new AudioContext()
    const play = (f: number, at: number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = f; g.gain.value = 0.18; o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.22) }
    play(880, 0); play(1175, 0.28); play(880, 0.56)
  } catch { /* son indisponible */ }
}
export function useSoundSetting() {
  const [on, setOn] = useState(true)
  useEffect(() => { try { setOn(window.localStorage.getItem('lb_sound') !== 'off') } catch { /* ignore */ } }, [])
  const toggle = () => setOn((v) => { try { window.localStorage.setItem('lb_sound', v ? 'off' : 'on') } catch { /* ignore */ } return !v })
  return { on, toggle }
}

// ---------- Ticket cuisine 80 mm
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const money = (n: number) => n.toFixed(2).replace('.', ',') + ' EUR'

export function ticketHtml(list: { o: Order; copy: number }[]) {
  const one = ({ o, copy }: { o: Order; copy: number }) => {
    const pay = payText(o)
    const lines = o.lignes.map((l) => `
      <div class="row"><span>${l.qte} x ${esc(l.article)}</span><span>${money(l.pu * l.qte)}</span></div>
      ${(l.details ?? []).map((d) => `<div class="det">${esc(d)}</div>`).join('')}`).join('')
    return `<section class="t">
      ${copy > 1 ? `<div class="dup">DUPLICATA n°${copy - 1}</div>` : ''}
      <div class="c big">LOULOU BARQUETTE</div>
      <div class="c">13 Impasse Longchamps · Tsoundzou 2</div>
      <hr>
      <div class="c xl">Commande #${esc(o.num)}</div>
      <div class="c">${dateTime(o._creationTime)}</div>
      <div class="c lg">${MODE_LABEL[o.mode].toUpperCase()}</div>
      <div>Client : ${esc(shortName(o.nom))}</div>
      ${o.mode === 'livraison' ? `<div>${esc(o.zone ?? '')}${o.adresse ? ' – ' + esc(o.adresse) : ''}</div>` : ''}
      <hr>${lines}<hr>
      ${o.note ? `<div class="lg">NOTE DU CLIENT</div><div class="lg">${esc(o.note.toUpperCase())}</div><hr>` : ''}
      ${o.frais ? `<div class="row"><span>Livraison</span><span>${money(o.frais)}</span></div>` : ''}
      ${o.remise ? `<div class="row"><span>Réduction fidélité</span><span>-${money(o.remise)}</span></div>` : ''}
      <div class="row lg"><span>TOTAL</span><span>${money(o.total)}</span></div>
      <div>${pay.paid ? 'PAYÉE EN LIGNE' : o.payMethod === 'place' ? 'À ENCAISSER' : 'PAIEMENT NON REÇU'}</div>
      <div>${pay.paid ? 'Ne pas encaisser' : o.payMethod === 'place' ? 'Encaisser ' + money(o.total) : 'Ne pas préparer avant paiement'}</div>
      <hr>
      ${o.promisedAt ? `<div class="c lg">À préparer pour : ${time(o.promisedAt)}</div>` : ''}
      <div class="c">${itemsCount(o) > 1 ? `Vérifier les ${itemsCount(o)} articles` : "Vérifier l'article"}</div>
    </section>`
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Tickets</title><style>
    @page { size: 80mm auto; margin: 3mm }
    body { margin: 0; font: 13px/1.35 "Courier New", ui-monospace, monospace; color: #000; width: 74mm }
    .t { page-break-after: always; padding-bottom: 6mm } .c { text-align: center }
    .big { font-size: 17px; font-weight: 700; letter-spacing: .04em } .xl { font-size: 19px; font-weight: 700; margin-top: 2mm }
    .lg { font-size: 15px; font-weight: 700 } hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0 }
    .row { display: flex; justify-content: space-between; gap: 2mm } .det { padding-left: 5mm; font-size: 12px }
    .dup { border: 2px solid #000; text-align: center; font-weight: 700; padding: 1mm; margin-bottom: 2mm }
  </style></head><body>${list.map(one).join('')}<script>window.onload=function(){window.print()}</script></body></html>`
}

export function openTicket(list: { o: Order; copy: number }[]) {
  const w = window.open('', '_blank')
  if (!w) { toast.error("L'impression est bloquée : autorisez les fenêtres pour ce site, puis réessayez."); return false }
  w.document.open(); w.document.write(ticketHtml(list)); w.document.close()
  return true
}

// ---------- Export CSV (responsable)
export function exportCsv(list: Order[]) {
  const cell = (v: string) => { const t = /^[=+\-@\t\r]/.test(v) ? "'" + v : v; return `"${t.replace(/"/g, '""')}"` }
  const rows = [['numero', 'date', 'client', 'telephone', 'mode', 'zone', 'article', 'quantite', 'prix_unitaire', 'details', 'frais_livraison', 'total', 'paiement', 'statut']]
  for (const o of list) for (const l of o.lignes) rows.push([o.num, new Date(o._creationTime).toISOString(), o.nom, o.tel, o.mode, o.zone ?? '', l.article, String(l.qte), l.pu.toFixed(2), (l.details ?? []).join(' | '), o.frais.toFixed(2), o.total.toFixed(2), o.payMethod, STATUS[o.status].label])
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'commandes.csv'; a.click(); URL.revokeObjectURL(a.href)
}
