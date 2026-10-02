import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { MacalyBridge } from '@macaly/bridge'
import { Toaster } from 'sonner'
import AppConvexProvider from '@/components/convex-client-provider'
import { useEffect } from 'react'
import { startPwa } from '@/lib/pwa'

// CSS imported as a side effect — do NOT add `?url` or `?inline`.
import '../styles.css'
import siteMetadata from '../metadata.json'

const rootMeta = siteMetadata['/']

// Politique de sécurité du contenu : limite les sources de scripts, cadres et connexions.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss://*.convex.cloud",
  "frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { httpEquiv: 'Content-Security-Policy', content: CSP },
      // N'envoie que l'origine aux sites tiers : le lien secret de suivi ne fuit jamais
      { name: 'referrer', content: 'strict-origin' },
      { name: 'theme-color', content: '#ffffff' },
      // Application installée sur l'écran d'accueil (iPhone et Android)
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Loulou' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'application-name', content: 'Loulou Barquette' },
      { title: rootMeta.title },
      { name: 'description', content: rootMeta.description },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: '/favicon.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => { startPwa() }, [])
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <MacalyBridge>
        <body>
          <AppConvexProvider>{children}</AppConvexProvider>
          <Toaster position="top-center" richColors closeButton />
          <Scripts />
        </body>
      </MacalyBridge>
    </html>
  )
}
