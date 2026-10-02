import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '@/convex/_generated/api'
import { type Kind, TeamContext, clearKt, readKt } from '@/lib/team'
import { ShiftPicker, TeamLogin } from '@/components/team/login'
import { type Page, Shell, pagesFor } from '@/components/team/shell'
import { OrdersPage } from '@/components/team/orders'
import { MenuStockPage } from '@/components/team/menu-stock'
import { HoursPage, OverviewPage, PaymentsPage, ProfilePage, SettingsPage } from '@/components/team/admin-pages'
import { DriverBoard } from '@/components/team/driver-board'
import { CatalogAdmin } from '@/components/team/catalog-admin'
import siteMetadata from '../metadata.json'

export const Route = createFileRoute('/equipe')({
  head: () => ({ meta: [{ title: siteMetadata['/equipe'].title }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: TeamPage,
})

function TeamPage() {
  const [kt, setKt] = useState<string | null | undefined>(undefined)
  useEffect(() => { setKt(readKt()) }, [])
  const logoutKitchen = useCallback(() => { clearKt(); setKt(null) }, [])
  if (kt === undefined) return <Loading />
  if (kt) return <KitchenApp kt={kt} onLogout={logoutKitchen} />
  return (
    <>
      <AuthLoading><Loading /></AuthLoading>
      <Unauthenticated><TeamLogin onKitchen={setKt} /></Unauthenticated>
      <Authenticated><AccountApp /></Authenticated>
    </>
  )
}

function Loading() { return <p className="grid min-h-screen place-items-center text-muted-foreground">Chargement…</p> }

/** Appareil cuisine partagé : session vérifiée par le serveur, puis prise de service par employé. */
function KitchenApp({ kt, onLogout }: { kt: string; onLogout: () => void }) {
  const me = useQuery(api.access.kitchenMe, { kt })
  const logout = useMutation(api.access.kitchenLogout)
  const out = useCallback(() => { void logout({ kt }).catch(() => undefined); onLogout() }, [kt, logout, onLogout])
  useEffect(() => { if (me && !me.ok) onLogout() }, [me, onLogout])
  if (me === undefined) return <Loading />
  if (!me.ok) return <Loading />
  if (!me.employee) return <ShiftPicker kt={kt} employees={me.employees} onLogout={out} />
  return (
    <TeamContext.Provider value={{ kt, kind: 'kitchen', label: me.employee.prenom, logout: out }}>
      <Workspace kind="kitchen" />
    </TeamContext.Provider>
  )
}

/** Compte personnel (responsable, équipe, livreur). */
function AccountApp() {
  const me = useQuery(api.users.me, {})
  const claim = useMutation(api.users.claimRole)
  const { signOut } = useAuthActions()
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (me && !me.role) claim({}).then((r) => { if (!r.ok) setMsg(r.message) }) }, [me, claim])
  if (me === undefined) return <Loading />
  if (!me) return <Loading />
  if (!me.role) return (
    <div className="grid min-h-screen place-items-center bg-[#f4f4f2] p-4">
      <div className="max-w-md rounded-3xl bg-background p-6 text-center">
        <img src="/logo192.png" alt="" className="mx-auto size-16" />
        <p className="my-4">{msg ?? 'Vérification de vos accès…'}</p>
        <button onClick={() => void signOut()} className="rounded-xl border px-4 py-2 font-semibold">Se déconnecter</button>
      </div>
    </div>
  )
  return (
    <TeamContext.Provider value={{ kind: me.role as Kind, label: me.name || me.email || 'Compte', logout: () => void signOut() }}>
      <Workspace kind={me.role as Kind} />
    </TeamContext.Provider>
  )
}

const HASH: Record<string, Page> = { site: 'site', commandes: 'commandes', menu: 'menu', apercu: 'apercu', horaires: 'horaires', paiements: 'paiements', parametres: 'parametres', livraisons: 'livraisons', terminees: 'terminees', profil: 'profil' }

function Workspace({ kind }: { kind: Kind }) {
  const allowed = pagesFor(kind)
  const initial: Page = kind === 'driver' ? 'livraisons' : 'commandes'
  const [page, setPageState] = useState<Page>(initial)
  useEffect(() => {
    const fromHash = HASH[window.location.hash.slice(1)]
    if (fromHash && allowed.includes(fromHash)) setPageState(fromHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setPage = (p: Page) => { if (!allowed.includes(p)) return; setPageState(p); history.replaceState(null, '', `#${p}`); window.scrollTo(0, 0) }
  return (
    <Shell page={page} setPage={setPage}>
      {page === 'apercu' && <OverviewPage go={setPage} />}
      {(page === 'commandes' || page === 'terminees') && <OrdersPage view={page} />}
      {page === 'menu' && <MenuStockPage />}
      {page === 'livraisons' && <DriverBoard />}
      {page === 'horaires' && <HoursPage />}
      {page === 'paiements' && <PaymentsPage />}
      {page === 'site' && <CatalogAdmin />}
      {page === 'parametres' && <SettingsPage />}
      {page === 'profil' && <ProfilePage />}
    </Shell>
  )
}
