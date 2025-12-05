<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    :disabled="disabled || loading"
    :class="buttonClasses"
    v-bind="$attrs"
  >
    <Spinner v-if="loading" class="w-4 h-4" />
    <component :is="icon" v-else-if="icon" :class="iconClasses" />
    <slot />
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  icon?: Component;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  iconPosition: 'left',
  fullWidth: false,
});

const NuxtLink = resolveComponent('NuxtLink');

const buttonClasses = computed(() => {
  const base = [
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
    'transition-all duration-200 ease-out',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ];

  const variants: Record<string, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
    secondary: 'bg-surface-100 text-surface-900 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700 focus-visible:ring-surface-500',
    ghost: 'bg-transparent hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-400',
    danger: 'bg-error-600 text-white hover:bg-error-500 focus-visible:ring-error-500',
    success: 'bg-success-600 text-white hover:bg-success-500 focus-visible:ring-success-500',
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return [
    ...base,
    variants[props.variant],
    sizes[props.size],
    props.fullWidth ? 'w-full' : '',
    props.iconPosition === 'right' ? 'flex-row-reverse' : '',
  ];
});

const iconClasses = computed(() => {
  const sizes: Record<string, string> = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  return sizes[props.size];
});
</script>
