import { tokens } from '@kairo/tokens'

// Keyframes and transitions cannot be expressed as Tamagui style props, so the
// web build injects them once as classes. Every animation stops under
// prefers-reduced-motion.

const STYLE_ID = 'kairo-ui-motion'

const CSS = `
@keyframes kairo-ui-shim { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes kairo-ui-pulse { 0%, 100% { opacity: .4 } 50% { opacity: 1 } }
@keyframes kairo-ui-spin { to { transform: rotate(360deg) } }
@keyframes kairo-ui-caret { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes kairo-ui-fade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
@keyframes kairo-ui-slide-in { from { transform: translateX(100%) } to { transform: none } }
.kairo-ui-shim { background: linear-gradient(90deg, ${tokens['surface.hover']} 0%, ${tokens['border.default']} 50%, ${tokens['surface.hover']} 100%); background-size: 200% 100%; animation: kairo-ui-shim 1.4s linear infinite }
.kairo-ui-pulse { animation: kairo-ui-pulse 1.6s ease-in-out infinite }
.kairo-ui-spin { animation: kairo-ui-spin .8s linear infinite }
.kairo-ui-caret { animation: kairo-ui-caret 1s steps(2) infinite }
.kairo-ui-slide { animation: kairo-ui-slide-in 160ms ease-out }
.kairo-ui-fade { animation: kairo-ui-fade .26s ease both }
.kairo-ui-knob { transition: transform 150ms }
.kairo-ui-faq > summary { list-style: none }
.kairo-ui-faq > summary::-webkit-details-marker { display: none }
.kairo-ui-faq > summary > svg { transition: transform 150ms }
.kairo-ui-faq[open] > summary > svg { transform: rotate(45deg) }
.kairo-ui-faq > summary:hover > svg { color: ${tokens['text.primary']} }
@media (prefers-reduced-motion: reduce) {
  .kairo-ui-shim, .kairo-ui-pulse, .kairo-ui-spin, .kairo-ui-caret, .kairo-ui-slide, .kairo-ui-fade { animation: kairo-ui-fade .26s ease both }
.kairo-ui-knob, .kairo-ui-faq > summary > svg { animation: none !important; transition: none !important }
}
`

export function ensureMotionStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

ensureMotionStyles()
