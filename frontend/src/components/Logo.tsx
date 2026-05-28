/**
 * Logo do Parceria CRM
 *
 * PARA USAR SEU PNG REAL:
 * 1. Salve sua imagem em: frontend/public/logo.png
 * 2. Troque a constante USE_PNG_LOGO para true abaixo.
 */

const USE_PNG_LOGO = true  // ← logo real ativada (frontend/public/logo.png)

interface LogoProps {
  size?: number
}

export default function Logo({ size = 40 }: LogoProps) {
  if (USE_PNG_LOGO) {
    return (
      <img
        src="/logo.png"
        alt="Parceria CRM"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
        }}
      />
    )
  }

  /* ── SVG fallback — moeda dourada com aperto de mão ── */
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Fundo azul escuro */}
      <circle cx="50" cy="50" r="50" fill="#0a1628"/>

      {/* Anel externo dourado */}
      <circle cx="50" cy="50" r="47" fill="none" stroke="url(#outerRing)" strokeWidth="4.5"/>
      {/* Anel interno dourado fino */}
      <circle cx="50" cy="50" r="39" fill="none" stroke="url(#outerRing)" strokeWidth="1" opacity="0.5"/>

      {/* Fundo interior com gradiente navy */}
      <circle cx="50" cy="50" r="37" fill="url(#navyBg)"/>

      {/* ── Aperto de mão ── */}
      {/* Braço esquerdo */}
      <path d="M16 54 Q20 50 26 50 L40 50 Q43 50 43 53 L43 57 Q43 60 40 60 L26 60 Q20 60 16 56 Z"
        fill="url(#goldFill)" opacity="0.95"/>
      {/* Dedos mão esquerda */}
      <rect x="34" y="40" width="6" height="11" rx="3" fill="url(#goldFill)"/>
      <rect x="27" y="38" width="6" height="13" rx="3" fill="url(#goldFill)"/>
      <rect x="20" y="40" width="5" height="11" rx="2.5" fill="url(#goldFill)"/>

      {/* Braço direito */}
      <path d="M84 54 Q80 50 74 50 L60 50 Q57 50 57 53 L57 57 Q57 60 60 60 L74 60 Q80 60 84 56 Z"
        fill="url(#goldFill)" opacity="0.95"/>
      {/* Dedos mão direita */}
      <rect x="60" y="40" width="6" height="11" rx="3" fill="url(#goldFill)"/>
      <rect x="67" y="38" width="6" height="13" rx="3" fill="url(#goldFill)"/>
      <rect x="75" y="40" width="5" height="11" rx="2.5" fill="url(#goldFill)"/>

      {/* Nó central do aperto */}
      <ellipse cx="50" cy="54" rx="12" ry="9" fill="url(#goldFill)"/>
      <ellipse cx="50" cy="54" rx="7"  ry="5" fill="#0a1628" opacity="0.25"/>

      {/* Brilho no topo da moeda */}
      <ellipse cx="50" cy="22" rx="18" ry="5" fill="white" opacity="0.06"/>

      <defs>
        <linearGradient id="outerRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#F5D06B"/>
          <stop offset="40%"  stopColor="#C9952A"/>
          <stop offset="70%"  stopColor="#F0C040"/>
          <stop offset="100%" stopColor="#8B6010"/>
        </linearGradient>
        <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#F5D06B"/>
          <stop offset="100%" stopColor="#C9952A"/>
        </linearGradient>
        <radialGradient id="navyBg" cx="40%" cy="35%">
          <stop offset="0%"   stopColor="#1a2d5a"/>
          <stop offset="100%" stopColor="#070e1e"/>
        </radialGradient>
      </defs>
    </svg>
  )
}
