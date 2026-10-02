import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Search } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { Group } from '@/convex/shared'
import { eur } from '@/lib/shop'
import { run, time, useKtArgs, useTeam } from '@/lib/team'
import { Modal } from './shell'

type Target = { kind: 'item' | 'ingredient'; id: string; name: string; usedBy?: string[] }
const DURATIONS = [['30m', '30 minutes'], ['1h', '1 heure'], ['service', "Jusqu'à la fin du service"], ['manuel', 'Jusqu’à remise en vente manuelle']] as const

export function MenuStockPage() {
  const kt = useKtArgs()
  const team = useTeam()
  const res = useQuery(api.options.availability, kt)
  const setItem = useMutation(api.options.setItemStock)
  const setIng = useMutation(api.options.setIngredientStock)
  const [tab, setTab] = useState<'plats' | 'ingredients' | 'options'>('plats')
  const [q, setQ] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)

  const filter = <T extends { name: string; outOfStock: boolean }>(list: T[]) => list.filter((x) => (!onlyOut || x.outOfStock) && x.name.toLowerCase().includes(q.trim().toLowerCase()))
  if (res === undefined) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>
  if (!res.ok) return <p className="py-16 text-center text-destructive">{res.message}</p>
  const outCount = res.items.filter((i) => i.outOfStock).length + res.ingredients.filter((i) => i.outOfStock).length

  async function back(t: Target) {
    if (t.kind === 'item') await run(setItem({ ...kt, itemId: t.id as Id<'menuItems'>, out: false }), `${t.name} remis en vente`, 'Enregistrement…')
    else await run(setIng({ ...kt, ingredientId: t.id as Id<'ingredients'>, out: false }), `${t.name} remis en vente`, 'Enregistrement…')
  }

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Menu et ruptures</h1>
      <p className="mt-1 text-muted-foreground">Désactivez un plat ou un ingrédient épuisé : les clients ne peuvent plus le choisir, sur le site comme sur l'application.</p>
      <div className="mt-5 flex flex-wrap gap-2" role="tablist">
        {([['plats', 'Plats'], ['ingredients', 'Viandes, sauces, suppléments'], ...(team.kind === 'admin' ? [['options', 'Règles des options']] : [])] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-foreground text-background' : 'bg-background'}`}>{l}</button>
        ))}
      </div>
      {tab !== 'options' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-60 flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher" className="w-full rounded-xl border bg-background py-2.5 pl-10 pr-3" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={onlyOut} onChange={(e) => setOnlyOut(e.target.checked)} className="size-4" /> Ruptures seulement ({outCount})</label>
        </div>
      )}

      {tab === 'plats' && (
        <ul className="mt-4 divide-y overflow-hidden rounded-2xl bg-background">
          {filter(res.items).map((i) => (
            <li key={i._id} className="flex items-center gap-3 px-4 py-3">
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-12 rounded-xl object-cover" /> : <span className="size-12 rounded-xl bg-secondary" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.name}</p>
                <p className="text-sm text-muted-foreground">{i.category} · {eur(i.price)}{i.hasOptions ? ' · options' : ''}</p>
                {i.outOfStock && <p className="text-xs font-semibold text-destructive">Rupture {i.outUntil ? `jusqu'à ${time(i.outUntil)}` : 'jusqu’à remise en vente'}{i.outReason ? ` · ${i.outReason}` : ''}</p>}
              </div>
              <Switch on={!i.outOfStock} label={i.name} onChange={() => i.outOfStock ? back({ kind: 'item', id: i._id, name: i.name }) : setTarget({ kind: 'item', id: i._id, name: i.name })} />
            </li>
          ))}
        </ul>
      )}

      {tab === 'ingredients' && (
        <ul className="mt-4 divide-y overflow-hidden rounded-2xl bg-background">
          {filter(res.ingredients).map((g) => (
            <li key={g._id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">· {g.kind}</span></p>
                <p className="text-xs text-muted-foreground">{g.usedBy.length ? `Utilisé dans : ${g.usedBy.join(', ')}` : 'Non utilisé dans un produit'}</p>
                {g.outOfStock && <p className="text-xs font-semibold text-destructive">Rupture {g.outUntil ? `jusqu'à ${time(g.outUntil)}` : 'jusqu’à remise en vente'}{g.outReason ? ` · ${g.outReason}` : ''}</p>}
              </div>
              <Switch on={!g.outOfStock} label={g.name} onChange={() => g.outOfStock ? back({ kind: 'ingredient', id: g._id, name: g.name }) : setTarget({ kind: 'ingredient', id: g._id, name: g.name, usedBy: g.usedBy })} />
            </li>
          ))}
        </ul>
      )}

      {tab === 'options' && team.kind === 'admin' && <OptionsEditor items={res.items.filter((i) => i.hasOptions)} />}

      {target && <StockDialog target={target} onClose={() => setTarget(null)} onConfirm={async (duration, motif) => {
        const r = target.kind === 'item'
          ? await run(setItem({ ...kt, itemId: target.id as Id<'menuItems'>, out: true, duration, motif }), `${target.name} en rupture`, 'Enregistrement…')
          : await run(setIng({ ...kt, ingredientId: target.id as Id<'ingredients'>, out: true, duration, motif }), `${target.name} en rupture dans tous les produits liés`, 'Enregistrement…')
        if (r?.ok) setTarget(null)
      }} />}
    </div>
  )
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={`${label} : ${on ? 'disponible' : 'en rupture'}`} onClick={onChange}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-600' : 'bg-input'}`}>
      <span className={`absolute top-1 size-6 rounded-full bg-background shadow transition-[left] ${on ? 'left-7' : 'left-1'}`} />
    </button>
  )
}

function StockDialog({ target, onClose, onConfirm }: { target: Target; onClose: () => void; onConfirm: (d: '30m' | '1h' | 'service' | 'manuel', motif: string) => void }) {
  const [d, setD] = useState<'30m' | '1h' | 'service' | 'manuel'>('service')
  const [motif, setMotif] = useState('')
  return (
    <Modal title={`Rupture : ${target.name}`} onClose={onClose}>
      {target.kind === 'ingredient' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Portée : tous les produits qui utilisent cet ingrédient{target.usedBy?.length ? ` (${target.usedBy.join(', ')})` : ''}. Les autres choix restent disponibles.</p>
      )}
      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-sm font-semibold">Durée</legend>
        {DURATIONS.map(([k, l]) => <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${d === k ? 'border-foreground' : ''}`}><input type="radio" checked={d === k} onChange={() => setD(k)} className="accent-foreground" /> {l}</label>)}
      </fieldset>
      <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={100} placeholder="Motif (facultatif)" className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm" />
      <p className="mt-2 text-xs text-muted-foreground">Les commandes déjà validées ne sont pas modifiées.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Annuler</button>
        <button onClick={() => onConfirm(d, motif)} className="flex-1 rounded-xl bg-foreground py-3 font-semibold text-background">Appliquer la rupture</button>
      </div>
    </Modal>
  )
}

/** Responsable : prix des choix, minimum et maximum de chaque groupe, choix désactivés. */
function OptionsEditor({ items }: { items: { _id: Id<'menuItems'>; name: string; groups: unknown[] }[] }) {
  const save = useMutation(api.options.saveGroups)
  const addIng = useMutation(api.options.addIngredient)
  const [itemId, setItemId] = useState(items[0]?._id)
  const item = items.find((i) => i._id === itemId)
  const [draft, setDraft] = useState<Group[] | null>(null)
  const groups = useMemo(() => draft ?? ((item?.groups ?? []) as Group[]), [draft, item])
  const [ing, setIng] = useState({ name: '', kind: 'Sauce' })
  if (!items.length) return <p className="mt-4 rounded-2xl bg-background p-6 text-muted-foreground">Aucun plat à options.</p>
  const edit = (gi: number, patch: Partial<Group>) => setDraft(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const editChoice = (gi: number, ci: number, patch: Partial<Group['choices'][number]>) => edit(gi, { choices: groups[gi].choices.map((c, i) => (i === ci ? { ...c, ...patch } : c)) })

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-background p-4">
        <label className="text-sm font-semibold">Plat
          <select value={itemId} onChange={(e) => { setItemId(e.target.value as Id<'menuItems'>); setDraft(null) }} className="ml-2 rounded-xl border px-3 py-2">{items.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}</select></label>
        <p className="text-sm text-muted-foreground">Le prix de base du plat se règle dans « Modifier le site ». Ici : suppléments, nombres de choix et choix désactivés.</p>
      </div>
      {groups.map((g, gi) => (
        <section key={g.id} className="rounded-2xl bg-background p-4">
          <div className="flex flex-wrap items-end gap-3">
            <h3 className="mr-auto text-lg font-bold">{g.label}{g.showIf ? <span className="ml-2 text-xs font-normal text-muted-foreground">(seulement si « {g.showIf.choice} » est choisi)</span> : null}</h3>
            {g.countFrom ? <p className="text-sm text-muted-foreground">Nombre donné par la taille choisie</p> : <>
              <label className="text-sm">Minimum <input type="number" min={0} max={10} value={g.min} onChange={(e) => edit(gi, { min: Number(e.target.value) })} className="ml-1 w-16 rounded-lg border px-2 py-1" /></label>
              <label className="text-sm">Maximum <input type="number" min={0} max={10} value={g.max} onChange={(e) => edit(gi, { max: Number(e.target.value) })} className="ml-1 w-16 rounded-lg border px-2 py-1" /></label>
            </>}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.choices.map((c, ci) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
                <span className="flex-1 font-medium">{c.label}{c.exclusive ? ' (exclusif)' : ''}{c.count ? ` · ${c.count}` : ''}</span>
                <label className="flex items-center gap-1">+ <input type="number" step="0.1" min={0} max={100} value={c.price} onChange={(e) => editChoice(gi, ci, { price: Number(e.target.value) })} className="w-16 rounded-lg border bg-background px-2 py-1" aria-label={`Supplément ${c.label}`} /> €</label>
                {!c.ingredientId && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!c.off} onChange={(e) => editChoice(gi, ci, { off: !e.target.checked })} /> proposé</label>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        <button disabled={!draft} onClick={async () => { const r = await run(save({ itemId: itemId!, groups: groups as never }), 'Règles enregistrées', 'Vérification et enregistrement…'); if (r?.ok) setDraft(null) }} className="rounded-full bg-foreground px-5 py-2.5 font-semibold text-background disabled:opacity-40">Enregistrer les règles</button>
        {draft && <button onClick={() => setDraft(null)} className="rounded-full border bg-background px-5 py-2.5 font-semibold">Annuler les changements</button>}
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run(addIng(ing), 'Ingrédient ajouté'); if (r?.ok) setIng({ ...ing, name: '' }) }} className="flex flex-wrap items-end gap-2 rounded-2xl bg-background p-4">
        <label className="text-sm font-semibold">Nouvel ingrédient<input value={ing.name} onChange={(e) => setIng({ ...ing, name: e.target.value })} maxLength={40} required className="mt-1 block rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Type<select value={ing.kind} onChange={(e) => setIng({ ...ing, kind: e.target.value })} className="mt-1 block rounded-xl border px-3 py-2">{['Viande', 'Sauce', 'Supplément', 'Boisson', 'Accompagnement', 'Autre'].map((k) => <option key={k}>{k}</option>)}</select></label>
        <button className="rounded-full bg-foreground px-5 py-2.5 font-semibold text-background">Ajouter</button>
        <p className="w-full text-xs text-muted-foreground">Un nouvel ingrédient peut ensuite être géré en rupture par l'équipe. Pour l'ajouter comme choix d'un plat, demandez-le lors de la prochaine mise à jour.</p>
      </form>
    </div>
  )
}
