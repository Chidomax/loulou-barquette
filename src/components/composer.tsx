import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import { type Choice, type Group, type Sel, bounds, priceSelection, visibleGroups } from '@/convex/shared'
import { eur } from '@/lib/shop'

export type ComposerItem = { _id: string; name: string; price: number; description: string; imageUrl: string | null; groups: Group[]; category?: string }

/**
 * Composition d'un plat à options (ex. tacos) : taille → viandes → sauces et sous-options → suppléments → formule.
 * Le prix affiché est calculé avec la même règle que le serveur.
 */
export function Composer({ item, outIngredients, onClose, onAdd }: {
  item: ComposerItem
  outIngredients: string[]
  onClose: () => void
  onAdd: (r: { sel: Sel[]; details: string[]; price: number; qte: number; remarque?: string }) => void
}) {
  const [sel, setSel] = useState<Sel[]>([])
  const [qte, setQte] = useState(1)
  const [remarque, setRemarque] = useState('')
  const [tried, setTried] = useState(false)
  const out = useMemo(() => new Set(outIngredients), [outIngredients])
  const isOut = (c: Choice) => !!c.off || (!!c.ingredientId && out.has(c.ingredientId))
  const vis = visibleGroups(item.groups, sel)
  const result = priceSelection(item.groups, sel, isOut)
  const unit = result.ok ? Math.round((item.price + result.extra) * 100) / 100 : item.price
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [onClose])

  // Un choix dans un groupe devenu invisible (ex. boisson du menu après « tacos seul ») est retiré, jamais facturé en cachette
  useEffect(() => {
    const visIds = new Set(visibleGroups(item.groups, sel).map((g) => g.id))
    if (sel.some((x) => !visIds.has(x.g))) setSel((p) => p.filter((x) => visIds.has(x.g)))
  }, [sel, item.groups])

  const totalIn = (g: Group) => sel.filter((x) => x.g === g.id).reduce((s, x) => s + x.q, 0)
  const qOf = (g: Group, c: Choice) => sel.find((x) => x.g === g.id && x.c === c.id)?.q ?? 0

  function pick(g: Group, c: Choice) {
    const { max } = bounds(g, item.groups, sel)
    setSel((prev) => {
      const mine = prev.filter((x) => x.g === g.id)
      const others = prev.filter((x) => x.g !== g.id)
      const has = mine.some((x) => x.c === c.id)
      if (max === 1 && !g.repeat) return has && g.min === 0 ? others : [...others, { g: g.id, c: c.id, q: 1, ...(c.sub ? { s: c.sub.choices[0].id } : {}) }]
      if (has) return [...others, ...mine.filter((x) => x.c !== c.id)]
      if (c.exclusive) return [...others, { g: g.id, c: c.id, q: 1 }]
      const kept = mine.filter((x) => !g.choices.find((y) => y.id === x.c)?.exclusive)
      if (kept.reduce((s, x) => s + x.q, 0) >= max) return prev
      return [...others, ...kept, { g: g.id, c: c.id, q: 1, ...(c.sub ? { s: c.sub.choices[0].id } : {}) }]
    })
  }
  function step(g: Group, c: Choice, d: number) {
    const { max } = bounds(g, item.groups, sel)
    setSel((prev) => {
      const cur = prev.find((x) => x.g === g.id && x.c === c.id)
      const total = prev.filter((x) => x.g === g.id).reduce((s, x) => s + x.q, 0)
      if (d > 0 && total >= max) return prev
      if (!cur) return d > 0 ? [...prev, { g: g.id, c: c.id, q: 1 }] : prev
      const q = cur.q + d
      return q <= 0 ? prev.filter((x) => x !== cur) : prev.map((x) => (x === cur ? { ...x, q } : x))
    })
  }
  const setSub = (g: Group, c: Choice, s: string) => setSel((prev) => prev.map((x) => (x.g === g.id && x.c === c.id ? { ...x, s } : x)))

  function submit() {
    setTried(true)
    if (!result.ok) return
    onAdd({ sel, details: result.details, price: unit, qte, remarque: remarque.trim() || undefined })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={`Composer : ${item.name}`} className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-background shadow-2xl sm:max-w-lg sm:rounded-[1.75rem]">
        <div className="relative">
          {item.imageUrl && <img src={item.imageUrl} alt="" className="h-36 w-full object-cover sm:h-44" />}
          <button onClick={onClose} aria-label="Fermer" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-background/90 shadow"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <h2 className="text-2xl font-bold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">{item.description} · dès {eur(item.price)}</p>

          {vis.map((g) => {
            const { min, max } = bounds(g, item.groups, sel)
            const n = totalIn(g)
            const required = min > 0
            const done = n >= min && n <= max
            const single = max === 1 && !g.repeat
            return (
              <section key={g.id} className="mt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-bold">{g.label}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${required ? (done ? 'bg-emerald-100 text-emerald-900' : tried ? 'bg-primary/10 text-primary' : 'bg-secondary') : 'bg-secondary text-muted-foreground'}`}>
                    {g.countFrom && !max ? 'Choisissez d\'abord la taille' : required ? `Obligatoire · ${n}/${max}` : `Facultatif${max > 1 ? ` · jusqu'à ${max}` : ''}`}
                  </span>
                </div>
                {n > max && <p className="mt-1 text-sm font-semibold text-primary">Trop de choix pour cette taille : retirez-en {n - max}.</p>}
                <div className="mt-3 grid gap-2">
                  {g.choices.map((c) => {
                    const off = isOut(c)
                    const q = qOf(g, c)
                    const on = q > 0
                    const full = n >= max && !on
                    if (g.repeat) return (
                      <div key={c.id} className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${on ? 'border-foreground' : 'border-transparent bg-secondary'} ${off ? 'opacity-50' : ''}`}>
                        <span className="flex-1 font-medium">{c.label}{c.price ? <span className="text-muted-foreground"> · +{eur(c.price)}</span> : null}{off && <span className="ml-2 text-xs font-semibold text-primary">Épuisé</span>}</span>
                        {on && <button type="button" onClick={() => step(g, c, -1)} aria-label={`Retirer ${c.label}`} className="grid size-9 place-items-center rounded-full border bg-background"><Minus className="size-4" /></button>}
                        {on && <span className="w-5 text-center font-bold" aria-live="polite">{q}</span>}
                        <button type="button" disabled={off || n >= max} onClick={() => step(g, c, 1)} aria-label={`Ajouter ${c.label}`} className="grid size-9 place-items-center rounded-full bg-foreground text-background disabled:opacity-30"><Plus className="size-4" /></button>
                      </div>
                    )
                    return (
                      <div key={c.id}>
                        <button type="button" disabled={off || (full && !single && !c.exclusive)} onClick={() => pick(g, c)} aria-pressed={on}
                          className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left disabled:opacity-45 ${on ? 'border-foreground' : 'border-transparent bg-secondary'}`}>
                          <span className={`grid size-6 shrink-0 place-items-center border-2 ${single ? 'rounded-full' : 'rounded-md'} ${on ? 'border-foreground bg-foreground text-background' : 'border-input bg-background'}`}>{on && <Check className="size-4" />}</span>
                          <span className="flex-1 font-medium">{c.label}</span>
                          {off ? <span className="text-xs font-semibold text-primary">Épuisé</span> : c.price ? <span className="text-sm text-muted-foreground">+{eur(c.price)}</span> : null}
                        </button>
                        {on && c.sub && (
                          <div className="ml-9 mt-2 flex gap-2" role="radiogroup" aria-label={`${c.sub.label} pour ${c.label}`}>
                            {c.sub.choices.map((s) => {
                              const cur = sel.find((x) => x.g === g.id && x.c === c.id)?.s === s.id
                              return <button key={s.id} type="button" role="radio" aria-checked={cur} onClick={() => setSub(g, c, s.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${cur ? 'bg-foreground text-background' : 'bg-secondary'}`}>{s.label}</button>
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <label className="mt-6 block">
            <span className="text-lg font-bold">Remarque</span>
            <span className="block text-xs text-muted-foreground">Facultatif. Une remarque ne remplace pas un supplément payant.</span>
            <textarea value={remarque} onChange={(e) => setRemarque(e.target.value)} maxLength={120} rows={2} placeholder="Ex. bien cuit" className="mt-2 w-full rounded-xl border px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="border-t px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {tried && !result.ok && <p role="alert" className="mb-2 text-sm font-semibold text-primary">{result.message}</p>}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-secondary p-1">
              <button type="button" onClick={() => setQte(Math.max(1, qte - 1))} aria-label="Moins" className="grid size-9 place-items-center rounded-full bg-background"><Minus className="size-4" /></button>
              <span className="w-5 text-center font-bold">{qte}</span>
              <button type="button" onClick={() => setQte(Math.min(10, qte + 1))} aria-label="Plus" className="grid size-9 place-items-center rounded-full bg-background"><Plus className="size-4" /></button>
            </div>
            <button type="button" onClick={submit} className={`flex-1 rounded-full py-3.5 font-semibold text-primary-foreground ${result.ok ? 'bg-primary hover:bg-primary-deep' : 'bg-primary/50'}`}>
              Ajouter · {eur(unit * qte)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
