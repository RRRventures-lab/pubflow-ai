<template>
  <div>
    <!-- Tab list -->
    <div
      :class="[
        'flex border-b border-surface-200 dark:border-surface-800',
        variant === 'pills' && 'gap-1 border-none bg-surface-100 dark:bg-surface-800 p-1 rounded-lg',
        variant === 'underline' && 'gap-6',
      ]"
    >
      <button
        v-for="(tab, index) in tabs"
        :key="tab.key || index"
        :class="[
          'relative flex items-center gap-2 font-medium transition-all',
          getTabClasses(tab, index),
        ]"
        :disabled="tab.disabled"
        @click="selectTab(index)"
      >
        <component v-if="tab.icon" :is="tab.icon" class="w-4 h-4" />
        <span>{{ tab.label }}</span>
        <Badge v-if="tab.badge" :variant="tab.badgeVariant || 'neutral'" size="sm">
          {{ tab.badge }}
        </Badge>
      </button>
    </div>

    <!-- Tab panels -->
    <div :class="['mt-4', contentClass]">
      <Transition
        :name="transitionName"
        mode="out-in"
      >
        <div :key="activeIndex">
          <slot :name="tabs[activeIndex]?.key || `tab-${activeIndex}`" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface Tab {
  key?: string;
  label: string;
  icon?: Component;
  badge?: string | number;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  disabled?: boolean;
}

interface Props {
  tabs: Tab[];
  modelValue?: number;
  variant?: 'underline' | 'pills' | 'boxed';
  size?: 'sm' | 'md' | 'lg';
  contentClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
  variant: 'underline',
  size: 'md',
  contentClass: '',
});

const emit = defineEmits<{
  'update:modelValue': [index: number];
  change: [tab: Tab, index: number];
}>();

const activeIndex = ref(props.modelValue);

watch(() => props.modelValue, (newVal) => {
  activeIndex.value = newVal;
});

function selectTab(index: number) {
  if (props.tabs[index]?.disabled) return;
  activeIndex.value = index;
  emit('update:modelValue', index);
  emit('change', props.tabs[index], index);
}

function getTabClasses(tab: Tab, index: number): string[] {
  const isActive = index === activeIndex.value;
  const isDisabled = tab.disabled;

  const baseClasses: string[] = [];

  // Size classes
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  baseClasses.push(sizes[props.size]);

  // Variant-specific classes
  if (props.variant === 'underline') {
    baseClasses.push('border-b-2 -mb-px');
    if (isActive) {
      baseClasses.push('border-primary-500 text-primary-600 dark:text-primary-400');
    } else if (isDisabled) {
      baseClasses.push('border-transparent text-surface-300 dark:text-surface-600 cursor-not-allowed');
    } else {
      baseClasses.push('border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:border-surface-300');
    }
  }

  if (props.variant === 'pills') {
    baseClasses.push('rounded-md');
    if (isActive) {
      baseClasses.push('bg-white dark:bg-surface-900 text-surface-900 dark:text-white shadow-sm');
    } else if (isDisabled) {
      baseClasses.push('text-surface-300 dark:text-surface-600 cursor-not-allowed');
    } else {
      baseClasses.push('text-surface-500 hover:text-surface-700 dark:hover:text-surface-300');
    }
  }

  if (props.variant === 'boxed') {
    baseClasses.push('border border-surface-200 dark:border-surface-700 first:rounded-l-lg last:rounded-r-lg -ml-px first:ml-0');
    if (isActive) {
      baseClasses.push('bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 z-10');
    } else if (isDisabled) {
      baseClasses.push('bg-surface-50 dark:bg-surface-900 text-surface-300 dark:text-surface-600 cursor-not-allowed');
    } else {
      baseClasses.push('bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800');
    }
  }

  return baseClasses;
}

const transitionName = computed(() => {
  return 'fade';
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
