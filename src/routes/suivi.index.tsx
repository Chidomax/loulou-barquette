import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { SiteHeader } from '@/components/site-header'
import { myOrders } from '@/lib/shop'
import siteMetadata from '../metadata.json'

export const Route = createFileRoute('/suivi/')({
  head: () => ({ meta: [{ title: siteMetadata['/suivi'].title }, { name: 'robots', content: 'noindex' }] }),
  component: MyOrders,
})

function MyOrders() {
  const [list, setList] = useState<ReturnType<typeof myOrders> | null>(null)
  useEffect(() => setList(myOrders()), [])
  return (
    <div className="min-h-screen">
      <SiteHeader compact />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-3xl font-extrabold">Mes commandes</h1>
        {list === null ? null : list.length === 0 ? (
          <p className="text-muted-foreground">Aucune commande récente sur cet appareil. <Link to="/" className="font-bold text-primary underline">Commander</Link></p>
        ) : (
          <ul className="space-y-2">
            {list.map((o) => (
              <li key={o.token}>
                <Link to="/suivi/$token" params={{ token: o.token }} className="flex justify-between rounded-2xl border bg-card p-4 font-semibold hover:border-primary">
                  <span>{o.num}</span><span className="text-sm text-muted-foreground">{new Date(o.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
