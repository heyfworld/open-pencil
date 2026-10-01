import type { Effect, Fill, GradientTransform, SceneNode, Stroke } from '@open-pencil/scene-graph'

import { formatColor, formatShadow, JSXCode, jsLiteral } from './helpers'

type Props = [string, unknown][]

const GRADIENT_HELPERS: Partial<Record<Fill['type'], string>> = {
  GRADIENT_LINEAR: 'linearGradient',
  GRADIENT_RADIAL: 'radialGradient',
  GRADIENT_ANGULAR: 'angularGradient',
  GRADIENT_DIAMOND: 'diamondGradient'
}

const IDENTITY_TRANSFORM: GradientTransform = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }

function isIdentity(transform: GradientTransform | undefined): boolean {
  if (!transform) return true
  return (Object.keys(IDENTITY_TRANSFORM) as (keyof GradientTransform)[]).every(
    (key) => transform[key] === IDENTITY_TRANSFORM[key]
  )
}

/** Paints and effects imported from Figma often spell out the default blend mode. */
function blendMode(mode: Fill['blendMode']): Fill['blendMode'] {
  return mode === 'NORMAL' || mode === 'PASS_THROUGH' ? undefined : mode
}

function call(helper: string, ...args: unknown[]): JSXCode {
  const present = args.slice(0, args.findLastIndex((arg) => arg !== undefined) + 1)
  return new JSXCode(`${helper}(${present.map((arg) => jsLiteral(arg, 'code')).join(', ')})`)
}

/** Helper options with defaults left out, or `undefined` when none differ. */
function options(entries: Record<string, unknown>): Record<string, unknown> | undefined {
  const set = Object.entries(entries).filter(([, value]) => value !== undefined)
  return set.length > 0 ? Object.fromEntries(set) : undefined
}

function fillValue(fill: Fill): unknown {
  const visible = fill.visible ? undefined : false
  if (fill.type === 'SOLID') {
    const color = formatColor(fill.color, fill.color.a)
    const opacity = fill.opacity === fill.color.a ? undefined : fill.opacity
    return call('solid', color, options({ opacity, visible, blendMode: blendMode(fill.blendMode) }))
  }
  const helper = GRADIENT_HELPERS[fill.type]
  if (helper && fill.gradientStops) {
    const stops = fill.gradientStops.map((stop) => [formatColor(stop.color), stop.position])
    return call(
      helper,
      stops,
      options({
        opacity: fill.opacity === 1 ? undefined : fill.opacity,
        visible,
        blendMode: blendMode(fill.blendMode),
        transform: isIdentity(fill.gradientTransform) ? undefined : fill.gradientTransform
      })
    )
  }
  // Image, pattern, and other paints have no helper; they render back from their fields.
  return structuredClone(fill)
}

/** A single visible solid paint fits the `bg` or text `color` shorthand. */
function solidShorthand(fills: Fill[]): string | null {
  if (fills.length !== 1) return null
  const [fill] = fills
  if (fill.type !== 'SOLID' || !fill.visible || blendMode(fill.blendMode)) return null
  return formatColor(fill.color, fill.opacity)
}

export function collectFillProps(node: SceneNode, props: Props): void {
  if (node.fills.length === 0) return
  const shorthand = solidShorthand(node.fills)
  if (shorthand) props.push([node.type === 'TEXT' ? 'color' : 'bg', shorthand])
  else props.push(['fills', node.fills.map(fillValue)])
}

function strokeValue(stroke: Stroke): Record<string, unknown> {
  return {
    color: formatColor(stroke.color, stroke.opacity),
    weight: stroke.weight === 1 ? undefined : stroke.weight,
    align: stroke.align === 'INSIDE' ? undefined : stroke.align.toLowerCase(),
    dash: stroke.dashPattern && stroke.dashPattern.length > 0 ? [...stroke.dashPattern] : undefined,
    cap: stroke.cap?.toLowerCase(),
    join: stroke.join?.toLowerCase(),
    visible: stroke.visible ? undefined : false
  }
}

const STROKE_SHORTHAND: Record<string, string> = {
  color: 'stroke',
  weight: 'strokeWidth',
  align: 'strokeAlign',
  dash: 'strokeDash',
  cap: 'strokeCap',
  join: 'strokeJoin'
}

export function collectStrokeProps(node: SceneNode, props: Props): void {
  const strokes = node.strokes.map(strokeValue)
  const [only] = strokes
  if (strokes.length === 1 && only.visible === undefined) {
    for (const [key, value] of Object.entries(only)) {
      if (value !== undefined) props.push([STROKE_SHORTHAND[key], value])
    }
  } else if (strokes.length > 0) {
    props.push(['strokes', strokes])
  }
  if (node.independentStrokeWeights) {
    props.push([
      'strokeWeights',
      {
        top: node.borderTopWeight,
        right: node.borderRightWeight,
        bottom: node.borderBottomWeight,
        left: node.borderLeftWeight
      }
    ])
  }
}

const EFFECT_HELPERS: Record<Effect['type'], string> = {
  DROP_SHADOW: 'dropShadow',
  INNER_SHADOW: 'innerShadow',
  LAYER_BLUR: 'layerBlur',
  BACKGROUND_BLUR: 'backgroundBlur',
  FOREGROUND_BLUR: 'foregroundBlur'
}

function effectValue(effect: Effect): JSXCode {
  const visible = effect.visible ? undefined : false
  if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
    return call(
      EFFECT_HELPERS[effect.type],
      options({
        x: effect.offset.x,
        y: effect.offset.y,
        radius: effect.radius,
        spread: effect.spread === 0 ? undefined : effect.spread,
        color: formatColor(effect.color, effect.color.a),
        visible,
        blendMode: blendMode(effect.blendMode),
        showShadowBehindNode: effect.showShadowBehindNode
      })
    )
  }
  return call(
    EFFECT_HELPERS[effect.type],
    visible === undefined ? effect.radius : { radius: effect.radius, visible }
  )
}

function plainDropShadow(effect: Effect): string | null {
  const plain =
    effect.type === 'DROP_SHADOW' &&
    effect.spread === 0 &&
    !blendMode(effect.blendMode) &&
    effect.showShadowBehindNode === undefined
  return plain ? formatShadow(effect) : null
}

/**
 * `shadow` and `blur` describe a plain drop shadow followed by a layer blur, each optional,
 * in the order the renderer appends them; anything else needs `effects`.
 */
function effectShorthand(effects: Effect[]): Props | null {
  if (effects.some((effect) => !effect.visible)) return null
  const shadow = effects.length > 0 ? plainDropShadow(effects[0]) : null
  const rest = shadow ? effects.slice(1) : effects
  if (rest.length > 1 || rest.some((effect) => effect.type !== 'LAYER_BLUR')) return null
  const props: Props = []
  if (shadow) props.push(['shadow', shadow])
  for (const blur of rest) props.push(['blur', blur.radius])
  return props
}

export function collectEffectProps(node: SceneNode, props: Props): void {
  if (node.effects.length === 0) return
  props.push(...(effectShorthand(node.effects) ?? [['effects', node.effects.map(effectValue)]]))
}
