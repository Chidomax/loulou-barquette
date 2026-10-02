import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, Bike, Car, ChevronRight, Clock, MessageSquareText, Phone, Printer, Search, ShoppingBag, Store, User } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { eur } from '@/lib/shop'
import { MODE_LABEL, type Order, STATUS, dateTime, exportCsv, itemsCount, openTicket, payText, run, shortName, time, useKtArgs, useTeam } from '@/lib/team'
import { Modal } from './shell'

type Data = Extract<NonNullable<ReturnType<typeof useStaffList>>, { ok: true }>
function useStaffList() { return useQuery(api.orders.staffList, useKtArgs()) }

const ModeIcon = ({ mode, className = 'size-4' }: { mode: Order['mode']; className?: string }) => mode === 'livraison' ? <Car className={className} /> : mode === 'emporter' ? <ShoppingBag className={className} /> : <Store className={className} />

export function StatusPill({ status }: { status: Order['status'] }) {
  const s = STATUS[status]
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.pill}`}><span className={`size-2 rounded-full ${s.dot}`} />{s.label}</span>
}

// ===================================================================== Page Commandes
export function OrdersPage({ view }: { view: 'commandes' | 'terminees' }) {
  const res = useStaffList()
  const team = useTeam()
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null)
  const [tab, setTab] = useState<'encours' | 'terminees' | 'historique'>(view === 'terminees' ? 'terminees' : 'encours')
  const [mobileSeg, setMobileSeg] = useState<'apreparer' | 'pretes'>('apreparer')
  useEffect(() => setTab(view === 'terminees' ? 'terminees' : 'encours'), [view])

  if (res === undefined) return <p className="py-16 text-center text-muted-foreground">Chargement des commandes…</p>
  if (!res.ok) return <p className="py-16 text-center text-destructive">{res.message}</p>

  const all = [...res.active, ...res.done]
  const current = all.find((o) => o._id === openId) ?? null
  const toPrepare = res.active.filter((o) => ['recue', 'preparation', 'attente_paiement'].includes(o.status))
  const ready = res.active.filter((o) => ['prete', 'en_livraison'].includes(o.status))
  const todayTotal = all.filter((o) => o.status !== 'annulee' && o.status !== 'attente_paiement')

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Commandes</h1>
          <p className="mt-1 hidden text-muted-foreground sm:block">Gérez vos commandes en temps réel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {res.needEmployee && <span className="rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-900">Identifiez-vous pour agir</span>}
          {team.kind === 'admin' && <button onClick={() => exportCsv(all)} className="rounded-full border bg-background px-3 py-1.5 font-semibold">Exporter (CSV)</button>}
          {team.kind === 'admin' && <span className="hidden font-semibold sm:inline">{todayTotal.length} commande{todayTotal.length > 1 ? 's' : ''} · {eur(todayTotal.reduce((s, o) => s + o.total, 0))}</span>}
        </div>
      </div>

      {/* Onglets (ordinateur) */}
      <div className="mt-5 hidden gap-6 border-b lg:flex" role="tablist">
        {([['encours', `En cours (${res.active.length})`], ['terminees', `Terminées aujourd'hui (${res.done.length})`], ['historique', 'Historique']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === k ? 'border-foreground' : 'border-transparent text-muted-foreground'}`}>{l}</button>
        ))}
      </div>

      {/* Ordinateur : grille de cartes */}
      <div className="hidden lg:block">
        {tab === 'encours' && (res.active.length ? <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-3">{res.active.map((o) => <OrderCard key={o._id} o={o} selected={o._id === openId} onOpen={() => setOpenId(o._id)} />)}</div> : <Empty text="Aucune commande en cours. Les nouvelles commandes s'affichent ici avec une alerte sonore." />)}
        {tab === 'terminees' && <DoneList list={res.done} onOpen={setOpenId} />}
        {tab === 'historique' && <HistoryList onOpen={setOpenId} />}
      </div>

      {/* Téléphone : À préparer / Prêtes */}
      <div className="lg:hidden">
        {view === 'commandes' ? (
          <>
            <div className="mt-4 grid grid-cols-2 rounded-2xl bg-background p-1" role="tablist">
              {([['apreparer', 'À préparer', toPrepare.length], ['pretes', 'Prêtes', ready.length]] as const).map(([k, l, n]) => (
                <button key={k} role="tab" aria-selected={mobileSeg === k} onClick={() => setMobileSeg(k)} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${mobileSeg === k ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>
                  {l} <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-xs ${mobileSeg === k ? 'bg-background text-foreground' : 'bg-secondary'}`}>{n}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {(mobileSeg === 'apreparer' ? toPrepare : ready).map((o) => <MobileCard key={o._id} o={o} onOpen={() => setOpenId(o._id)} />)}
              {!(mobileSeg === 'apreparer' ? toPrepare : ready).length && <Empty text={mobileSeg === 'apreparer' ? 'Rien à préparer pour le moment.' : 'Aucune commande prête.'} />}
            </div>
          </>
        ) : (
          <>
            <DoneList list={res.done} onOpen={setOpenId} />
            <h2 className="mt-8 text-lg font-bold">Rechercher une commande</h2>
            <HistoryList onOpen={setOpenId} />
          </>
        )}
      </div>

      {res.avgPrep !== null && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-background px-5 py-4 text-sm">
          <Clock className="size-5 text-muted-foreground" /> Temps de préparation moyen aujourd'hui : <b>{res.avgPrep} min</b>
        </div>
      )}

      {current && <OrderDrawer o={current} drivers={res.drivers} onClose={() => setOpenId(null)} />}
      {openId && !current && <HistoryDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="mt-5 rounded-2xl bg-background p-8 text-center text-muted-foreground">{text}</p>
}

// ---------- Carte (ordinateur)
function OrderCard({ o, selected, onOpen }: { o: Order; selected: boolean; onOpen: () => void }) {
  return (
    <article className={`flex flex-col rounded-2xl bg-background p-5 shadow-sm ring-2 ${selected ? 'ring-emerald-700' : o.status === 'recue' ? 'ring-primary/40' : 'ring-transparent'}`}>
      <button onClick={onOpen} className="text-left" aria-label={`Ouvrir la commande ${o.num}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-xl font-bold">#{o.num}</h3>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold"><ModeIcon mode={o.mode} /> {MODE_LABEL[o.mode]}</span>
        </div>
        <p className="mt-3 flex items-center gap-2 font-medium"><User className="size-4 text-muted-foreground" /> {shortName(o.nom)}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Clock className="size-4" /> {time(o._creationTime)}{o.promisedAt && o.status === 'preparation' ? ` · pour ${time(o.promisedAt)}` : ''}</p>
        <div className="my-3 border-t" />
        <div className="flex items-center justify-between"><StatusPill status={o.status} />{(o.problems?.length ?? 0) > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="size-4" /> Problème</span>}</div>
        <p className="mt-3 text-2xl font-bold">{eur(o.total)}</p>
        <p className="text-xs text-muted-foreground">{itemsCount(o)} article{itemsCount(o) > 1 ? 's' : ''} · {payText(o).label}</p>
      </button>
      <div className="mt-4"><PrimaryAction o={o} onOpen={onOpen} /></div>
    </article>
  )
}

// ---------- Carte (téléphone)
function MobileCard({ o, onOpen }: { o: Order; onOpen: () => void }) {
  return (
    <article className="rounded-2xl bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">#{o.num}</h3>
        <StatusPill status={o.status} />
      </div>
      <p className="mt-1 font-semibold">{shortName(o.nom)} · {MODE_LABEL[o.mode]}</p>
      <p className="text-sm text-muted-foreground">{itemsCount(o)} article{itemsCount(o) > 1 ? 's' : ''}{o.promisedAt ? ` · Pour ${time(o.promisedAt)}` : ` · Reçue à ${time(o._creationTime)}`}</p>
      <ul className="mt-3 space-y-0.5 border-t pt-3 text-sm">
        {o.lignes.slice(0, 4).map((l, i) => <li key={i}>{l.qte} × {l.article}</li>)}
        {o.lignes.length > 4 && <li className="text-muted-foreground">+ {o.lignes.length - 4} autre(s)</li>}
      </ul>
      {o.note && <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {o.note}</p>}
      <button onClick={onOpen} className={`mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-3 font-semibold ${o.status === 'recue' ? 'bg-foreground text-background' : 'border'}`}>Voir la commande <ChevronRight className="size-4" /></button>
    </article>
  )
}

// ---------- Action principale selon l'étape
function PrimaryAction({ o, onOpen, big }: { o: Order; onOpen?: () => void; big?: boolean }) {
  const kt = useKtArgs()
  const accept = useMutation(api.orders.accept)
  const markReady = useMutation(api.orders.markReady)
  const [busy, setBusy] = useState(false)
  const [handover, setHandover] = useState(false)
  const cls = `w-full rounded-xl font-semibold disabled:opacity-50 ${big ? 'py-4 text-base' : 'py-3 text-sm'}`
  const go = async (p: Promise<{ ok: boolean; message?: string }>, ok: string, pending: string) => { setBusy(true); try { await run(p, ok, pending) } finally { setBusy(false) } }

  if (o.status === 'attente_paiement') return <button disabled className={`${cls} bg-secondary text-muted-foreground`}>Paiement en attente : ne pas préparer</button>
  if (o.status === 'recue') return <button disabled={busy} onClick={() => go(accept({ ...kt, orderId: o._id }), `Commande ${o.num} acceptée`, 'Acceptation…')} className={`${cls} bg-foreground text-background`}>{busy ? 'Acceptation…' : 'Accepter et lancer la préparation'}</button>
  if (o.status === 'preparation') return <button disabled={busy} onClick={() => go(markReady({ ...kt, orderId: o._id }), `Commande ${o.num} prête`, 'Enregistrement…')} className={`${cls} bg-foreground text-background`}>{busy ? 'Enregistrement…' : 'Marquer prête'}</button>
  if (o.status === 'prete') return (
    <>
      <button onClick={() => setHandover(true)} className={`${cls} ${o.mode === 'livraison' ? 'bg-emerald-50 text-emerald-900' : 'bg-foreground text-background'}`}>
        {o.mode === 'livraison' ? <span className="inline-flex items-center gap-2"><Bike className="size-5" /> {o.driverName ? `Remettre à ${o.driverName.split(' ')[0]}` : 'En attente du coursier'}</span> : 'Remettre au client'}
      </button>
      {handover && <HandoverDialog o={o} onClose={() => setHandover(false)} />}
    </>
  )
  if (o.status === 'en_livraison') return <p className={`${cls} flex items-center justify-center gap-2 bg-sky-50 text-sky-900`}><Bike className="size-5" /> En route{o.driverName ? ` avec ${o.driverName.split(' ')[0]}` : ''}</p>
  return onOpen ? <button onClick={onOpen} className={`${cls} border`}>Voir le détail</button> : null
}

// ===================================================================== Volet de détail
function OrderDrawer({ o, drivers, onClose }: { o: Order; drivers: Data['drivers']; onClose: () => void }) {
  const team = useTeam()
  const kt = useKtArgs()
  const toggleCheck = useMutation(api.orders.toggleCheck)
  const setNote = useMutation(api.orders.setNote)
  const assign = useMutation(api.orders.assignDriver)
  const printed = useMutation(api.orders.printed)
  const [dialog, setDialog] = useState<null | 'refuse' | 'delay' | 'problem' | 'cancel' | 'back'>(null)
  const [note, setNoteText] = useState(o.noteInterne ?? '')
  useEffect(() => setNoteText(o.noteInterne ?? ''), [o._id, o.noteInterne])
  useEffect(() => {
    // Échap ferme d'abord la fenêtre ouverte par-dessus (remise, refus…), pas le volet entier
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog && document.querySelectorAll('[role=dialog]').length <= 1) onClose() }
    document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc)
  }, [onClose, dialog])
  const checked = new Set(o.checked ?? [])
  const pay = payText(o)
  const editable = ['recue', 'preparation', 'prete'].includes(o.status)

  async function print() {
    const r = await run(printed({ ...kt, orderIds: [o._id] }), "Ticket envoyé à l'impression", 'Préparation du ticket…')
    if (r && r.ok && 'copies' in r) openTicket([{ o, copy: r.copies[0]?.copy ?? 1 }])
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" aria-label={`Commande ${o.num}`} className="flex h-full w-full flex-col bg-background shadow-2xl sm:max-w-[460px]">
        <header className="flex items-center gap-3 border-b px-5 py-4">
          <button onClick={onClose} aria-label="Retour" className="rounded-full p-1.5 hover:bg-secondary"><ArrowLeft className="size-5" /></button>
          <p className="flex-1 text-sm text-muted-foreground">Commande #{o.num}</p>
          <button onClick={print} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold"><Printer className="size-4" /> Ticket{(o.printCount ?? 0) > 0 ? ` (${o.printCount})` : ''}</button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold">{shortName(o.nom)}</h2>
              <p className="mt-1 flex items-center gap-2 text-muted-foreground"><ModeIcon mode={o.mode} /> {MODE_LABEL[o.mode]} · Aujourd'hui à {time(o._creationTime)}</p>
            </div>
            <StatusPill status={o.status} />
          </div>

          <section>
            <h3 className="font-bold">À préparer ({itemsCount(o)} article{itemsCount(o) > 1 ? 's' : ''})</h3>
            <ul className="mt-2 divide-y">
              {o.lignes.map((l, i) => (
                <li key={i} className="py-3">
                  <label className={`flex items-start gap-3 ${editable ? 'cursor-pointer' : ''}`}>
                    <input type="checkbox" disabled={!editable} checked={checked.has(i)} onChange={() => run(toggleCheck({ ...kt, orderId: o._id, index: i }), checked.has(i) ? 'Article décoché' : 'Article vérifié')} className="mt-1 size-5 shrink-0 accent-emerald-700" />
                    <span className="flex-1">
                      <span className={`flex justify-between gap-3 font-semibold ${checked.has(i) ? 'text-muted-foreground line-through' : ''}`}><span>{l.qte} × {l.article}</span><span className="font-medium">{eur(l.pu * l.qte)}</span></span>
                      {(l.details ?? []).map((d, j) => <span key={j} className={`block text-sm ${d.startsWith('Remarque') || d.startsWith('Retraits') ? 'font-semibold text-amber-800' : 'text-muted-foreground'}`}>{d}</span>)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {editable && <p className="text-xs text-muted-foreground">Cochez chaque article une fois vérifié dans le sac ({checked.size}/{o.lignes.length}).</p>}
          </section>

          {o.note && (
            <section className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950">
              <MessageSquareText className="mt-0.5 size-5 shrink-0" />
              <div><p className="font-semibold">Consigne du client</p><p className="text-sm">{o.note}</p></div>
            </section>
          )}

          {(o.problems?.length ?? 0) > 0 && (
            <section className="rounded-2xl bg-destructive/10 p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" /> Problèmes signalés</p>
              {o.problems!.map((p, i) => <p key={i}><b>{p.type}</b> : {p.message} <span className="text-muted-foreground">({p.by}, {time(p.at)})</span></p>)}
            </section>
          )}

          <section>
            <label className="text-sm font-semibold" htmlFor="note-interne">Note interne (équipe uniquement)</label>
            <textarea id="note-interne" value={note} onChange={(e) => setNoteText(e.target.value)} onBlur={() => note !== (o.noteInterne ?? '') && run(setNote({ ...kt, orderId: o._id, note }), 'Note enregistrée')} maxLength={300} rows={2} placeholder="Visible par l'équipe, jamais par le client" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
          </section>

          <section className="border-t pt-4">
            <div className="flex items-end justify-between"><h3 className="text-xl font-bold">Total</h3><p className="text-2xl font-bold">{eur(o.total)}</p></div>
            <p className={`text-sm ${pay.paid ? 'text-emerald-800' : 'font-semibold text-amber-800'}`}>{pay.label}</p>
            {(o.remise ?? 0) > 0 && <p className="text-sm text-muted-foreground">Dont réduction fidélité −{eur(o.remise!)}</p>}
          </section>

          {o.mode === 'livraison' && (
            <section className="border-t pt-4">
              <h3 className="font-bold">Livraison</h3>
              <p className="mt-1 text-sm">{o.zone} · {o.adresse}</p>
              <div className="mt-2 flex items-center gap-3">
                <Bike className="size-5 text-muted-foreground" />
                {editable ? (
                  <select value={o.driverId ?? ''} onChange={(e) => run(assign({ ...kt, orderId: o._id, driverId: (e.target.value || undefined) as Id<'users'> | undefined }), e.target.value ? 'Livreur affecté' : 'Livreur retiré')} className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm" aria-label="Livreur">
                    <option value="">Coursier en cours d'attribution</option>
                    {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                ) : <span className="text-sm">{o.driverName ?? 'Coursier non affecté'}</span>}
              </div>
            </section>
          )}

          {(o.status === 'preparation' || o.status === 'prete') && (
            <section className="flex items-center justify-between gap-3 border-t pt-4">
              <div><h3 className="font-bold">Préparation</h3><p className="flex items-center gap-2 text-sm"><Clock className="size-4" /> {o.status === 'prete' ? `Prête depuis ${time(o.readyAt ?? Date.now())}` : `Prête vers ${o.promisedAt ? time(o.promisedAt) : '—'}`}</p></div>
              {o.status === 'preparation' ? <button onClick={() => setDialog('delay')} className="rounded-xl border px-3 py-2 text-sm font-semibold">Modifier le délai</button>
                : <button onClick={() => setDialog('back')} className="rounded-xl border px-3 py-2 text-sm font-semibold">Repasser en préparation</button>}
            </section>
          )}

          <Timeline orderId={o._id} />
        </div>

        <footer className="space-y-2 border-t px-5 py-4">
          {o.status === 'preparation' && checked.size < o.lignes.length && <p className="text-center text-xs text-muted-foreground">Vérifiez les articles avant de valider.</p>}
          <PrimaryAction o={o} big />
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${o.tel}`} className="flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"><Phone className="size-4" /> Contacter le client</a>
            <button onClick={() => setDialog('problem')} className="rounded-xl border py-3 text-sm font-semibold">Signaler un problème</button>
          </div>
          {o.status === 'recue' && <button onClick={() => setDialog('refuse')} className="w-full py-2 text-sm font-semibold text-destructive">Refuser la commande</button>}
          {team.kind === 'admin' && ['preparation', 'prete', 'attente_paiement'].includes(o.status) && <button onClick={() => setDialog('cancel')} className="w-full py-2 text-sm font-semibold text-destructive">Annuler la commande (responsable)</button>}
        </footer>
      </aside>
      {dialog === 'refuse' && <RefuseDialog o={o} onClose={() => setDialog(null)} />}
      {dialog === 'delay' && <DelayDialog o={o} onClose={() => setDialog(null)} />}
      {dialog === 'problem' && <ProblemDialog o={o} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && <CancelDialog o={o} onClose={() => setDialog(null)} />}
      {dialog === 'back' && <BackDialog o={o} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Timeline({ orderId }: { orderId: Id<'orders'> }) {
  const res = useQuery(api.orders.timeline, { ...useKtArgs(), orderId })
  if (!res || !res.ok || !res.rows.length) return null
  return (
    <details className="border-t pt-4">
      <summary className="cursor-pointer font-bold">Historique de la commande</summary>
      <ol className="mt-2 space-y-1.5 text-sm">
        {res.rows.map((r, i) => <li key={i}><span className="text-muted-foreground">{time(r.at)}</span> · <b>{r.action}</b>{r.detail ? ` (${r.detail})` : ''}{r.motif ? ` · motif : ${r.motif}` : ''} · <span className="text-muted-foreground">{r.actor}</span></li>)}
      </ol>
    </details>
  )
}

// ---------- Fenêtres d'action
function useLabels() { return useQuery(api.orders.labels, {}) }

function RefuseDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const refuse = useMutation(api.orders.refuse)
  const labels = useLabels()
  const [motif, setMotif] = useState('')
  const [precision, setPrecision] = useState('')
  return (
    <Modal title={`Refuser la commande #${o.num}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Le client verra que sa commande est refusée, avec le motif. {o.paidCb + o.paidTr > 0 && <b className="text-foreground">Elle est déjà payée : le responsable devra lancer le remboursement.</b>}</p>
      <div className="mt-4 space-y-2">
        {labels?.refus.map((m) => <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${motif === m ? 'border-foreground' : ''}`}><input type="radio" name="refus" checked={motif === m} onChange={() => setMotif(m)} className="accent-foreground" /> {m}</label>)}
      </div>
      {motif === 'Autre' && <input value={precision} onChange={(e) => setPrecision(e.target.value)} maxLength={120} placeholder="Précisez le motif" className="mt-2 w-full rounded-xl border px-3 py-2.5" />}
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Retour</button>
        <button disabled={!motif} onClick={async () => { const r = await run(refuse({ ...kt, orderId: o._id, motif, precision }), 'Commande refusée', 'Refus en cours…'); if (r?.ok) onClose() }} className="flex-1 rounded-xl bg-destructive py-3 font-semibold text-destructive-foreground disabled:opacity-40">Refuser</button>
      </div>
    </Modal>
  )
}

function DelayDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const setDelay = useMutation(api.orders.setDelay)
  const [motif, setMotif] = useState('')
  return (
    <Modal title="Modifier le délai" onClose={onClose}>
      <p className="text-sm text-muted-foreground">Prête vers {o.promisedAt ? time(o.promisedAt) : '—'} actuellement. Le client voit la nouvelle heure sur son suivi.</p>
      <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={120} placeholder="Motif (facultatif) : affluence, rupture…" className="mt-4 w-full rounded-xl border px-3 py-2.5 text-sm" />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[5, 10, 15, 30].map((m) => <button key={m} onClick={async () => { const r = await run(setDelay({ ...kt, orderId: o._id, addMinutes: m, motif }), `Délai prolongé de ${m} min`, 'Enregistrement…'); if (r?.ok) onClose() }} className="rounded-xl bg-secondary py-4 font-bold">+{m} min</button>)}
      </div>
    </Modal>
  )
}

function ProblemDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const report = useMutation(api.orders.reportProblem)
  const labels = useLabels()
  const [type, setType] = useState('')
  const [message, setMessage] = useState('')
  return (
    <Modal title="Signaler un problème" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {labels?.problemes.map((t) => <button key={t} onClick={() => setType(t)} className={`rounded-xl border p-3 text-left text-sm font-medium ${type === t ? 'border-foreground bg-secondary' : ''}`}>{t}</button>)}
      </div>
      {type === 'Doute sur un allergène' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Suspendez l'article concerné et consultez les informations validées. N'improvisez pas de remplacement.</p>}
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} placeholder="Ce qui se passe, ce qui a été fait" className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm" />
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Annuler</button>
        <button disabled={!type || message.trim().length < 3} onClick={async () => { const r = await run(report({ ...kt, orderId: o._id, type, message }), 'Problème signalé au responsable', 'Envoi…'); if (r?.ok) onClose() }} className="flex-1 rounded-xl bg-foreground py-3 font-semibold text-background disabled:opacity-40">Signaler</button>
      </div>
      <a href={`tel:${o.tel}`} className="mt-3 block text-center text-sm underline">Appeler le client</a>
    </Modal>
  )
}

function HandoverDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const handOver = useMutation(api.orders.handOver)
  const [num, setNum] = useState('')
  const toDriver = o.mode === 'livraison'
  return (
    <Modal title={toDriver ? 'Remise au livreur' : 'Remise au client'} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Demandez le numéro de commande {toDriver ? 'au livreur' : 'au client'} et saisissez-le pour éviter une erreur de sac.</p>
      <ul className="mt-3 rounded-xl bg-secondary p-3 text-sm">{o.lignes.map((l, i) => <li key={i}>{l.qte} × {l.article}</li>)}</ul>
      <label className="mt-4 block text-sm font-semibold">Numéro annoncé
        <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" placeholder="Ex. 1042" className="mt-1 w-full rounded-xl border px-3 py-3 text-lg font-bold tracking-wider" autoFocus />
      </label>
      {o.payMethod === 'place' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">À encaisser : {eur(o.total)}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Annuler</button>
        <button disabled={!num.trim()} onClick={async () => { const r = await run(handOver({ ...kt, orderId: o._id, numCheck: num }), toDriver ? 'Remise au livreur enregistrée' : 'Commande remise au client', 'Enregistrement…'); if (r?.ok) onClose() }} className="flex-1 rounded-xl bg-foreground py-3 font-semibold text-background disabled:opacity-40">Confirmer la remise</button>
      </div>
    </Modal>
  )
}

function CancelDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const cancel = useMutation(api.orders.cancel)
  const [motif, setMotif] = useState('')
  const paid = o.paidCb + o.paidTr > 0
  return (
    <Modal title={`Annuler la commande #${o.num}`} onClose={onClose}>
      <p className="text-sm">Cette action est définitive et tracée.{paid && <b> La commande est payée : annuler ne rembourse pas automatiquement. Lancez le remboursement depuis l'onglet Paiements de Macaly.</b>}</p>
      <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={120} placeholder="Motif de l'annulation (obligatoire)" className="mt-4 w-full rounded-xl border px-3 py-2.5" />
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Retour</button>
        <button disabled={motif.trim().length < 3} onClick={async () => { const r = await run(cancel({ ...kt, orderId: o._id, motif }), 'Commande annulée', 'Annulation…'); if (r?.ok) onClose() }} className="flex-1 rounded-xl bg-destructive py-3 font-semibold text-destructive-foreground disabled:opacity-40">Annuler la commande</button>
      </div>
    </Modal>
  )
}

function BackDialog({ o, onClose }: { o: Order; onClose: () => void }) {
  const kt = useKtArgs()
  const back = useMutation(api.orders.backToPrep)
  const [motif, setMotif] = useState('')
  return (
    <Modal title="Repasser en préparation" onClose={onClose}>
      <p className="text-sm text-muted-foreground">Possible tant que la commande n'est pas remise. Le motif est enregistré.</p>
      <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={120} placeholder="Ex. boisson oubliée, sac à refaire" className="mt-4 w-full rounded-xl border px-3 py-2.5" />
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Retour</button>
        <button disabled={motif.trim().length < 3} onClick={async () => { const r = await run(back({ ...kt, orderId: o._id, motif }), 'Commande repassée en préparation'); if (r?.ok) onClose() }} className="flex-1 rounded-xl bg-foreground py-3 font-semibold text-background disabled:opacity-40">Confirmer</button>
      </div>
    </Modal>
  )
}

// ===================================================================== Terminées et historique
function DoneList({ list, onOpen }: { list: Order[]; onOpen: (id: Id<'orders'>) => void }) {
  if (!list.length) return <Empty text="Aucune commande terminée aujourd'hui." />
  return (
    <ul className="mt-5 divide-y overflow-hidden rounded-2xl bg-background">
      {list.map((o) => (
        <li key={o._id}>
          <button onClick={() => onOpen(o._id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary">
            <span className="w-24 font-bold">#{o.num}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{shortName(o.nom)} · {MODE_LABEL[o.mode]} · {time(o._creationTime)}</span>
            <StatusPill status={o.status} />
            <span className="hidden w-20 text-right font-semibold sm:block">{eur(o.total)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function HistoryList({ onOpen }: { onOpen: (id: Id<'orders'>) => void }) {
  const kt = useKtArgs()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(q), 300); return () => clearTimeout(t) }, [q])
  const res = useQuery(api.orders.history, { ...kt, q: term || undefined })
  return (
    <div className="mt-5">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Numéro, nom ou téléphone" className="w-full rounded-xl border bg-background py-3 pl-10 pr-3" aria-label="Rechercher une commande" />
      </label>
      {res && res.ok && <p className="mt-2 text-xs text-muted-foreground">Commandes des {res.days} derniers jours.</p>}
      {res && res.ok && <DoneList list={res.rows as Order[]} onOpen={onOpen} />}
    </div>
  )
}

function HistoryDrawer({ id, onClose }: { id: Id<'orders'>; onClose: () => void }) {
  const kt = useKtArgs()
  const res = useQuery(api.orders.history, kt)
  const o = useMemo(() => (res && res.ok ? (res.rows as Order[]).find((x) => x._id === id) : undefined), [res, id])
  if (!o) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-modal="true" className="h-full w-full overflow-y-auto bg-background p-5 shadow-2xl sm:max-w-[460px]">
        <button onClick={onClose} className="mb-4 flex items-center gap-2 text-sm"><ArrowLeft className="size-4" /> Retour</button>
        <h2 className="text-2xl font-bold">#{o.num} · {shortName(o.nom)}</h2>
        <p className="text-muted-foreground">{MODE_LABEL[o.mode]} · {dateTime(o._creationTime)}</p>
        <div className="mt-2"><StatusPill status={o.status} /></div>
        {o.refusReason && <p className="mt-2 text-sm">Motif : {o.refusReason}</p>}
        <ul className="mt-4 divide-y">{o.lignes.map((l, i) => <li key={i} className="py-2"><b>{l.qte} × {l.article}</b>{(l.details ?? []).map((d, j) => <span key={j} className="block text-sm text-muted-foreground">{d}</span>)}</li>)}</ul>
        <p className="mt-3 text-xl font-bold">{eur(o.total)}</p>
        <Timeline orderId={o._id} />
      </aside>
    </div>
  )
}
