<template>
  <Modal v-model="modelValue" title="Keyboard Shortcuts" size="lg">
    <div class="grid md:grid-cols-2 gap-8">
      <!-- Global shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          Global
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in globalShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>

      <!-- Navigation shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          Navigation
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in navigationShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>

      <!-- Table shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          Tables & Lists
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in tableShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>

      <!-- Matching Queue shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          Matching Queue
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in matchingShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>

      <!-- CWR shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          CWR Files
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in cwrShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>

      <!-- Actions shortcuts -->
      <div>
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-3">
          Actions
        </h3>
        <div class="space-y-2">
          <ShortcutItem
            v-for="shortcut in actionShortcuts"
            :key="shortcut.keys.join('')"
            :keys="shortcut.keys"
            :description="shortcut.description"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <p class="text-sm text-surface-500 mr-auto">
        Press <kbd class="kbd">?</kbd> anywhere to show this dialog
      </p>
      <Button variant="secondary" @click="modelValue = false">
        Close
      </Button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean;
}

const modelValue = defineModel<boolean>();

interface Shortcut {
  keys: string[];
  description: string;
}

const globalShortcuts: Shortcut[] = [
  { keys: ['⌘', 'K'], description: 'Open search' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['⌘', '/'], description: 'Toggle sidebar' },
  { keys: ['⌘', 'D'], description: 'Toggle dark mode' },
  { keys: ['Esc'], description: 'Close modal / Cancel' },
];

const navigationShortcuts: Shortcut[] = [
  { keys: ['G', 'H'], description: 'Go to Dashboard' },
  { keys: ['G', 'W'], description: 'Go to Works' },
  { keys: ['G', 'R'], description: 'Go to Writers' },
  { keys: ['G', 'C'], description: 'Go to CWR Files' },
  { keys: ['G', 'S'], description: 'Go to Statements' },
  { keys: ['G', 'M'], description: 'Go to Matching Queue' },
];

const tableShortcuts: Shortcut[] = [
  { keys: ['J'], description: 'Next row' },
  { keys: ['K'], description: 'Previous row' },
  { keys: ['↵'], description: 'Open selected' },
  { keys: ['Space'], description: 'Toggle selection' },
  { keys: ['⌘', 'A'], description: 'Select all' },
  { keys: ['⌘', 'Shift', 'A'], description: 'Deselect all' },
];

const matchingShortcuts: Shortcut[] = [
  { keys: ['A'], description: 'Accept match' },
  { keys: ['R'], description: 'Reject match' },
  { keys: ['S'], description: 'Skip / Review later' },
  { keys: ['E'], description: 'Edit work details' },
  { keys: ['C'], description: 'Create new work' },
  { keys: ['M'], description: 'Manual match' },
];

const cwrShortcuts: Shortcut[] = [
  { keys: ['N'], description: 'New CWR export' },
  { keys: ['P'], description: 'Preview CWR' },
  { keys: ['D'], description: 'Download CWR' },
  { keys: ['V'], description: 'Validate CWR' },
];

const actionShortcuts: Shortcut[] = [
  { keys: ['⌘', 'S'], description: 'Save' },
  { keys: ['⌘', 'N'], description: 'New item' },
  { keys: ['⌘', 'E'], description: 'Edit selected' },
  { keys: ['⌘', 'Backspace'], description: 'Delete selected' },
  { keys: ['⌘', 'Z'], description: 'Undo' },
  { keys: ['⌘', 'Shift', 'Z'], description: 'Redo' },
];
</script>
