import { useEffect } from 'react'
import { Check, Plus, UtensilsCrossed, X } from 'lucide-react'
import { eur } from '@/lib/shop'

export type Side = { _id: string; name: string; price: number; description: string; imageUrl: string | null; outOfStock: boolean }

/**
 * Suggestion d'accompagnements juste après l'ajout d'un plat.
 * Chaque accompagnement ajouté devient une ligne normale du panier (prix vérifié par le serveur).
 */
export function SidesSheet({ dish, sides, inCart, onAdd, onClose }: {
  dish: string
  sides: Side[]
  inCart: (id: string) => number
  onAdd: (s: Side) => void
  onClose: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Ajouter un accompagnement" className="w-full rounded-t-[1.75rem] bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-[1.75rem]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Check className="size-4" /> {dish} ajouté</p>
            <h2 className="mt-1 text-2xl font-bold">Un accompagnement avec ?</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-full p-1.5 hover:bg-secondary"><X className="size-5" /></button>
        </div>
        <ul className="mt-4 space-y-2">
          {sides.map((s) => {
            const n = inCart(s._id)
            return (
              <li key={s._id} className="flex items-center gap-3 rounded-2xl bg-secondary p-2.5 pr-3">
                {s.imageUrl ? <img src={s.imageUrl} alt="" className="size-14 rounded-xl object-cover" /> : <span className="grid size-14 place-items-center rounded-xl bg-background text-muted-foreground"><UtensilsCrossed className="size-5" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.name.replace(/^\+\s*/, '')}</span>
                  <span className="block text-sm text-muted-foreground">{s.description || eur(s.price)}{s.description ? ` · ${eur(s.price)}` : ''}</span>
                </span>
                {s.outOfStock
                  ? <span className="text-sm font-semibold text-muted-foreground">Épuisé</span>
                  : <button type="button" onClick={() => onAdd(s)} aria-label={`Ajouter ${s.name}`} className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold ${n ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground'}`}>
                      {n ? <><Check className="size-4" /> {n}</> : <><Plus className="size-4" /> Ajouter</>}
                    </button>}
              </li>
            )
          })}
        </ul>
        <button onClick={onClose} className="mt-4 w-full rounded-full border py-3 font-semibold">{sides.some((s) => inCart(s._id)) ? 'Continuer' : 'Non merci'}</button>
      </div>
    </div>
  )
}
