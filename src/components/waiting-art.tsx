/*
 * Illustrations de l'écran d'attente : la petite poêle Loulou qui fait sauter ses ingrédients.
 * L'animation suit le vrai statut envoyé par l'équipe. Version fixe si l'appareil demande moins d'animations.
 */
export type Scene = 'recue' | 'preparation' | 'prete' | 'livreur' | 'fini' | 'annulee' | 'attente'

const RED = '#C4161C'
const DARK = '#2a1a14'

function Pan({ toss }: { toss: boolean }) {
  return (
    <g>
      {/* Vapeur */}
      <g className="lb-steam" fill="none" stroke="#c9c4bc" strokeWidth="6" strokeLinecap="round">
        <path d="M120 70 q-12 -18 0 -36 q12 -18 0 -36" />
        <path d="M160 62 q-12 -18 0 -36 q12 -18 0 -36" style={{ animationDelay: '.6s' }} />
        <path d="M200 70 q-12 -18 0 -36 q12 -18 0 -36" style={{ animationDelay: '1.2s' }} />
      </g>
      {/* Ingrédients qui sautent */}
      {toss && (
        <g>
          <g className="lb-bit" style={{ animationDelay: '0s' }}><rect x="122" y="120" width="22" height="16" rx="6" fill="#d98b3a" /></g>
          <g className="lb-bit lb-bit-b" style={{ animationDelay: '.15s' }}><circle cx="160" cy="118" r="9" fill="#3f8f3a" /><circle cx="152" cy="124" r="7" fill="#3f8f3a" /></g>
          <g className="lb-bit" style={{ animationDelay: '.3s' }}><rect x="178" y="122" width="18" height="9" rx="4" fill={RED} /></g>
          <g className="lb-bit lb-bit-b" style={{ animationDelay: '.45s' }}><rect x="140" y="112" width="14" height="8" rx="4" fill="#f2c230" /></g>
          <g className="lb-bit" style={{ animationDelay: '.1s' }}><rect x="196" y="112" width="20" height="14" rx="6" fill="#c97a2e" /></g>
        </g>
      )}
      {/* Poêle */}
      <g className={toss ? 'lb-pan' : ''}>
        <path d="M232 150 L300 128 q10 -3 13 6 q3 9 -7 13 L240 170 Z" fill={DARK} />
        <ellipse cx="160" cy="152" rx="82" ry="20" fill={DARK} />
        <path d="M78 152 q4 44 82 44 q78 0 82 -44 Z" fill={RED} />
        <ellipse cx="160" cy="150" rx="74" ry="15" fill="#3b2a22" />
        <path d="M108 148 q18 -8 30 0 q14 -9 26 0 q14 -8 28 0 q12 -6 22 2" fill="none" stroke="#e0a34a" strokeWidth="7" strokeLinecap="round" />
        <path d="M96 170 q64 22 128 0" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  )
}

function Ticket() {
  return (
    <g className="lb-ticket">
      <path d="M126 20 h68 v86 l-8.5 -6 l-8.5 6 l-8.5 -6 l-8.5 6 l-8.5 -6 l-8.5 6 l-8.5 -6 l-8.5 6 Z" fill="#fff" stroke="#d8d3cc" strokeWidth="2" />
      <rect x="138" y="34" width="44" height="6" rx="3" fill={RED} />
      <rect x="138" y="50" width="34" height="5" rx="2.5" fill="#bdb6ad" />
      <rect x="138" y="62" width="40" height="5" rx="2.5" fill="#bdb6ad" />
      <rect x="138" y="74" width="26" height="5" rx="2.5" fill="#bdb6ad" />
    </g>
  )
}

function Bag({ check }: { check: boolean }) {
  return (
    <g className="lb-hop">
      <path d="M128 92 q0 -30 32 -30 q32 0 32 30" fill="none" stroke={DARK} strokeWidth="7" strokeLinecap="round" />
      <path d="M104 88 h112 l-10 104 h-92 Z" fill="#d9b48a" />
      <path d="M104 88 h112 l-3 22 h-106 Z" fill="#c9a072" />
      <circle cx="160" cy="146" r="22" fill={RED} />
      <text x="160" y="152" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">LB</text>
      {check && (
        <g>
          <circle cx="214" cy="80" r="22" fill="#1f8a4c" />
          <path d="M203 80 l8 8 l14 -15" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  )
}

function Scooter() {
  return (
    <g>
      <g className="lb-road" stroke="#d8d3cc" strokeWidth="6" strokeLinecap="round">
        <path d="M20 206 h40" /><path d="M110 206 h40" /><path d="M200 206 h40" /><path d="M290 206 h40" />
      </g>
      <g className="lb-bob">
        <circle cx="96" cy="178" r="20" fill={DARK} /><circle cx="96" cy="178" r="8" fill="#9a928a" />
        <circle cx="226" cy="178" r="20" fill={DARK} /><circle cx="226" cy="178" r="8" fill="#9a928a" />
        <path d="M86 170 h96 q20 0 30 -26 l8 -22 h12" fill="none" stroke={RED} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M120 150 h70 l-8 22 h-62 Z" fill={RED} />
        <rect x="112" y="92" width="56" height="50" rx="6" fill="#d9b48a" />
        <circle cx="140" cy="117" r="13" fill={RED} />
        <text x="140" y="122" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">LB</text>
        <path d="M248 112 l14 -6" stroke={DARK} strokeWidth="6" strokeLinecap="round" />
      </g>
    </g>
  )
}

function Done({ ok }: { ok: boolean }) {
  return (
    <g>
      <circle cx="160" cy="120" r="70" fill={ok ? '#1f8a4c' : '#a8a29e'} />
      {ok
        ? <path d="M124 120 l26 26 l46 -50" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M132 92 l56 56 M188 92 l-56 56" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />}
    </g>
  )
}

export function WaitingArt({ scene }: { scene: Scene }) {
  return (
    <svg viewBox="0 0 320 230" role="img" aria-label={LABEL[scene]} className="lb-anim mx-auto h-auto w-full max-w-[320px]">
      {scene === 'recue' && <><Ticket /><g transform="translate(0 20)"><Pan toss={false} /></g></>}
      {scene === 'preparation' && <Pan toss />}
      {scene === 'attente' && <Pan toss={false} />}
      {scene === 'prete' && <Bag check />}
      {scene === 'livreur' && <Scooter />}
      {scene === 'fini' && <Done ok />}
      {scene === 'annulee' && <Done ok={false} />}
    </svg>
  )
}

const LABEL: Record<Scene, string> = {
  recue: 'Un ticket de commande arrive en cuisine',
  preparation: 'La poêle Loulou fait sauter les ingrédients',
  attente: 'La poêle attend le paiement',
  prete: 'Le sac de commande est prêt',
  livreur: 'Le livreur part en scooter avec le sac',
  fini: 'Commande terminée',
  annulee: 'Commande annulée',
}
