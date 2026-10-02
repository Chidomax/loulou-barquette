import { useState } from 'react'
import { useAction } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Eye, EyeOff, Lock, Mail, ShieldCheck, User, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { saveKt } from '@/lib/team'

function Brand() {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src="/logo512.png" alt="Loulou Barquette" className="size-24 drop-shadow-md" />
    </div>
  )
}

const input = 'w-full rounded-xl border border-input bg-background py-3 pl-10 pr-3 text-base outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10'

/** Écran de connexion : espace responsable (compte personnel) et accès partagé de l'équipe. */
export function TeamLogin({ onKitchen }: { onKitchen: (kt: string) => void }) {
  const [tab, setTab] = useState<'equipe' | 'responsable'>('equipe')
  return (
    <div className="min-h-screen bg-[#f4f4f2] px-4 py-8">
      <div className="mx-auto mb-6 flex max-w-sm rounded-full bg-background p-1 shadow-sm lg:hidden" role="tablist">
        {(['equipe', 'responsable'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === t ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>{t === 'equipe' ? 'Équipe' : 'Responsable'}</button>
        ))}
      </div>
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2">
        <div className={tab === 'responsable' ? '' : 'hidden lg:block'}><ManagerLogin /></div>
        <div className={tab === 'equipe' ? '' : 'hidden lg:block'}><KitchenLogin onKitchen={onKitchen} /></div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground"><a href="/" className="underline">Retour au site</a></p>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[2rem] bg-background p-6 shadow-sm sm:p-8">{children}</div>
}

function ManagerLogin() {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Card>
      <Brand />
      <p className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold tracking-wide text-emerald-900"><ShieldCheck className="size-4" /> Espace responsable</p>
      <h1 className="mt-4 text-3xl font-bold">Bienvenue !</h1>
      <p className="mt-1 text-muted-foreground">Gérez votre restaurant en toute simplicité.</p>
      {step === 'email' ? (
        <form className="mt-6 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null)
          try { const fd = new FormData(e.currentTarget); await signIn('resend-otp', fd); setEmail(String(fd.get('email'))); setStep('code') }
          catch { setErr("Envoi du code impossible. Vérifiez l'adresse et réessayez.") } finally { setBusy(false) }
        }}>
          <label className="block text-sm font-semibold">Adresse e-mail
            <span className="relative mt-1.5 block"><Mail className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input name="email" type="email" required autoComplete="email" placeholder="Votre adresse e-mail" className={input} /></span>
          </label>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-foreground py-3.5 font-semibold text-background disabled:opacity-50">{busy ? 'Envoi du code…' : 'Recevoir mon code de connexion'}</button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null)
          try { await signIn('resend-otp', new FormData(e.currentTarget)) }
          catch { setErr('Code incorrect ou expiré.') } finally { setBusy(false) }
        }}>
          <input type="hidden" name="email" value={email} />
          <p className="text-sm">Code envoyé à <b>{email}</b> (valable 15 minutes).</p>
          <label className="block text-sm font-semibold">Code reçu par e-mail
            <span className="relative mt-1.5 block"><Lock className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" placeholder="6 chiffres" className={`${input} tracking-[0.3em]`} /></span>
          </label>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-foreground py-3.5 font-semibold text-background disabled:opacity-50">{busy ? 'Vérification…' : 'Se connecter'}</button>
          <button type="button" onClick={() => setStep('email')} className="w-full text-sm text-muted-foreground underline">Changer d'adresse</button>
        </form>
      )}
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Accès personnel et sécurisé, sans mot de passe à retenir.</p>
    </Card>
  )
}

function KitchenLogin({ onKitchen }: { onKitchen: (kt: string) => void }) {
  const login = useAction(api.access.kitchenLogin)
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <Card>
      <Brand />
      <p className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold tracking-wide text-emerald-900"><Users className="size-4" /> Espace équipe</p>
      <h1 className="mt-4 text-3xl font-bold">Prêts pour le service ?</h1>
      <p className="mt-1 text-muted-foreground">Retrouvez les commandes de Loulou Barquette.</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null)
        const fd = new FormData(e.currentTarget)
        try {
          const r = await login({ login: String(fd.get('login')), password: String(fd.get('password')), remember, label: deviceLabel() })
          if (r.ok) { saveKt(r.token, remember); onKitchen(r.token) } else setErr(r.message)
        } catch { setErr('Connexion impossible. Vérifiez le réseau et réessayez.') } finally { setBusy(false) }
      }}>
        <label className="block text-sm font-semibold">Identifiant équipe
          <span className="relative mt-1.5 block"><User className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input name="login" required autoComplete="username" placeholder="Cuisine Loulou Barquette" className={input} /></span>
        </label>
        <label className="block text-sm font-semibold">Mot de passe équipe
          <span className="relative mt-1.5 block"><Lock className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input name="password" type={show ? 'text' : 'password'} required autoComplete="current-password" className={`${input} pr-11`} />
            <button type="button" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground">{show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 size-5 accent-emerald-700" />
          <span><span className="font-medium">Rester connecté sur cet appareil</span><span className="block text-xs text-muted-foreground">À utiliser sur la tablette du restaurant. Sinon, déconnexion après 12 h.</span></span></label>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-foreground py-3.5 font-semibold text-background disabled:opacity-50">{busy ? 'Connexion…' : 'Accéder aux commandes'}</button>
      </form>
      <p className="mt-4 text-center text-sm">Besoin d'aide ? <a href="tel:+262639670113" className="font-semibold text-emerald-800 underline">Contactez le responsable</a></p>
      <p className="mt-4 flex items-center justify-center gap-2 border-t pt-4 text-xs text-muted-foreground"><Lock className="size-3.5" /> Les actions importantes demandent votre code personnel.</p>
    </Card>
  )
}

function deviceLabel() {
  const ua = navigator.userAgent
  const kind = /iPad|Tablet/i.test(ua) ? 'Tablette' : /Mobi|iPhone|Android/i.test(ua) ? 'Téléphone' : 'Ordinateur'
  const os = /iPhone|iPad|Mac/i.test(ua) ? 'Apple' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : ''
  return `${kind}${os ? ' ' + os : ''} · ${new Date().toLocaleDateString('fr-FR')}`
}

/** Prise de service : choix du prénom puis code personnel (pavé numérique). */
export function ShiftPicker({ kt, employees, onLogout }: { kt: string; employees: { _id: Id<'employees'>; prenom: string }[]; onLogout: () => void }) {
  const start = useAction(api.access.startShift)
  const [who, setWho] = useState<{ _id: Id<'employees'>; prenom: string } | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(code: string) {
    if (!who) return
    setBusy(true); setErr(null)
    try { const r = await start({ kt, employeeId: who._id, pin: code }); if (!r.ok) { setErr(r.message); setPin('') } }
    catch { setErr('Connexion perdue. Réessayez.'); setPin('') } finally { setBusy(false) }
  }
  const press = (d: string) => { if (busy) return; const next = (pin + d).slice(0, 6); setPin(next); setErr(null) }

  return (
    <div className="min-h-screen bg-[#f4f4f2] px-4 py-8">
      <div className="mx-auto max-w-md rounded-[2rem] bg-background p-6 shadow-sm sm:p-8">
        <img src="/logo512.png" alt="Loulou Barquette" className="mx-auto size-20" />
        {!who ? (
          <>
            <h1 className="mt-4 text-center text-2xl font-bold">Qui prend son service ?</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">Vos actions seront enregistrées à votre nom.</p>
            {employees.length === 0 && <p className="mt-6 rounded-xl bg-secondary p-4 text-center text-sm">Aucun employé enregistré. Le responsable doit en ajouter dans Paramètres → Employés.</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {employees.map((e) => (
                <button key={e._id} onClick={() => setWho(e)} className="rounded-2xl border-2 border-transparent bg-secondary p-4 text-left hover:border-foreground focus-visible:border-foreground">
                  <span className="grid size-11 place-items-center rounded-full bg-foreground text-lg font-bold text-background">{e.prenom[0]}</span>
                  <span className="mt-2 block font-semibold">{e.prenom}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(pin) }}>
            <h1 className="mt-4 text-center text-2xl font-bold">Bonjour {who.prenom}</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">Entrez votre code personnel</p>
            <div className="mt-5 flex justify-center gap-2" aria-live="polite" aria-label={`${pin.length} chiffres saisis`}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={`size-4 rounded-full ${i < pin.length ? 'bg-foreground' : 'bg-secondary'}`} />)}
            </div>
            <input aria-label="Code personnel" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="off" type="password" className="sr-only" autoFocus />
            {err && <p role="alert" className="mt-3 text-center text-sm text-destructive">{err}</p>}
            <div className="mx-auto mt-5 grid max-w-[260px] grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => press(d)} className="h-14 rounded-2xl bg-secondary text-xl font-semibold active:bg-input">{d}</button>)}
              <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="h-14 rounded-2xl text-sm font-semibold text-muted-foreground">Effacer</button>
              <button type="button" onClick={() => press('0')} className="h-14 rounded-2xl bg-secondary text-xl font-semibold active:bg-input">0</button>
              <button disabled={pin.length < 4 || busy} className="h-14 rounded-2xl bg-foreground text-sm font-semibold text-background disabled:opacity-40">{busy ? '…' : 'Valider'}</button>
            </div>
            <button type="button" onClick={() => { setWho(null); setPin(''); setErr(null) }} className="mt-5 w-full text-sm text-muted-foreground underline">Ce n'est pas moi</button>
          </form>
        )}
        <button onClick={onLogout} className="mt-6 w-full border-t pt-4 text-xs text-muted-foreground">Déconnecter cet appareil</button>
      </div>
    </div>
  )
}
