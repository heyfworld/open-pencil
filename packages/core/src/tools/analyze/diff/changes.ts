import * as v from 'valibot'

import { toolNumber } from '#core/tools/input'
import { defineTool } from '#core/tools/schema'

import { collectNodeTree, DEFAULT_DIFF_DEPTH, diffTrees } from './patch'

export const diffChanges = defineTool({
  name: 'diff_changes',
  description:
    'Property diff of what this run changed: a node, or the whole current page, compared with its state before the run first edited the page. Same unified format as diff_create. Use it before reporting to confirm that only the intended layers changed.',
  execution: { kind: 'sync', mutation: 'none' },
  // Only an AI chat run records the state it started from.
  exposure: { mcp: false, webmcp: false },
  input: v.object({
    id: v.optional(
      v.pipe(v.string(), v.description('Node to compare (default: the current page)'))
    ),
    depth: v.optional(
      toolNumber(
        v.pipe(v.number(), v.description(`Max tree depth (default: ${DEFAULT_DIFF_DEPTH})`))
      )
    )
  }),
  execute: (figma, args) => {
    if (!figma.changeBaseline) return { error: 'diff_changes is available only in an AI chat run' }
    const pageId = figma.currentPage.id
    const baseline = figma.changeBaseline(pageId)
    if (!baseline) return { diff: null, message: 'This run has not changed the current page' }
    const targetId = args.id ?? pageId
    if (!baseline.getNode(targetId) && !figma.graph.getNode(targetId)) {
      return { error: `Node "${targetId}" not found` }
    }
    const depth = args.depth ?? DEFAULT_DIFF_DEPTH
    const diff = diffTrees(
      collectNodeTree(baseline, targetId, depth),
      collectNodeTree(figma.graph, targetId, depth)
    )
    return diff === null ? { diff: null, message: 'No differences found' } : { diff }
  }
})
