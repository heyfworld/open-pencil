import { graphFromPageSnapshot, type PageSnapshot } from '@open-pencil/core/editor'
import { diffPageLayersJSX } from '@open-pencil/core/tools'

import { changePreviewSize } from '@/app/ai/chat/preferences'
import type { EditorStore } from '@/app/editor/active-store'

import { renderToolChangeImages } from './images'
import { setToolChange } from './store'
import type { ToolChange } from './types'

/** Long rewrites are summarized rather than kept whole in the history. */
const MAX_JSX_LENGTH = 40_000

function joinJSX(sources: string[]): string {
  const jsx = sources.filter(Boolean).join('\n\n')
  return jsx.length > MAX_JSX_LENGTH ? `${jsx.slice(0, MAX_JSX_LENGTH)}\n…` : jsx
}

/**
 * Records what a finished call changed on its page. The structural diff is immediate; images
 * render afterwards from frozen copies of both states, so later edits cannot leak into them.
 */
export function recordToolChange(
  store: EditorStore,
  toolCallId: string,
  before: PageSnapshot,
  after: PageSnapshot
): ToolChange | null {
  const beforeGraph = graphFromPageSnapshot(store.graph, before)
  const afterGraph = graphFromPageSnapshot(store.graph, after)
  const pageId = after.values().next().value?.id
  if (!beforeGraph || !afterGraph || !pageId) return null
  // The same JSX diff `diff_jsx` returns decides which layers changed.
  const layers = diffPageLayersJSX(beforeGraph, afterGraph, pageId)
  if (layers.length === 0) return null
  const nodeIds = layers.map((layer) => layer.id)
  const change: ToolChange = {
    toolCallId,
    pageId,
    nodeIds,
    jsx: {
      before: joinJSX(layers.map((layer) => layer.before)),
      after: joinJSX(layers.map((layer) => layer.after))
    }
  }
  setToolChange(change)
  const size = changePreviewSize.value
  if (size !== 'off') {
    void (async () => {
      const images = await renderToolChangeImages(store, {
        beforeGraph,
        afterGraph,
        pageId,
        nodeIds,
        size
      })
      if (images) setToolChange({ ...change, images })
    })().catch((error: unknown) => console.warn('Could not render AI change previews', error))
  }
  return change
}
