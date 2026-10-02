import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'

export function SignInForm({
  title = 'Espace équipe',
  intro = "Réservé au gérant, à l'équipe et aux livreurs invités. Un code à 6 chiffres vous sera envoyé par e-mail.",
}: { title?: string; intro?: string }) {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      setEmail(String(fd.get('email')))
      await signIn('resend-otp', fd)
      setStep('code')
    } catch { setError("Le code n'a pas pu être envoyé. Réessayez.") } finally { setLoading(false) }
  }
  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setLoading(true)
    try { await signIn('resend-otp', new FormData(e.currentTarget)) }
    catch { setError('Code incorrect ou expiré.') } finally { setLoading(false) }
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-2"><KeyRound className="size-5 text-primary" /><h1 className="text-2xl font-extrabold">{title}</h1></div>
      {step === 'email' ? (
        <form onSubmit={sendEmail} className="space-y-3">
          <p className="text-sm text-muted-foreground">{intro}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.com" disabled={loading} className="w-full rounded-lg border bg-background px-3 py-2" />
          <button disabled={loading} className="w-full rounded-lg bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">{loading ? 'Envoi…' : 'Recevoir un code'}</button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-3">
          <p className="text-sm text-muted-foreground">Code envoyé à <b>{email}</b>. Il est valable 15 minutes.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input name="email" value={email} type="hidden" />
          <input name="code" type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" placeholder="Code à 6 chiffres" disabled={loading} className="w-full rounded-lg border bg-background px-3 py-2 text-center text-xl tracking-[0.4em]" />
          <button disabled={loading} className="w-full rounded-lg bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">{loading ? 'Vérification…' : 'Se connecter'}</button>
          <button type="button" onClick={() => { setStep('email'); setError(null) }} className="w-full text-sm text-muted-foreground">Utiliser une autre adresse</button>
        </form>
      )}
    </div>
  )
}
