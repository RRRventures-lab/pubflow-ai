<template>
  <span :class="badgeClasses">
    <span v-if="dot" :class="dotClasses" />
    <slot />
  </span>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  rounded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'md',
  dot: false,
  rounded: true,
});

const badgeClasses = computed(() => {
  const base = [
    'inline-flex items-center gap-1.5 font-medium',
    props.rounded ? 'rounded-full' : 'rounded',
  ];

  const variants: Record<string, string> = {
    primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
    success: 'bg-success-50 text-success-600 dark:bg-green-900 dark:text-green-200',
    warning: 'bg-warning-50 text-warning-600 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-error-50 text-error-600 dark:bg-red-900 dark:text-red-200',
    neutral: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };

  const sizes: Record<string, string> = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  return [...base, variants[props.variant], sizes[props.size]];
});

const dotClasses = computed(() => {
  const base = ['w-1.5 h-1.5 rounded-full'];

  const dotColors: Record<string, string> = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    neutral: 'bg-surface-400',
    info: 'bg-blue-500',
  };

  return [...base, dotColors[props.variant]];
});
</script>
