import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ARTWORK_COLORS, BODY, FACES, LIMBS, SILHOUETTE } from '../src/lib/brand-artwork'
import { AssistantEmpty, KairoCharacter, KairoLogo, KairoMark, kairoMarkLayers, UiProvider, type KairoExpression } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

const svgOf = (container: HTMLElement) => container.querySelector('svg') as SVGSVGElement
const fills = (svg: SVGSVGElement) => [...svg.querySelectorAll('path')].map((path) => path.getAttribute('fill'))

describe('KairoMark', () => {
  it('draws the five layers back to front from 32px tall', () => {
    const { container } = render(<KairoMark size={32} />)
    expect(fills(svgOf(container))).toEqual([
      ARTWORK_COLORS.yellowLight,
      ARTWORK_COLORS.violet,
      ARTWORK_COLORS.orange,
      ARTWORK_COLORS.yellow,
      ARTWORK_COLORS.violetLight,
    ])
  })

  it('switches to the three-layer cut below 32px', () => {
    const { container } = render(<KairoMark size={31} />)
    expect(fills(svgOf(container))).toEqual([ARTWORK_COLORS.violet, ARTWORK_COLORS.orange, ARTWORK_COLORS.yellow])
  })

  it('applies the layer rule at its boundaries and lets a caller force a version', () => {
    expect(kairoMarkLayers(16)).toBe(3)
    expect(kairoMarkLayers(31.9)).toBe(3)
    expect(kairoMarkLayers(32)).toBe(5)
    expect(kairoMarkLayers(96)).toBe(5)
    expect(kairoMarkLayers(16, 5)).toBe(5)
    expect(kairoMarkLayers(96, 3)).toBe(3)
    const { container } = render(<KairoMark size={16} layers={5} />)
    expect(svgOf(container).querySelectorAll('path')).toHaveLength(5)
  })

  it('draws one silhouette in a single ink at any size', () => {
    const { container } = render(<KairoMark size={16} ink="currentColor" />)
    const paths = svgOf(container).querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0]!.getAttribute('fill')).toBe('currentColor')
    expect(paths[0]!.getAttribute('d')).toBe(SILHOUETTE.body)
  })

  it('keeps the artwork proportions: size is the height', () => {
    const { container } = render(<KairoMark size={48} />)
    const svg = svgOf(container)
    expect(svg.getAttribute('height')).toBe('48')
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((48 * 572) / 509, 5)
    expect(svg.getAttribute('viewBox')).toBe('-4 -4 572 509')
  })

  it('is decorative by default and an image when it has a label', () => {
    const decorative = render(<KairoMark />)
    expect(svgOf(decorative.container).getAttribute('aria-hidden')).toBe('true')
    expect(svgOf(decorative.container).getAttribute('role')).toBeNull()
    cleanup()
    render(<KairoMark label="Kairo" />)
    expect(screen.getByRole('img', { name: 'Kairo' })).toBeTruthy()
  })
})

describe('KairoCharacter', () => {
  const EXPRESSIONS: KairoExpression[] = ['happy', 'neutral', 'reading', 'focused', 'urgent', 'decision', 'paused']

  it('draws the five layers and the filled happy face by default', () => {
    const { container } = render(<KairoCharacter />)
    const paths = svgOf(container).querySelectorAll('path')
    expect(paths).toHaveLength(6)
    expect(paths[5]!.getAttribute('d')).toBe(BODY.face)
    expect(paths[5]!.getAttribute('fill')).toBe(ARTWORK_COLORS.face)
  })

  it('changes only the face between expressions', () => {
    const markup = EXPRESSIONS.map((expression) => {
      const { container } = render(<KairoCharacter expression={expression} />)
      const svg = svgOf(container)
      // The five body layers come before the face.
      const body = [...svg.children].slice(0, 5).map((node) => node.outerHTML).join('')
      const html = svg.innerHTML
      cleanup()
      return { expression, body, html }
    })
    expect(new Set(markup.map((entry) => entry.body)).size).toBe(1)
    expect(new Set(markup.map((entry) => entry.html)).size).toBe(EXPRESSIONS.length)
  })

  it('draws the stroked faces in the face color with round caps', () => {
    for (const expression of EXPRESSIONS.filter((name) => name !== 'happy') as Exclude<KairoExpression, 'happy'>[]) {
      const { container } = render(<KairoCharacter expression={expression} />)
      const face = svgOf(container).querySelector('g[stroke]')!
      expect(face.getAttribute('transform')).toBe(FACES[expression].transform)
      expect(face.getAttribute('stroke')).toBe(ARTWORK_COLORS.face)
      expect(face.getAttribute('stroke-width')).toBe('11')
      expect(face.getAttribute('stroke-linecap')).toBe('round')
      expect(face.children).toHaveLength(FACES[expression].elements.length)
      cleanup()
    }
  })

  it('moves whole layers for a pose and leaves the paths untouched', () => {
    const rest = render(<KairoCharacter />)
    const restPaths = fills(svgOf(rest.container))
    cleanup()
    const attentive = render(<KairoCharacter pose="attentive" />)
    const groups = [...svgOf(attentive.container).querySelectorAll(':scope > g')].map((node) => node.getAttribute('transform'))
    expect(groups).toContain('translate(16 -22)')
    expect(groups).toContain('translate(0 8)')
    expect(fills(svgOf(attentive.container))).toEqual(restPaths)
    cleanup()
    const thinking = render(<KairoCharacter pose="thinking" />)
    const turned = svgOf(thinking.container).querySelector(`path[fill="${ARTWORK_COLORS.orange}"]`)!
    expect(turned.getAttribute('transform')).toBe('rotate(-5 282 250)')
    expect(svgOf(thinking.container).querySelectorAll('g[transform="translate(-10 6)"]')).toHaveLength(2)
  })

  it('draws the limbed character with its own frame, the back limb first and the happy face', () => {
    const { container } = render(<KairoCharacter limbs size={104} />)
    const svg = svgOf(container)
    expect(svg.getAttribute('viewBox')).toBe('-4 -4 616 556')
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((104 * 616) / 556, 5)
    const paths = [...svg.querySelectorAll('path')]
    expect(paths).toHaveLength(7)
    expect(paths[0]!.getAttribute('d')).toBe(LIMBS.back)
    expect(paths[6]!.getAttribute('d')).toBe(LIMBS.face)
  })

  it('ignores an expression or pose the limbed character was not drawn with', () => {
    const { container } = render(<KairoCharacter {...({ limbs: true, expression: 'urgent', pose: 'thinking' } as never)} />)
    const svg = svgOf(container)
    expect(svg.querySelector('g[stroke]')).toBeNull()
    expect(svg.querySelector('[transform]')).toBeNull()
  })

  it('draws one ink with the face cut out in the ground color', () => {
    const { container } = render(<KairoCharacter ink="#000000" ground="#ffffff" />)
    const paths = [...svgOf(container).querySelectorAll('path')]
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual(['#000000', '#ffffff'])
    expect(paths[0]!.getAttribute('d')).toBe(SILHOUETTE.body)
    expect(paths[1]!.getAttribute('d')).toBe(BODY.face)
    cleanup()
    const limbed = render(<KairoCharacter limbs ink="#000000" ground="#ffffff" />)
    const limbedPaths = [...svgOf(limbed.container).querySelectorAll('path')]
    expect(limbedPaths[0]!.getAttribute('d')).toBe(SILHOUETTE.limbs)
    expect(limbedPaths[1]!.getAttribute('d')).toBe(LIMBS.face)
  })

  it('is decorative by default and an image when it has a label', () => {
    const decorative = render(<KairoCharacter />)
    expect(svgOf(decorative.container).getAttribute('aria-hidden')).toBe('true')
    cleanup()
    render(<KairoCharacter label="Kairo is reading" expression="reading" />)
    expect(screen.getByRole('img', { name: 'Kairo is reading' })).toBeTruthy()
  })
})

describe('KairoLogo', () => {
  it('writes the lowercase word next to a decorative symbol', () => {
    const { container } = renderUi(<KairoLogo size={24} />)
    expect(screen.getByText('kairo')).toBeTruthy()
    const svg = svgOf(container)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('height')).toBe('24')
    expect(svg.compareDocumentPosition(screen.getByText('kairo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses the five layers from 32px and the cut below', () => {
    const small = renderUi(<KairoLogo size={24} />)
    expect(svgOf(small.container).querySelectorAll('path')).toHaveLength(3)
    cleanup()
    const large = renderUi(<KairoLogo size={48} layout="stacked" />)
    expect(svgOf(large.container).querySelectorAll('path')).toHaveLength(5)
  })

  it('renders every layout and the accent variant', () => {
    for (const layout of ['horizontal', 'stacked'] as const) {
      for (const onAccent of [false, true]) {
        renderUi(<KairoLogo layout={layout} onAccent={onAccent} />)
        expect(screen.getByText('kairo')).toBeTruthy()
        cleanup()
      }
    }
  })
})

describe('AssistantEmpty', () => {
  it('shows the character as the assistant avatar', () => {
    const { container } = renderUi(<AssistantEmpty name="Kairo Assistant" tagline="Agent copilot" intro="Ask me." />)
    const svg = svgOf(container)
    expect(svg.getAttribute('viewBox')).toBe('-4 -4 572 509')
    expect(svg.querySelectorAll('path')).toHaveLength(6)
  })
})
