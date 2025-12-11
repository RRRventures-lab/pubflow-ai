<template>
  <div :class="['text-center', sizeClasses.container]">
    <!-- Icon -->
    <div :class="['mx-auto rounded-full flex items-center justify-center', sizeClasses.iconWrapper, iconBgClass]">
      <component :is="icon" :class="['text-surface-400', sizeClasses.icon]" />
    </div>

    <!-- Title -->
    <h3 :class="['font-semibold text-surface-900 dark:text-white', sizeClasses.title]">
      {{ title }}
    </h3>

    <!-- Description -->
    <p v-if="description" :class="['text-surface-500 max-w-md mx-auto', sizeClasses.description]">
      {{ description }}
    </p>

    <!-- Actions -->
    <div v-if="$slots.actions || primaryAction" :class="['flex items-center justify-center gap-3', sizeClasses.actions]">
      <slot name="actions">
        <Button
          v-if="primaryAction"
          :icon="primaryAction.icon"
          @click="$emit('primary')"
        >
          {{ primaryAction.label }}
        </Button>
        <Button
          v-if="secondaryAction"
          variant="secondary"
          :icon="secondaryAction.icon"
          @click="$emit('secondary')"
        >
          {{ secondaryAction.label }}
        </Button>
      </slot>
    </div>

    <!-- Additional content -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { InboxIcon } from '@heroicons/vue/24/outline';

interface ActionConfig {
  label: string;
  icon?: Component;
}

interface Props {
  icon?: Component;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  iconBg?: 'none' | 'subtle' | 'solid';
}

const props = withDefaults(defineProps<Props>(), {
  icon: () => InboxIcon,
  size: 'md',
  iconBg: 'subtle',
});

defineEmits<{
  primary: [];
  secondary: [];
}>();

const sizeClasses = computed(() => {
  const sizes: Record<string, Record<string, string>> = {
    sm: {
      container: 'py-6',
      iconWrapper: 'w-10 h-10 mb-3',
      icon: 'w-5 h-5',
      title: 'text-sm mt-2',
      description: 'text-xs mt-1',
      actions: 'mt-3',
    },
    md: {
      container: 'py-12',
      iconWrapper: 'w-14 h-14 mb-4',
      icon: 'w-7 h-7',
      title: 'text-base mt-3',
      description: 'text-sm mt-2',
      actions: 'mt-5',
    },
    lg: {
      container: 'py-16',
      iconWrapper: 'w-20 h-20 mb-6',
      icon: 'w-10 h-10',
      title: 'text-lg mt-4',
      description: 'text-base mt-3',
      actions: 'mt-6',
    },
  };
  return sizes[props.size];
});

const iconBgClass = computed(() => {
  const bgs: Record<string, string> = {
    none: '',
    subtle: 'bg-surface-100 dark:bg-surface-800',
    solid: 'bg-primary-100 dark:bg-primary-900/30',
  };
  return bgs[props.iconBg];
});
</script>
