import type { SceneGraph, SceneNode, Effect, Color, GridTrack } from '@open-pencil/scene-graph'
import { colorToHex8 } from '@open-pencil/scene-graph/color'

export function formatColor(color: Color, opacity = 1): string {
  return colorToHex8(color, opacity)
}

export function formatShadow(e: Effect): string | null {
  if (e.type !== 'DROP_SHADOW' && e.type !== 'INNER_SHADOW') return null
  return `${e.offset.x} ${e.offset.y} ${e.radius} ${formatColor(e.color, e.color.a)}`
}

const JSX_ENTITY: Record<string, string> = {
  '{': '&#123;',
  '}': '&#125;',
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;'
}

export function escapeJSXText(text: string): string {
  return text.replace(/[{}<>&]/g, (c) => JSX_ENTITY[c])
}

/**
 * JSX attribute strings end at `"` and decode `&` entities, so other strings become
 * expression containers with a JavaScript string literal.
 */
const LITERAL_ATTRIBUTE = /^[^"&]*$/

/** Source code emitted as is, such as a helper call inside a prop value. */
export class JSXCode {
  constructor(readonly code: string) {}
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * A JavaScript literal with `JSXCode` parts inlined. Prop values keep `JSON.stringify`
 * formatting; `code` formatting, for helper arguments, reads like hand-written source.
 */
export function jsLiteral(value: unknown, style: 'json' | 'code' = 'json'): string {
  if (value instanceof JSXCode) return value.code
  const separator = style === 'code' ? ', ' : ','
  if (Array.isArray(value)) {
    return `[${value.map((item) => jsLiteral(item, style)).join(separator)}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => {
        const name = style === 'code' && IDENTIFIER.test(key) ? key : JSON.stringify(key)
        return `${name}:${style === 'code' ? ' ' : ''}${jsLiteral(item, style)}`
      })
    if (style === 'json') return `{${entries.join(',')}}`
    return entries.length > 0 ? `{ ${entries.join(separator)} }` : '{}'
  }
  return JSON.stringify(value)
}

export function formatProp(key: string, value: unknown): string {
  if (value instanceof JSXCode) return `${key}={${value.code}}`
  if (typeof value === 'string')
    return LITERAL_ATTRIBUTE.test(value) ? `${key}="${value}"` : `${key}={${JSON.stringify(value)}}`
  if (typeof value === 'number') return `${key}={${value}}`
  if (typeof value === 'boolean') return value ? key : `${key}={false}`
  return `${key}={${jsLiteral(value)}}`
}

export function getNodeContext(node: SceneNode, graph: SceneGraph) {
  const parent = node.parentId ? graph.getNode(node.parentId) : null
  return {
    isAutoLayout: node.layoutMode !== 'NONE',
    isGrid: node.layoutMode === 'GRID',
    isFlex: node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL',
    parentIsAutoLayout: parent ? parent.layoutMode !== 'NONE' : false,
    parentIsGrid: parent ? parent.layoutMode === 'GRID' : false
  }
}

export type PaddingEdges = { pt: number; pr: number; pb: number; pl: number }

export function collectPadding(node: SceneNode): PaddingEdges | null {
  const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = node
  if (pt === 0 && pr === 0 && pb === 0 && pl === 0) return null
  return { pt, pr, pb, pl }
}

export function emitPadding<T>(
  edges: PaddingEdges,
  uniform: (v: number) => T,
  symmetric: (y: number, x: number) => T[],
  individual: (edges: PaddingEdges) => T[]
): T[] {
  const { pt, pr, pb, pl } = edges
  if (pt === pr && pr === pb && pb === pl) return [uniform(pt)]
  if (pt === pb && pl === pr) return symmetric(pt, pl)
  return individual(edges)
}

export interface CornerRadii {
  tl: number
  tr: number
  br: number
  bl: number
}

export function collectCornerRadii(node: SceneNode): CornerRadii | null {
  if (node.independentCorners) {
    const corners = {
      tl: node.topLeftRadius,
      tr: node.topRightRadius,
      br: node.bottomRightRadius,
      bl: node.bottomLeftRadius
    }
    return Object.values(corners).some((radius) => radius > 0) ? corners : null
  }
  if (node.cornerRadius <= 0) return null
  const r = node.cornerRadius
  return { tl: r, tr: r, br: r, bl: r }
}

export function formatTrack(t: GridTrack): string {
  if (t.sizing === 'FR') return `${t.value}fr`
  if (t.sizing === 'FIXED') return `${t.value}px`
  return 'auto'
}

export function formatTracks(tracks: GridTrack[]): string {
  return tracks.map(formatTrack).join(' ')
}
