<template>
  <TransitionRoot appear :show="modelValue" as="template">
    <Dialog as="div" class="relative z-50" @close="close">
      <!-- Backdrop -->
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/50" />
      </TransitionChild>

      <!-- Modal container -->
      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="duration-200 ease-out"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="duration-150 ease-in"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel :class="panelClasses">
              <!-- Header -->
              <div
                v-if="$slots.header || title"
                class="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-800"
              >
                <slot name="header">
                  <DialogTitle class="text-lg font-semibold text-surface-900 dark:text-white">
                    {{ title }}
                  </DialogTitle>
                </slot>
                <button
                  v-if="closable"
                  class="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                  @click="close"
                >
                  <XMarkIcon class="w-5 h-5 text-surface-500" />
                </button>
              </div>

              <!-- Body -->
              <div :class="bodyClasses">
                <slot />
              </div>

              <!-- Footer -->
              <div
                v-if="$slots.footer"
                class="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 rounded-b-xl"
              >
                <slot name="footer" />
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';

interface Props {
  modelValue: boolean;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  closable: true,
  padding: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const panelClasses = computed(() => {
  const base = [
    'w-full bg-white dark:bg-surface-900',
    'rounded-xl shadow-xl',
    'transform transition-all',
  ];

  const sizes: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  return [...base, sizes[props.size]];
});

const bodyClasses = computed(() => {
  const paddings: Record<string, string> = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return [paddings[props.padding]];
});

function close() {
  emit('update:modelValue', false);
}
</script>
