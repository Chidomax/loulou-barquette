import { useEffect, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
let started = false

/** Enregistre le service worker et capte la proposition d'installation (Android, Chrome, Edge). Appelé une fois. */
export function startPwa() {
  if (started || typeof window === 'undefined') return
  started = true
  if ('serviceWorker' in navigator) {
    const register = () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined) }
    // La page est souvent déjà chargée quand React démarre : on enregistre tout de suite dans ce cas
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()) })
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/** État de l'installation : « prompt » (bouton natif), « ios » (consignes Safari), « installed » ou « none ». */
export function useInstall() {
  const [state, setState] = useState<'prompt' | 'ios' | 'installed' | 'none'>('none')
  useEffect(() => {
    startPwa()
    const update = () => setState(isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'none')
    update()
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])
  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    listeners.forEach((l) => l())
    return outcome === 'accepted'
  }
  return { state, install }
}

/**
 * Notification fiable sur téléphone : Android exige de passer par le service worker
 * (le constructeur Notification y est refusé). Repli sur Notification sur ordinateur.
 */
export async function notify(title: string, body: string, url?: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const options = { body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: url ?? location.pathname } }
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch { /* notifications indisponibles : l'écran se met quand même à jour */ }
}
