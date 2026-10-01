<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { getActiveEditorStoreOrNull } from '@/app/editor/active-store'
import { focusNodesOnTheirPage } from '@/app/editor/selection/focus'
import { chatToolTheme } from '@/theme/chat/tool'

const { ids } = defineProps<{ ids: string[] }>()
const { ai } = useI18n()
const ui = chatToolTheme()

const MAX_CHIPS = 8

const nodes = computed(() => {
  const graph = getActiveEditorStoreOrNull()?.graph
  return ids.slice(0, MAX_CHIPS).map((id) => {
    const node = graph?.getNode(id)
    return { id, label: node?.name || id, present: node !== undefined && node.type !== 'CANVAS' }
  })
})

function show(id: string): void {
  const store = getActiveEditorStoreOrNull()
  if (store) void focusNodesOnTheirPage(store, [id])
}
</script>

<template>
  <div v-if="nodes.length" :class="ui.nodes()" data-slot="chat-tool-nodes">
    <button
      v-for="node in nodes"
      :key="node.id"
      type="button"
      :class="ui.node()"
      :disabled="!node.present"
      :aria-label="ai.showNodeOnCanvas({ name: node.label })"
      @click="show(node.id)"
    >
      <icon-lucide-crosshair :class="ui.nodeIcon()" aria-hidden="true" />
      <span :class="ui.nodeLabel()">{{ node.label }}</span>
    </button>
  </div>
</template>
