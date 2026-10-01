import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import type { ToolExecutionOptions } from 'ai'
import { toRaw } from 'vue'

import { FigmaAPI } from '@open-pencil/core/figma-api'

import { snapshotMessages, restoreMessages } from '@/app/ai/chat/history/messages'
import { changePreviewSize } from '@/app/ai/chat/preferences'
import { createAITools } from '@/app/ai/tools'
import { clearToolChanges, readToolChange } from '@/app/ai/tools/changes/store'
import * as figmaFactory from '@/app/automation/bridge/figma-factory'
import { createEditorStore } from '@/app/editor/session/create'
import { appPreferences } from '@/app/settings/preferences/store'

type EditorStore = ReturnType<typeof createEditorStore>

let store: EditorStore
let previousPreferences: typeof appPreferences.value
let factory: ReturnType<typeof spyOn>

beforeEach(() => {
  previousPreferences = structuredClone(toRaw(appPreferences.value))
  // No canvas renders here; the structural record is the contract under test.
  changePreviewSize.value = 'off'
  store = createEditorStore()
  factory = spyOn(figmaFactory, 'makeFigmaFromStore').mockImplementation((editor, pageId) => {
    const api = new FigmaAPI(editor.graph)
    api.currentPage = api.wrapNode(pageId ?? editor.state.currentPageId)
    return api
  })
})

afterEach(() => {
  appPreferences.value = previousPreferences
  factory.mockRestore()
  clearToolChanges()
  store.dispose()
})

function call(toolCallId: string): ToolExecutionOptions<unknown> {
  return { toolCallId, messages: [], context: undefined }
}

async function execute(name: string, input: Record<string, unknown>, toolCallId: string) {
  const tool = createAITools(store)[name]
  if (!tool?.execute) throw new Error(`Missing ${name}`)
  return tool.execute(input, call(toolCallId))
}

test('records the layers a call changed with their JSX before and after', async () => {
  const pageId = store.state.currentPageId
  const card = store.graph.createNode('FRAME', pageId, { name: 'Card', width: 100, height: 60 })
  store.graph.createNode('RECTANGLE', pageId, { name: 'Untouched', x: 300 })

  await execute('set_fill', { id: card.id, color: '#ff0000' }, 'fill-call')

  const change = readToolChange('fill-call')
  expect(change?.nodeIds).toEqual([card.id])
  expect(change?.jsx.before).toContain('name="Card"')
  expect(change?.jsx.after).toContain('#FF0000')
  expect(change?.jsx.before).not.toContain('#FF0000')
  expect(change?.images).toBeUndefined()
})

test('records nothing for calls that leave the page as it was', async () => {
  const card = store.graph.createNode('FRAME', store.state.currentPageId, { name: 'Card' })
  await execute('get_node', { id: card.id }, 'read-call')
  await execute('set_fill', { id: card.id, color: '#123456' }, 'first-fill')
  await execute('set_fill', { id: card.id, color: '#123456' }, 'same-fill')

  expect(readToolChange('read-call')).toBeNull()
  expect(readToolChange('first-fill')).not.toBeNull()
  expect(readToolChange('same-fill')).toBeNull()
})

test('keeps an undo step per structural call and records removed layers', async () => {
  const card = store.graph.createNode('FRAME', store.state.currentPageId, { name: 'Card' })

  await execute('delete_node', { id: card.id }, 'delete-call')

  const change = readToolChange('delete-call')
  expect(change?.nodeIds).toEqual([card.id])
  expect(change?.jsx.after).toBe('')
  store.undo.undo()
  expect(store.graph.getNode(card.id)?.name).toBe('Card')
})

test('saves recorded changes with the conversation and restores them', async () => {
  const card = store.graph.createNode('FRAME', store.state.currentPageId, { name: 'Card' })
  await execute('set_fill', { id: card.id, color: '#00ff00' }, 'saved-call')
  const recorded = readToolChange('saved-call')

  const rows = snapshotMessages([
    {
      id: 'assistant',
      role: 'assistant',
      parts: [
        {
          type: 'tool-set_fill',
          toolCallId: 'saved-call',
          state: 'output-available',
          input: { id: card.id, color: '#00ff00' },
          output: { id: card.id }
        }
      ]
    }
  ])
  clearToolChanges()
  expect(readToolChange('saved-call')).toBeNull()

  restoreMessages(rows)
  expect(readToolChange('saved-call')).toEqual(recorded)
})
