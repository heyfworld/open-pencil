import { expect, test } from 'bun:test'

import { createEditor, graphFromPageSnapshot } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS } from '@open-pencil/core/tools'

import { expectDefined } from '#core-tests/helpers/assert'

type ChangesResult = { diff?: string | null; message?: string; error?: string }

const diffChanges = expectDefined(
  ALL_TOOLS.find((tool) => tool.name === 'diff_changes'),
  'diff_changes'
)

function setup() {
  const editor = createEditor()
  const pageId = editor.state.currentPageId
  const card = editor.graph.createNode('FRAME', pageId, { name: 'Card', width: 100, height: 60 })
  editor.graph.createNode('RECTANGLE', pageId, { name: 'Untouched', x: 300 })
  const figma = new FigmaAPI(editor.graph)
  figma.currentPage = figma.wrapNode(pageId)
  return { editor, pageId, card, figma }
}

async function run(figma: FigmaAPI, args: Record<string, unknown> = {}) {
  return (await diffChanges.execute(figma, args)) as ChangesResult
}

test('compares the page or one node with the state before the run edited it', async () => {
  const { editor, pageId, card, figma } = setup()
  const before = editor.snapshotPage(pageId)
  figma.changeBaseline = () => graphFromPageSnapshot(editor.graph, before)
  editor.graph.updateNode(card.id, { width: 240 })
  const added = editor.graph.createNode('ELLIPSE', pageId, { name: 'Badge' })

  const page = await run(figma)
  expect(page.diff).toContain('-size: 100 60')
  expect(page.diff).toContain('+size: 240 60')
  expect(page.diff).toContain(`/Badge #${added.id}`)
  expect(page.diff).not.toContain('Untouched')

  const node = await run(figma, { id: card.id })
  expect(node.diff).toContain('+size: 240 60')
  expect(node.diff).not.toContain('Badge')
})

test('explains when there is no run or no edit to compare with', async () => {
  const { figma } = setup()
  expect((await run(figma)).error).toContain('AI chat run')
  figma.changeBaseline = () => null
  expect(await run(figma)).toEqual({
    diff: null,
    message: 'This run has not changed the current page'
  })
})
