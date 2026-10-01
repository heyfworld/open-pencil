import { computed, shallowReactive } from 'vue'

import type { ToolChange } from './types'

const changes = shallowReactive(new Map<string, ToolChange>())

export function toolChangeFor(toolCallId: string) {
  return computed(() => changes.get(toolCallId) ?? null)
}

export function readToolChange(toolCallId: string): ToolChange | null {
  return changes.get(toolCallId) ?? null
}

export function setToolChange(change: ToolChange): void {
  changes.set(change.toolCallId, change)
}

export function clearToolChanges(): void {
  changes.clear()
}
