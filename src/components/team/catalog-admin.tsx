import { useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ExternalLink, ImagePlus, Trash2, UtensilsCrossed } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { eur } from '@/lib/shop'
import { BANNER_URL } from '@/components/site-header'

const DEFAULT_LIVREUR = 'https://assets.macaly-user-data.dev/zgfxow2hgzl8wsnnzizdoesa/tbvviwl9i723zscfyynjrjtl/ffWYIa9QwpkG2fdVbJa0Y/livreur-L5-2h9Xt.webp'
const ACCEPT = 'image/jpeg,image/png,image/webp'
type Kind = 'hero' | 'une' | 'bandeau' | 'livreur' | 'galerie'

function useImageUpload() {
  const createUpload = useAction(api.appFiles.createImageUpload)
  return async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Formats acceptés : JPEG, PNG ou WebP.')
    if (file.size > 8 * 1024 * 1024) throw new Error('Image trop lourde (8 Mo maximum).')
    const grant = await createUpload({ filename: file.name, contentType: file.type, fileSize: file.size })
    const r = await fetch(grant.uploadUrl, { method: grant.method, headers: grant.headers, body: file })
    if (!r.ok) throw new Error(`Envoi échoué (${r.status})`)
    return grant.fileId
  }
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-[1.5rem] bg-secondary p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {intro && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

export function CatalogAdmin() {
  const res = useQuery(api.menu.adminItems, {})
  const upload = useImageUpload()
  const finalizeDish = useAction(api.appFiles.finalizeDishImage)
  const removeDish = useAction(api.appFiles.removeDishImage)
  const deleteDish = useAction(api.appFiles.deleteDish)
  const finalizePromo = useAction(api.appFiles.finalizePromoImage)
  const deletePromo = useAction(api.appFiles.deletePromo)
  const updateItem = useMutation(api.menu.updateItem)
  const addItem = useMutation(api.menu.addItem)
  const updateZone = useMutation(api.menu.updateZone)
  const updatePromoText = useMutation(api.menu.updatePromoText)
  const updateSettings = useMutation(api.menu.updateSettings)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [texts, setTexts] = useState({ heroTitle: '', heroText: '', annonce: '' })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { if (res && res.ok && !loaded) { setTexts(res.settings); setLoaded(true) } }, [res, loaded])

  if (res === undefined) return <p className="text-muted-foreground">Chargement…</p>
  if (!res.ok) return <p className="text-destructive">{res.message}</p>

  async function guard(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key)
    try { const r = await fn() as { ok?: boolean; message?: string } | undefined; if (r && r.ok === false) toast.error(r.message ?? 'Erreur'); else toast.success(ok) }
    catch (e) { toast.error(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Erreur') }
    finally { setBusy(null) }
  }
  const pick = (cb: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) cb(f) }
  const sendPhoto = (kind: Kind, ok: string) => pick((f) => guard(kind, async () => finalizePromo({ kind, fileId: await upload(f) }), ok))

  const slots: { kind: Kind; label: string; hint: string; url: string | null | undefined; fallback: string | null; ratio: string }[] = [
    { kind: 'bandeau', label: 'Bandeau du haut', hint: 'En haut de toutes les pages, derrière le logo. Photo large (paysage).', url: res.bandeau?.imageUrl, fallback: BANNER_URL, ratio: 'aspect-[3/1]' },
    { kind: 'hero', label: "Photo d'accueil", hint: 'À droite du titre, sur la page d\'accueil.', url: res.hero?.imageUrl, fallback: null, ratio: 'aspect-[4/3]' },
    { kind: 'livreur', label: 'Photo « livraison »', hint: 'Dans la partie qui présente le suivi du livreur.', url: res.livreur?.imageUrl, fallback: DEFAULT_LIVREUR, ratio: 'aspect-[4/3]' },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Modifier le site</h1>
          <p className="mt-1 text-sm text-muted-foreground">Chaque modification est en ligne immédiatement pour les clients. Photos acceptées : JPEG, PNG ou WebP, 8 Mo maximum (vos visuels Canva exportés en JPG ou PNG conviennent).</p>
        </div>
        <a href="/" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold"><ExternalLink className="size-4" /> Voir le site</a>
      </div>
      {busy && <p role="status" className="sticky top-2 z-30 w-fit rounded-full bg-foreground px-4 py-1.5 text-sm text-background">Enregistrement…</p>}

      <Section title="Textes de l'accueil" intro="Laissez un champ vide pour garder le texte d'origine. L'annonce s'affiche en haut de toutes les pages : fermeture exceptionnelle, plat du jour, promotion…">
        <form onSubmit={(e) => { e.preventDefault(); void guard('texts', () => updateSettings(texts), 'Textes enregistrés') }} className="grid gap-3">
          <label className="text-sm"><span className="mb-1 block font-semibold">Titre</span>
            <input value={texts.heroTitle} maxLength={80} placeholder="L'art de la grillade à la mahoraise" onChange={(e) => setTexts({ ...texts, heroTitle: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Phrase d'accueil</span>
            <textarea value={texts.heroText} maxLength={200} rows={2} placeholder="Plats maison préparés à Tsoundzou 2, livrés chez vous, à emporter ou sur place." onChange={(e) => setTexts({ ...texts, heroText: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Annonce (facultatif)</span>
            <input value={texts.annonce} maxLength={160} placeholder="Ex. Fermé exceptionnellement samedi 10 octobre" onChange={(e) => setTexts({ ...texts, annonce: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <div><button className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Enregistrer les textes</button></div>
        </form>
      </Section>

      <Section title="Photos du site">
        <div className="grid gap-4 md:grid-cols-3">
          {slots.map((s) => (
            <figure key={s.kind} className="space-y-2">
              <div className={`${s.ratio} overflow-hidden rounded-xl bg-background`}>
                {(s.url || s.fallback) ? <img src={(s.url || s.fallback)!} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted-foreground"><ImagePlus className="size-6" /></div>}
              </div>
              <figcaption><p className="font-semibold">{s.label}</p><p className="text-xs text-muted-foreground">{s.hint}</p></figcaption>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-semibold focus-within:ring-2 focus-within:ring-ring"><ImagePlus className="size-4" /> Changer
                <input type="file" accept={ACCEPT} className="sr-only" onChange={sendPhoto(s.kind, `${s.label} mise à jour`)} />
              </label>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="À la une" intro="Grandes affiches qui défilent sous l'introduction : nouveautés, offres, événements. Ajoutez un titre court si besoin.">
        <PhotoGrid items={res.une} ratio="aspect-[4/5]" withSubtitle
          onTitle={(p, title, subtitle) => guard('t' + p._id, () => updatePromoText({ promoId: p._id, title, subtitle }), 'Texte enregistré')}
          onDelete={(p) => guard('d' + p._id, () => deletePromo({ promoId: p._id }), 'Visuel retiré')}
          add={<AddTile label="Ajouter un visuel" onChange={sendPhoto('une', 'Visuel ajouté')} />} />
      </Section>

      <Section title="Galerie" intro="Photos de l'ambiance, du restaurant, de l'équipe ou d'un service traiteur. Elles s'affichent dans une galerie en bas de l'accueil.">
        <PhotoGrid items={res.galerie} ratio="aspect-square"
          onTitle={(p, title) => guard('t' + p._id, () => updatePromoText({ promoId: p._id, title, subtitle: '' }), 'Légende enregistrée')}
          onDelete={(p) => guard('d' + p._id, () => deletePromo({ promoId: p._id }), 'Photo retirée')}
          add={<AddTile label="Ajouter une photo" onChange={sendPhoto('galerie', 'Photo ajoutée à la galerie')} />} />
      </Section>

      <Section title="Plats, prix et photos" intro="Une photo prise en lumière du jour, sur un fond simple, donne envie. Décochez « En vente » pour masquer un plat le temps d'une rupture.">
        <div className="grid gap-3 md:grid-cols-2">
          {res.items.map((it) => (
            <div key={it._id} className={`flex gap-3 rounded-2xl bg-background p-3 ${it.active ? '' : 'opacity-60'}`}>
              <label className="relative size-24 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-secondary" title={it.imageUrl ? 'Changer la photo' : 'Ajouter une photo'}>
                {it.imageUrl ? <img src={it.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-muted-foreground"><UtensilsCrossed className="size-6" /></span>}
                <input type="file" accept={ACCEPT} className="sr-only" aria-label={`Photo de ${it.name}`} onChange={pick((f) => guard('i' + it._id, async () => finalizeDish({ itemId: it._id as Id<'menuItems'>, fileId: await upload(f) }), 'Photo en ligne'))} />
              </label>
              <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                <input defaultValue={it.name} maxLength={80} aria-label="Nom du plat" onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && guard('n' + it._id, () => updateItem({ itemId: it._id, name: e.target.value }), 'Nom enregistré')} className="w-full rounded border bg-background px-2 py-1 font-semibold" />
                <input defaultValue={it.description ?? ''} maxLength={160} placeholder="Description" aria-label="Description" onBlur={(e) => e.target.value !== (it.description ?? '') && guard('e' + it._id, () => updateItem({ itemId: it._id, description: e.target.value }), 'Description enregistrée')} className="w-full rounded border bg-background px-2 py-1 text-xs" />
                <div className="flex flex-wrap items-center gap-2">
                  <input defaultValue={it.category} maxLength={60} aria-label="Catégorie" onBlur={(e) => e.target.value.trim() && e.target.value !== it.category && guard('c' + it._id, () => updateItem({ itemId: it._id, category: e.target.value }), 'Catégorie enregistrée')} className="w-32 rounded border bg-background px-2 py-1 text-xs" />
                  <input type="number" step="0.1" min="0" max="500" defaultValue={it.price} aria-label="Prix en euros" onBlur={(e) => { const v = Number(e.target.value); if (v !== it.price) void guard('p' + it._id, () => updateItem({ itemId: it._id, price: v }), `Prix : ${eur(v)}`) }} className="w-20 rounded border bg-background px-2 py-1" /> €
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={it.active} onChange={(e) => guard('a' + it._id, () => updateItem({ itemId: it._id, active: e.target.checked }), e.target.checked ? 'Plat en vente' : 'Plat masqué')} /> En vente</label>
                  {it.imageUrl && <button type="button" onClick={() => guard('r' + it._id, () => removeDish({ itemId: it._id }), 'Photo retirée')} className="text-muted-foreground">Retirer la photo</button>}
                  {confirmDel === it._id
                    ? <button type="button" onClick={() => { setConfirmDel(null); void guard('x' + it._id, () => deleteDish({ itemId: it._id }), 'Plat supprimé') }} className="text-destructive">Confirmer la suppression</button>
                    : <button type="button" onClick={() => setConfirmDel(it._id)} className="ml-auto inline-flex items-center gap-1 text-muted-foreground"><Trash2 className="size-3" /> Supprimer</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <AddItem onAdd={(a) => guard('add', () => addItem(a), 'Plat ajouté')} />
      </Section>

      <Section title="Frais de livraison" intro="Livraison offerte dès 50 € et minimum de 10 € en livraison.">
        <div className="overflow-x-auto rounded-xl bg-background">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="p-3 font-medium">Quartier</th><th className="p-3 font-medium">Frais (€)</th><th className="p-3 font-medium">Délai annoncé</th></tr></thead>
            <tbody>{res.zones.map((z) => (
              <tr key={z._id} className="border-t">
                <td className="p-3 font-semibold">{z.name}</td>
                <td className="p-3"><input type="number" step="0.5" min="0" max="50" defaultValue={z.fee} aria-label={`Frais ${z.name}`} onBlur={(e) => Number(e.target.value) !== z.fee && guard('z' + z._id, () => updateZone({ zoneId: z._id, fee: Number(e.target.value), delai: z.delai }), 'Frais mis à jour')} className="w-20 rounded border px-2 py-1" /></td>
                <td className="p-3"><input defaultValue={z.delai} maxLength={30} aria-label={`Délai ${z.name}`} onBlur={(e) => e.target.value !== z.delai && guard('y' + z._id, () => updateZone({ zoneId: z._id, fee: z.fee, delai: e.target.value }), 'Délai mis à jour')} className="w-32 rounded border px-2 py-1" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

type PromoRow = { _id: Id<'promos'>; imageUrl: string; title?: string; subtitle?: string }

function PhotoGrid({ items, ratio, withSubtitle, onTitle, onDelete, add }: {
  items: PromoRow[]; ratio: string; withSubtitle?: boolean
  onTitle: (p: PromoRow, title: string, subtitle: string) => void
  onDelete: (p: PromoRow) => void
  add: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {add}
      {items.map((p) => (
        <figure key={p._id} className="overflow-hidden rounded-xl bg-background">
          <img src={p.imageUrl} alt="" className={`${ratio} w-full object-cover`} />
          <div className="space-y-1 p-2">
            <input defaultValue={p.title ?? ''} placeholder={withSubtitle ? 'Titre (facultatif)' : 'Légende (facultatif)'} maxLength={60} aria-label="Titre" onBlur={(e) => e.target.value !== (p.title ?? '') && onTitle(p, e.target.value, p.subtitle ?? '')} className="w-full rounded border px-2 py-1 text-xs" />
            {withSubtitle && <input defaultValue={p.subtitle ?? ''} placeholder="Sous-titre" maxLength={100} aria-label="Sous-titre" onBlur={(e) => e.target.value !== (p.subtitle ?? '') && onTitle(p, p.title ?? '', e.target.value)} className="w-full rounded border px-2 py-1 text-xs" />}
            <button type="button" onClick={() => onDelete(p)} className="inline-flex items-center gap-1 text-xs text-destructive"><Trash2 className="size-3" /> Retirer</button>
          </div>
        </figure>
      ))}
    </div>
  )
}

function AddTile({ label, onChange }: { label: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="grid min-h-40 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-input bg-background p-4 text-center text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-ring">
      <span className="flex flex-col items-center gap-2"><ImagePlus className="size-6" /> {label}</span>
      <input type="file" accept={ACCEPT} className="sr-only" onChange={onChange} />
    </label>
  )
}

function AddItem({ onAdd }: { onAdd: (a: { name: string; category: string; price: number; description: string }) => void }) {
  const [f, setF] = useState({ name: '', category: '', price: '', description: '' })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd({ ...f, price: Number(f.price) }); setF({ name: '', category: '', price: '', description: '' }) }} className="grid gap-2 rounded-2xl border-2 border-dashed border-input p-3 sm:grid-cols-6">
      <input required placeholder="Nouveau plat" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded border bg-background px-2 py-1.5 text-sm sm:col-span-2" />
      <input placeholder="Description" maxLength={160} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="rounded border bg-background px-2 py-1.5 text-sm sm:col-span-2" />
      <input required placeholder="Catégorie" maxLength={60} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="rounded border bg-background px-2 py-1.5 text-sm" />
      <div className="flex gap-2">
        <input required type="number" step="0.1" min="0" max="500" placeholder="Prix" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        <button className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">Ajouter</button>
      </div>
    </form>
  )
}
