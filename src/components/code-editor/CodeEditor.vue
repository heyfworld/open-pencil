<script setup lang="ts">
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { DESIGN_JSX_ELEMENTS } from '@open-pencil/design-jsx'
import { shortcutPlatform } from '@open-pencil/vue'

import type { LayerIssue } from '@/app/code/layers/issues'
import type { LayerLinkSource } from '@/app/code/layers/links'
import { resolvedAppTheme } from '@/app/shell/theme'
import { designJSXExtensions } from '@/components/code-editor/extensions'
import { layerIssueDiagnostics, setLayerIssues } from '@/components/code-editor/layer-issues'
import {
  layerLinks as layerLinksExtension,
  setLayerLinks
} from '@/components/code-editor/layer-links'
import type { CodeEditorLanguage } from '@/components/code-editor/types'
import { codeEditorTheme } from '@/theme/code/editor'

const {
  modelValue,
  language = 'design-jsx',
  readOnly = false,
  label = 'Code',
  layerLinks = null,
  layerIssues = [],
  autofocus = false
} = defineProps<{
  modelValue: string
  language?: CodeEditorLanguage
  readOnly?: boolean
  label?: string
  /** How elements in the code map to canvas layers; `null` when they do not. */
  layerLinks?: LayerLinkSource | null
  /** Design issues to underline on the code of their layers. */
  layerIssues?: readonly LayerIssue[]
  /** Places the caret at the end of the code once the editor mounts. */
  autofocus?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** The layers of the element under the pointer, or `null` when it leaves them. */
  hoverLayers: [nodeIds: readonly string[] | null]
  /** The layers of an element ⌘-clicked (Ctrl-clicked outside macOS). */
  revealLayers: [nodeIds: readonly string[]]
}>()

const RUNTIME_TYPES = new Map(
  DESIGN_JSX_ELEMENTS.map(({ name, runtimeType }) => [name, runtimeType])
)
const IS_MAC = shortcutPlatform() === 'mac'

const host = useTemplateRef('host')
const languageCompartment = new Compartment()
const editableCompartment = new Compartment()
const labelCompartment = new Compartment()
const themeCompartment = new Compartment()
let editor: EditorView | undefined
let externalUpdate = false

function languageExtensions(language: CodeEditorLanguage): Extension {
  if (language === 'html-css') return html()
  return [
    javascript({ jsx: true, typescript: true }),
    ...(language === 'design-jsx' ? designJSXExtensions() : [])
  ]
}

function editableExtensions(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}

onMounted(() => {
  const parent = host.value
  if (!parent) return
  editor = new EditorView({
    doc: modelValue,
    parent,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      themeCompartment.of(codeEditorTheme(resolvedAppTheme.value === 'dark')),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      keymap.of([
        { key: 'Ctrl-z', run: undo },
        { key: 'Ctrl-Shift-z', run: redo },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap
      ]),
      languageCompartment.of(languageExtensions(language)),
      layerLinksExtension({
        typeOf: (tagName) => RUNTIME_TYPES.get(tagName),
        isLinkModifier: (event) => (IS_MAC ? event.metaKey : event.ctrlKey),
        onHover: (nodeIds) => emit('hoverLayers', nodeIds),
        onReveal: (nodeIds) => emit('revealLayers', nodeIds)
      }),
      layerIssueDiagnostics(),
      editableCompartment.of(editableExtensions(readOnly)),
      labelCompartment.of(EditorView.contentAttributes.of({ 'aria-label': label })),
      EditorView.lineWrapping,

      EditorView.updateListener.of((update) => {
        if (!update.docChanged || externalUpdate) return
        emit('update:modelValue', update.state.doc.toString())
      })
    ]
  })
  syncLayers()
  if (autofocus) focusEnd()
})

watch(
  () => modelValue,
  (value) => {
    if (!editor || editor.state.doc.toString() === value) return
    externalUpdate = true
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: Transaction.addToHistory.of(false)
    })
    externalUpdate = false
    syncLayers()
  }
)

/** Links and issues describe the current text, so they follow a text replacement. */
function syncLayers() {
  editor?.dispatch({
    effects: [setLayerLinks.of(layerLinks), setLayerIssues.of(layerIssues)]
  })
}

watch(() => [layerLinks, layerIssues] as const, syncLayers)

watch(
  () => language,
  (language) =>
    editor?.dispatch({ effects: languageCompartment.reconfigure(languageExtensions(language)) })
)

watch(
  () => readOnly,
  (readOnly) =>
    editor?.dispatch({ effects: editableCompartment.reconfigure(editableExtensions(readOnly)) })
)

watch(
  () => label,
  (label) =>
    editor?.dispatch({
      effects: labelCompartment.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': label })
      )
    })
)

watch(resolvedAppTheme, (theme) =>
  editor?.dispatch({ effects: themeCompartment.reconfigure(codeEditorTheme(theme === 'dark')) })
)

onBeforeUnmount(() => editor?.destroy())

function focusEnd() {
  if (!editor) return
  editor.focus()
  editor.dispatch({ selection: { anchor: editor.state.doc.length } })
}
</script>

<template>
  <div ref="host" data-slot="code-editor" class="min-h-0 flex-1 overflow-hidden text-xs" />
</template>
