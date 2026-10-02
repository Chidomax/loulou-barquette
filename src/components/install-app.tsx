import { useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { useInstall } from '@/lib/pwa'

const DISMISS_KEY = 'lb_install_dismissed'
const readDismissed = () => { try { return window.localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

/** Carte « Installer l'application » : bouton natif sur Android, consignes pas à pas sur iPhone. */
export function InstallApp({ audience = 'client' }: { audience?: 'client' | 'equipe' }) {
  const { state, install } = useInstall()
  const [dismissed, setDismissed] = useState(() => typeof window !== 'undefined' && readDismissed())
  const [showIos, setShowIos] = useState(false)

  if (state === 'installed' || state === 'none' || dismissed) return null
  const close = () => { setDismissed(true); try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } }
  const text = audience === 'equipe'
    ? "Ouvrez les commandes et vos livraisons d'un geste, en plein écran, avec les alertes."
    : 'Commandez en deux touches, suivez votre livreur et recevez les alertes de votre commande.'

  return (
    <div className="relative flex items-start gap-4 rounded-[1.5rem] bg-secondary p-4 sm:items-center sm:p-5">
      <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-2xl shadow-sm sm:size-14" />
      <div className="min-w-0 flex-1 pr-6">
        <p className="font-bold">L'application Loulou Barquette</p>
        <p className="text-sm text-muted-foreground">{text}</p>
        {state === 'prompt' && (
          <button type="button" onClick={() => void install()} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">Installer l'application</button>
        )}
        {state === 'ios' && !showIos && (
          <button type="button" onClick={() => setShowIos(true)} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">Installer sur iPhone</button>
        )}
        {state === 'ios' && showIos && (
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">1</span><span className="pt-0.5">Dans Safari, touchez <Share className="inline size-4 align-text-bottom" aria-hidden /> <b>Partager</b></span></li>
            <li className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">2</span><span className="pt-0.5">Choisissez <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> <b>Sur l'écran d'accueil</b></span></li>
            <li className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-bold">3</span><span className="pt-0.5">Touchez <b>Ajouter</b> : l'icône apparaît avec vos applications</span></li>
          </ol>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Masquer" className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-background"><X className="size-4" /></button>
    </div>
  )
}
