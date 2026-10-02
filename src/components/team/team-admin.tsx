import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'

const ROLE: Record<string, string> = { admin: 'Gérant', staff: 'Équipe (caisse/cuisine)', driver: 'Livreur' }

export function TeamAdmin() {
  const res = useQuery(api.users.team, {})
  const invite = useMutation(api.users.invite)
  const revoke = useMutation(api.users.revokeInvite)
  const remove = useMutation(api.users.removeAccess)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'staff' | 'driver' | 'admin'>('driver')

  if (res === undefined) return <p className="text-muted-foreground">Chargement…</p>
  if (!res.ok) return <p className="text-destructive">{res.message}</p>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={async (e) => { e.preventDefault(); const r = await invite({ email, role, displayName: name }); if (r.ok) { toast.success('Invitation enregistrée'); setEmail(''); setName('') } else toast.error(r.message) }} className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-xl font-extrabold">Inviter une personne</h2>
        <p className="text-sm text-muted-foreground">Elle se connecte sur cette page avec son adresse e-mail et reçoit un code. Son accès correspond au rôle choisi ici, rien de plus.</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input required type="email" placeholder="adresse@e-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border px-3 py-2 sm:col-span-2" />
          <input placeholder="Prénom (vu par le client)" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-3 py-2" />
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="rounded-lg border px-3 py-2">
            <option value="driver">Livreur</option><option value="staff">Équipe</option><option value="admin">Gérant</option>
          </select>
        </div>
        <button className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Inviter</button>
      </form>

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-2 text-xl font-extrabold">Membres</h2>
        <ul className="divide-y">
          {res.members.map((m) => (
            <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><b>{m.name || m.email}</b> · {m.email} · {ROLE[m.role]}</span>
              {m._id !== res.me && <button onClick={async () => { const r = await remove({ userId: m._id }); if (r.ok) toast.success('Accès retiré et sessions fermées'); else toast.error(r.message) }} className="text-destructive underline">Retirer l'accès</button>}
            </li>
          ))}
        </ul>
        {res.invites.length > 0 && <>
          <h3 className="mb-1 mt-4 font-bold">Invitations en attente</h3>
          <ul className="divide-y">{res.invites.map((i) => (
            <li key={i._id} className="flex justify-between py-2 text-sm"><span>{i.email} · {ROLE[i.role]}</span><button onClick={() => revoke({ inviteId: i._id })} className="text-muted-foreground underline">Annuler</button></li>
          ))}</ul>
        </>}
      </div>
    </div>
  )
}
