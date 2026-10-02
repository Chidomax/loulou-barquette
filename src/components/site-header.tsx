import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { ChevronDown, Clock, Mail, MapPin, Phone, Star } from 'lucide-react'
import { api } from '@/convex/_generated/api'

export const BANNER_URL = 'https://assets.macaly-user-data.dev/zgfxow2hgzl8wsnnzizdoesa/tbvviwl9i723zscfyynjrjtl/vbdLpifQVM9UDrSrh8PeJ/bougainvillier-5hZoD8o2.webp'

/** Menu déroulant simple (fermeture au clic extérieur et avec Échap). */
function Menu({ label, children, align = 'right' }: { label: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full bg-card/80 px-3 py-1.5 font-semibold text-foreground shadow-sm backdrop-blur hover:bg-card">
        {label}<ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} className={`absolute top-full z-50 mt-2 w-72 rounded-2xl border bg-card p-3 text-sm text-foreground shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.customers.me, isAuthenticated ? {} : 'skip')
  const { signOut } = useAuthActions()
  const firstName = me?.name ? me.name.split(' ')[0] : null
  const site = useQuery(api.menu.publicData, {})
  const annonce = site?.settings.annonce

  return (
    <>
      <header className={`relative overflow-visible bg-card ${compact ? 'h-28 sm:h-36' : 'h-40 sm:h-56'}`}>
        <img src={site?.bannerUrl ?? BANNER_URL} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="relative mx-auto flex h-full max-w-6xl items-start justify-between gap-3 px-4 pt-3">
          <Link to="/" aria-label="Loulou Barquette, accueil" className="shrink-0">
            <img src="/logo512.png" alt="Loulou Barquette, restaurant-snack" className={`drop-shadow-xl transition hover:scale-[1.02] ${compact ? 'size-24 sm:size-32' : 'size-32 sm:size-48'}`} />
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-xs sm:text-sm">
            {isAuthenticated && me && (
              <Link to="/compte" className="hidden items-center gap-1 rounded-full bg-card/80 px-3 py-1.5 font-semibold text-foreground shadow-sm backdrop-blur sm:inline-flex">
                <Star className="size-4 text-accent" /> Vous avez {me.points} point{me.points > 1 ? 's' : ''}
              </Link>
            )}
            <Menu label="Infos restaurant">
              <p className="mb-2 font-display text-base font-bold">Loulou Barquette</p>
              <p className="mb-2 flex gap-2"><MapPin className="size-4 shrink-0 text-primary" /> 13 Impasse Longchamps, Tsoundzou 2, 97600 Mamoudzou</p>
              <p className="mb-2 flex gap-2"><Clock className="size-4 shrink-0 text-primary" /> Ouvert de 9h à 16h, du lundi au samedi. Fermé le dimanche.</p>
              <a href="tel:+262639670113" className="mb-2 flex gap-2 font-semibold text-primary"><Phone className="size-4 shrink-0" /> 06 39 67 01 13</a>
              <a href="mailto:louloubarquette976@gmail.com" className="mb-2 flex gap-2"><Mail className="size-4 shrink-0 text-primary" /> louloubarquette976@gmail.com</a>
              <a href="https://www.tiktok.com/@louloubarquette" target="_blank" rel="noopener noreferrer" className="flex gap-2 underline">TikTok @louloubarquette</a>
              <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">Sur place, à emporter, en livraison et service traiteur. Livraison offerte dès 50 €.</p>
            </Menu>
            {isAuthenticated && me ? (
              <Menu label={<>Bienvenue{firstName ? `, ${firstName}` : ''}</>}>
                <p className="mb-2 flex items-center gap-1 font-semibold sm:hidden"><Star className="size-4 text-accent" /> {me.points} point{me.points > 1 ? 's' : ''}</p>
                <Link to="/compte" className="block rounded-lg px-2 py-2 hover:bg-secondary">Mon compte</Link>
                <Link to="/compte" hash="commandes" className="block rounded-lg px-2 py-2 hover:bg-secondary">Mes commandes</Link>
                {me.isAdmin && <Link to="/equipe" hash="site" className="block rounded-lg px-2 py-2 font-semibold text-primary hover:bg-secondary">Modifier le site</Link>}
                {me.isStaff && <Link to="/equipe" className="block rounded-lg px-2 py-2 hover:bg-secondary">Espace équipe</Link>}
                <button type="button" onClick={() => void signOut()} className="block w-full rounded-lg px-2 py-2 text-left text-muted-foreground hover:bg-secondary">Se déconnecter</button>
              </Menu>
            ) : (
              <Link to="/compte" className="rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground shadow-sm hover:bg-primary-deep">Se connecter</Link>
            )}
          </nav>
        </div>
      </header>
      {annonce && <p role="status" className="bg-foreground px-4 py-2.5 text-center text-sm font-semibold text-background">{annonce}</p>}
      <p className="border-b px-4 py-1.5 text-center text-[11px] text-muted-foreground">
        Version de démonstration : paiements en mode test, aucun argent réel (carte d'essai 4242 4242 4242 4242).
        {' '}<Link to="/equipe" className="underline">Espace équipe</Link>
      </p>
    </>
  )
}
