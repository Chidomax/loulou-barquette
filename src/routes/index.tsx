import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Bike, Clock, CreditCard, MapPin, Minus, Phone, Plus, ShieldCheck, ShoppingBag, Ticket, UtensilsCrossed } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { SiteHeader } from '@/components/site-header'
import { InstallApp } from '@/components/install-app'
import { Composer, type ComposerItem } from '@/components/composer'
import { shopState } from '@/convex/shared'
import { ZoneMap } from '@/components/zone-map'
import { FREE_DELIVERY_FROM, MIN_DELIVERY_ORDER, REWARD_POINTS, REWARD_VALUE, TR_DAILY_CAP, eur, rememberOrder, useCart } from '@/lib/shop'
import siteMetadata from '../metadata.json'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: siteMetadata['/'].title }, { name: 'description', content: siteMetadata['/'].description }] }),
  component: Home,
})

type Mode = 'livraison' | 'emporter' | 'surplace'
type Pay = 'cb' | 'tr' | 'place'

function Home() {
  const data = useQuery(api.menu.publicData, {})
  const cart = useCart()
  const placeOrder = useAction(api.orders.place)
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('livraison')
  const [zone, setZone] = useState('')
  const [adresse, setAdresse] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<Pay>('cb')
  const [emetteur, setEmetteur] = useState('Swile')
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [useReward, setUseReward] = useState(false)
  const [composing, setComposing] = useState<ComposerItem | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i) }, [])

  // Client connecté : coordonnées préremplies depuis son compte
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const me = useQuery(api.customers.me, isAuthenticated ? {} : 'skip')
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (!me || prefilled) return
    if (me.name) setNom(me.name)
    if (me.phone) setTel(me.phone)
    if (me.defaultZone) setZone(me.defaultZone)
    if (me.defaultAddress) setAdresse(me.defaultAddress)
    setPrefilled(true)
  }, [me, prefilled])

  const categories = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>['items']>()
    for (const it of data?.items ?? []) { if (!map.has(it.category)) map.set(it.category, []); map.get(it.category)!.push(it) }
    return [...map.entries()]
  }, [data])

  const zoneObj = data?.zones.find((z) => z.name === zone)
  const st = cart.subtotal
  const fee = mode === 'livraison' && zoneObj && st > 0 ? (st >= FREE_DELIVERY_FROM ? 0 : zoneObj.fee) : 0
  const canReward = !!me && me.points >= REWARD_POINTS && st >= MIN_DELIVERY_ORDER
  const remise = useReward && canReward ? REWARD_VALUE : 0
  const total = Math.round((st + fee - remise) * 100) / 100
  const trPart = pay === 'tr' ? Math.min(st - remise, TR_DAILY_CAP) : 0
  const cbPart = pay === 'tr' ? Math.round((total - trPart) * 100) / 100 : total
  const tooLow = mode === 'livraison' && st < MIN_DELIVERY_ORDER
  // Ouverture, pause et horaires (le serveur refuse de toute façon une commande hors service)
  const service = data ? shopState({ ...data.shop, pausedUntil: data.shop.pausedUntil ?? undefined }, now) : { accepting: true, reason: '', kind: 'open' as const }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!cart.lines.length) return
    setSending(true)
    try {
      const r = await placeOrder({
        nom, tel, mode, note, payMethod: pay, emetteurTr: pay === 'tr' ? emetteur : undefined,
        zone: mode === 'livraison' ? zone : undefined, adresse: mode === 'livraison' ? adresse : undefined,
        destLat: pos?.lat, destLng: pos?.lng,
        lignes: cart.lines.map((l) => ({ itemId: l.itemId as Id<'menuItems'>, qte: l.qte, ...(l.sel ? { sel: l.sel } : {}), ...(l.remarque ? { remarque: l.remarque } : {}) })),
        useReward: remise > 0,
      })
      if (!r.ok) { toast.error(r.message); return }
      rememberOrder(r.token, r.num)
      cart.clear()
      if (r.needsPayment) navigate({ to: '/checkout', search: { t: r.token } })
      else navigate({ to: '/suivi/$token', params: { token: r.token } })
    } catch {
      toast.error("La commande n'a pas pu être envoyée. Vérifiez votre connexion.")
    } finally { setSending(false) }
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <SiteHeader />

      {/* Introduction : texte net à gauche, photo à droite */}
      <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-4 pt-8 md:grid-cols-[1.1fr_1fr] md:gap-10 md:pt-12">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.02] sm:text-5xl">{data?.settings.heroTitle || "L'art de la grillade à la mahoraise"}</h1>
          <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">{data?.settings.heroText || 'Plats maison préparés à Tsoundzou 2, livrés chez vous, à emporter ou sur place.'}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="#carte" className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2">Voir la carte</a>
            <Link to="/suivi" className="font-semibold underline-offset-4 hover:underline">Suivre une commande</Link>
          </div>
          <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 text-sm">
            <div><dt className="text-muted-foreground">Lun. à sam.</dt><dd className="font-semibold">9h – 16h</dd></div>
            <div><dt className="text-muted-foreground">Livraison offerte</dt><dd className="font-semibold">dès 50 €</dd></div>
            <div><dt className="text-muted-foreground">Paiement</dt><dd className="font-semibold">CB, titre-resto</dd></div>
          </dl>
        </div>
        <div className="aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-secondary md:aspect-[4/3]">
          {data?.heroUrl && <img src={data.heroUrl} alt="Brochettes grillées sur la braise" className="h-full w-full object-cover" />}
        </div>
      </section>

      {/* À la une */}
      {!!data?.une.length && (
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="mb-4 mt-8 text-2xl font-bold">À la une</h2>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3">
            {data.une.map((p) => (
              <a key={p._id} href="#carte" className="relative h-72 w-64 shrink-0 snap-start overflow-hidden rounded-[1.25rem] bg-secondary">
                <img src={p.imageUrl} alt={p.title || 'Visuel'} loading="lazy" className="h-full w-full object-cover" />
                {(p.title || p.subtitle) && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-primary-foreground">
                    <p className="text-lg font-bold">{p.title}</p>
                    <p className="text-sm opacity-90">{p.subtitle}</p>
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Carte + panier */}
      <section id="carte" className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold">La carte</h2>
          <p className="mb-3 text-sm text-muted-foreground">Mamoudzou, Mayotte · Livraison offerte dès {eur(FREE_DELIVERY_FROM)}</p>
          <div className="sticky top-0 z-20 -mx-4 mb-2 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur">
            {categories.map(([c]) => (
              <a key={c} href={`#cat-${slug(c)}`} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">{c}</a>
            ))}
          </div>
          {data === undefined && <p className="py-10 text-center text-muted-foreground">Chargement de la carte…</p>}
          {categories.map(([cat, items]) => (
            <div key={cat} id={`cat-${slug(cat)}`} className="scroll-mt-32">
              <h3 className="mb-4 mt-10 text-xl font-bold">{cat}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3">
                {items.map((it) => (
                  <article key={it._id} className="flex flex-col">
                    <div className="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-secondary">
                      {it.imageUrl
                        ? <img src={it.imageUrl} alt={it.name} loading="lazy" className="h-full w-full object-cover" />
                        : <div className="grid h-full place-items-center text-muted-foreground"><UtensilsCrossed className="size-8 opacity-40" /></div>}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 pt-3">
                      <p className="font-semibold leading-tight">{it.name}</p>
                      <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{it.description}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-semibold">{it.groups ? `dès ${eur(it.price)}` : eur(it.price)}</span>
                        {it.outOfStock
                          ? <span className="rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-muted-foreground">Épuisé</span>
                          : it.groups
                            ? <button type="button" onClick={() => setComposing({ ...it, groups: it.groups! })} aria-label={`Composer ${it.name}`} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">Composer</button>
                            : <button type="button" onClick={() => { cart.add({ itemId: it._id, name: it.name, price: it.price }); toast.success(`${it.name} ajouté`) }} aria-label={`Ajouter ${it.name}`} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">Ajouter</button>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside id="panier" className="scroll-mt-24">
          <form onSubmit={submit} className="space-y-3 rounded-[1.5rem] bg-secondary p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <h2 className="text-xl font-bold">Votre panier</h2>
            {!isAuthenticated && (
              <Link to="/compte" className="block rounded-xl bg-background p-3 text-xs">
                <b className="text-primary">Connectez-vous pour commander</b> : création du compte en 1 minute avec votre e-mail. Coordonnées préremplies, suivi de vos commandes et 1 point par euro ({REWARD_POINTS} points = {eur(REWARD_VALUE)} offerts).
              </Link>
            )}
            {me && <p className="text-xs text-muted-foreground">Connecté{me.name ? ` : ${me.name}` : ''} · {me.points} point{me.points > 1 ? 's' : ''}. Cette commande vous rapportera des points.</p>}
            {me && cart.lines.length > 0 && (me.points >= REWARD_POINTS
              ? <label className="flex items-center gap-2 rounded-xl bg-background p-3 text-sm font-semibold text-accent"><input type="checkbox" checked={useReward} disabled={st < MIN_DELIVERY_ORDER} onChange={(e) => setUseReward(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Utiliser {REWARD_POINTS} points : −{eur(REWARD_VALUE)}{st < MIN_DELIVERY_ORDER ? ` (dès ${eur(MIN_DELIVERY_ORDER)} d'achats)` : ''}</label>
              : <p className="text-xs text-muted-foreground">Encore {REWARD_POINTS - me.points} points pour {eur(REWARD_VALUE)} de réduction.</p>)}
            {!cart.lines.length && <p className="text-sm text-muted-foreground">Votre panier est vide.</p>}
            {cart.lines.map((l) => (
              <div key={l.key} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">{l.name}</span>
                  <button type="button" aria-label={`Retirer un ${l.name}`} onClick={() => cart.change(l.key, -1)} className="grid size-7 place-items-center rounded-full border bg-background"><Minus className="size-3" /></button>
                  <span className="w-5 text-center">{l.qte}</span>
                  <button type="button" aria-label="Ajouter un" onClick={() => cart.change(l.key, 1)} className="grid size-7 place-items-center rounded-full border bg-background"><Plus className="size-3" /></button>
                  <span className="w-16 text-right">{eur(l.price * l.qte)}</span>
                </div>
                {(l.details?.length || l.remarque) && <ul className="mt-0.5 pr-24 text-xs text-muted-foreground">{l.details?.map((d) => <li key={d}>{d}</li>)}{l.remarque && <li>Remarque : {l.remarque}</li>}</ul>}
              </div>
            ))}

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1 text-sm font-semibold">
              {(['livraison', 'emporter', 'surplace'] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg py-2 ${mode === m ? 'bg-card shadow' : ''}`}>
                  {m === 'livraison' ? 'Livraison' : m === 'emporter' ? 'À emporter' : 'Sur place'}
                </button>
              ))}
            </div>

            {mode === 'livraison' && (
              <>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-sm font-semibold"><MapPin className="size-4 text-primary" /> Où êtes-vous ?</p>
                  {data && <ZoneMap zones={data.zones} selected={zone} pos={pos} onSelect={setZone} onPos={(p, z) => { setPos(p); if (z) setZone(z.name) }} />}
                </div>
                <Field label="Quartier">
                  <select required value={zone} onChange={(e) => setZone(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">
                    <option value="">Choisir…</option>
                    {data?.zones.map((z) => <option key={z.name} value={z.name}>{z.name} — {eur(z.fee)} · {z.delai}</option>)}
                  </select>
                </Field>
                <Field label="Adresse ou repère pour le livreur">
                  <input required maxLength={200} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Ex. maison bleue après la mosquée" className="w-full rounded-lg border bg-background px-3 py-2" />
                </Field>
              </>
            )}
            <Field label="Nom"><input required minLength={2} maxLength={60} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" className="w-full rounded-lg border bg-background px-3 py-2" /></Field>
            <Field label="Téléphone"><input required value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0639 XX XX XX" className="w-full rounded-lg border bg-background px-3 py-2" /></Field>
            <Field label="Allergies / remarques"><textarea maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border bg-background px-3 py-2" /></Field>

            <div className="space-y-1 border-t border-dashed pt-3 text-sm">
              <Row label="Sous-total" value={eur(st)} />
              <Row label="Livraison" value={mode !== 'livraison' ? '—' : !zoneObj ? 'selon quartier' : fee === 0 ? 'Offerte' : eur(fee)} />
              {remise > 0 && <Row label="Réduction fidélité" value={'− ' + eur(remise)} />}
              {mode === 'livraison' && st > 0 && st < FREE_DELIVERY_FROM && <p className="text-xs text-muted-foreground">Plus que {eur(FREE_DELIVERY_FROM - st)} pour la livraison offerte.</p>}
              <div className="flex justify-between pt-1 text-lg font-extrabold"><span>Total</span><span>{eur(total)}</span></div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Paiement</legend>
              <PayOption checked={pay === 'cb'} onChange={() => setPay('cb')} icon={<CreditCard className="size-4" />} label="Carte bancaire en ligne" />
              <PayOption checked={pay === 'tr'} onChange={() => setPay('tr')} icon={<Ticket className="size-4" />} label="Carte titre-restaurant" />
              <PayOption checked={pay === 'place'} onChange={() => setPay('place')} icon={<ShoppingBag className="size-4" />} label={mode === 'livraison' ? 'À la livraison' : 'Au retrait'} />
            </fieldset>
            {pay === 'tr' && (
              <div className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
                <select value={emetteur} onChange={(e) => setEmetteur(e.target.value)} aria-label="Émetteur" className="mb-1 w-full rounded-lg border bg-background px-2 py-1.5">
                  {['Swile', 'Edenred (Ticket Restaurant)', 'Pluxee', 'Up / Bimpli', 'Autre'].map((x) => <option key={x}>{x}</option>)}
                </select>
                <Row label="Part titre-restaurant" value={eur(trPart)} bold />
                <Row label="Complément carte bancaire" value={cbPart > 0 ? eur(cbPart) : 'Aucun'} bold />
                <p className="text-xs text-muted-foreground">Le titre-restaurant couvre les plats dans la limite de {eur(TR_DAILY_CAP)} par jour, du lundi au samedi. La livraison se règle par carte bancaire. Vous payez en deux étapes.</p>
              </div>
            )}
            {!service.accepting && <p role="status" className="rounded-xl bg-foreground p-3 text-sm font-semibold text-background">{service.reason} Vous pouvez préparer votre panier.</p>}
            {!isAuthenticated && !authLoading
              ? <Link to="/compte" className="block w-full rounded-full bg-primary py-3.5 text-center font-semibold text-primary-foreground hover:bg-primary-deep">Se connecter pour commander</Link>
              : <button disabled={!cart.lines.length || tooLow || sending || authLoading || !service.accepting} className="w-full rounded-full bg-primary py-3.5 font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-40">
                  {sending ? 'Envoi…' : pay === 'place' ? 'Commander' : 'Commander et payer'}
                </button>}
            {tooLow && cart.lines.length > 0 && <p className="text-center text-xs text-muted-foreground">Minimum de {eur(MIN_DELIVERY_ORDER)} pour la livraison.</p>}
            <p className="text-center text-[11px] text-muted-foreground">Vos nom, téléphone et adresse servent uniquement à cette commande et sont effacés après 30 jours.</p>
          </form>
        </aside>
      </section>

      {/* Frais de livraison */}
      {!!data?.zones.length && (
        <section id="livraison" className="mx-auto mt-10 max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Frais de livraison</h2>
          <p className="mt-1 text-muted-foreground">Livraison offerte dès {eur(FREE_DELIVERY_FROM)} de commande. Minimum {eur(MIN_DELIVERY_ORDER)} pour être livré.</p>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {[...data.zones].sort((x, y) => x.fee - y.fee).map((z) => (
              <li key={z.name} className="flex items-baseline justify-between gap-3 border-b py-3">
                <span><span className="font-semibold">{z.name}</span>{z.delai && <span className="block text-sm text-muted-foreground">{z.delai}</span>}</span>
                <span className="font-semibold">{eur(z.fee)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Suivi façon livraison à domicile */}
      <section className="mx-auto my-8 max-w-6xl px-4">
        <div className="grid overflow-hidden rounded-[1.75rem] bg-secondary md:grid-cols-2">
          <img src={data?.livreurUrl ?? "https://assets.macaly-user-data.dev/zgfxow2hgzl8wsnnzizdoesa/tbvviwl9i723zscfyynjrjtl/ffWYIa9QwpkG2fdVbJa0Y/livreur-L5-2h9Xt.webp"} alt="Livreur en scooter" loading="lazy" className="h-full max-h-80 w-full object-cover" />
          <div className="space-y-3 p-6">
            <h2 className="text-2xl font-bold">Voyez votre livreur arriver</h2>
            <p className="text-muted-foreground">Dès que votre commande part, sa position s'affiche sur la carte et se met à jour toute seule, avec une estimation du temps d'arrivée. Sa position n'est partagée que pendant votre livraison, puis elle est effacée.</p>
          </div>
        </div>
      </section>

      {cart.count > 0 && (
        <a href="#panier" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-full bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-lg lg:hidden">
          <span>Voir le panier ({cart.count})</span><span>{eur(total)}</span>
        </a>
      )}
      {/* Galerie (photos ajoutées par le gérant) */}
      {!!data?.galerie.length && (
        <section className="mx-auto mt-12 max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Chez Loulou Barquette</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.galerie.map((p, i) => (
              <figure key={p._id} className={i === 0 && data.galerie.length > 2 ? 'col-span-2 row-span-2' : ''}>
                <img src={p.imageUrl} alt={p.title || 'Photo du restaurant'} loading="lazy" className="aspect-square h-full w-full rounded-[1.25rem] object-cover" />
                {p.title && <figcaption className="mt-1.5 text-sm text-muted-foreground">{p.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {composing && data && (
        <Composer item={composing} outIngredients={data.outIngredients} onClose={() => setComposing(null)}
          onAdd={(r) => { cart.add({ itemId: composing._id, name: composing.name, price: r.price, sel: r.sel, details: r.details, remarque: r.remarque }, r.qte); toast.success(`${composing.name} ajouté au panier`); setComposing(null) }} />
      )}

      <div className="mx-auto mt-12 max-w-6xl px-4"><InstallApp /></div>

      <footer className="mt-12 border-t py-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-3"><img src="/logo192.png" alt="" className="size-14" /><div><p className="text-lg font-bold">Loulou Barquette</p><p className="text-muted-foreground">Restaurant, snack et traiteur</p></div></div>
          <div><p className="font-semibold">13 Impasse Longchamps, Tsoundzou 2</p><p className="text-muted-foreground">97600 Mamoudzou · Ouvert de 9h à 16h, fermé le dimanche</p></div>
          <div className="space-y-1"><a href="tel:+262639670113" className="inline-flex items-center gap-1 font-semibold text-primary"><Phone className="size-4" /> 06 39 67 01 13</a><p className="text-muted-foreground">Une allergie ? Indiquez-la dans votre commande ou appelez-nous.</p></div>
        </div>
      </footer>
    </div>
  )
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>{children}</label>
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className={bold ? 'font-bold text-foreground' : ''}>{value}</span></div>
}
function PayOption({ checked, onChange, icon, label }: { checked: boolean; onChange: () => void; icon: React.ReactNode; label: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-background p-3 text-sm ${checked ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}>
      <input type="radio" name="pay" checked={checked} onChange={onChange} className="accent-primary" />
      {icon}<span>{label}</span>
    </label>
  )
}
