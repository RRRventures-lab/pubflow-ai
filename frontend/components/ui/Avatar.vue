<template>
  <div :class="['relative inline-flex shrink-0', sizeClasses.container]">
    <!-- Image or fallback -->
    <div
      :class="[
        'flex items-center justify-center overflow-hidden',
        rounded === 'full' ? 'rounded-full' : 'rounded-lg',
        !src && bgClass,
        sizeClasses.avatar,
      ]"
    >
      <img
        v-if="src && !imageError"
        :src="src"
        :alt="alt"
        class="w-full h-full object-cover"
        @error="imageError = true"
      />
      <span v-else-if="initials" :class="['font-medium', textClass, sizeClasses.text]">
        {{ initials }}
      </span>
      <component v-else :is="fallbackIcon" :class="['text-surface-400', sizeClasses.icon]" />
    </div>

    <!-- Status indicator -->
    <span
      v-if="status"
      :class="[
        'absolute block rounded-full ring-2 ring-white dark:ring-surface-900',
        statusClasses,
        sizeClasses.status,
      ]"
    />

    <!-- Badge -->
    <span
      v-if="badge !== undefined"
      :class="[
        'absolute flex items-center justify-center rounded-full bg-error-500 text-white font-medium',
        sizeClasses.badge,
      ]"
    >
      {{ badge > 99 ? '99+' : badge }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { UserIcon } from '@heroicons/vue/24/solid';

interface Props {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  rounded?: 'full' | 'lg';
  status?: 'online' | 'offline' | 'busy' | 'away';
  badge?: number;
  color?: 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';
  fallbackIcon?: Component;
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  size: 'md',
  rounded: 'full',
  color: 'neutral',
  fallbackIcon: () => UserIcon,
});

const imageError = ref(false);

const initials = computed(() => {
  if (!props.name) return '';
  return props.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
});

const sizeClasses = computed(() => {
  const sizes: Record<string, Record<string, string>> = {
    xs: {
      container: 'w-6 h-6',
      avatar: 'w-6 h-6',
      text: 'text-[10px]',
      icon: 'w-3 h-3',
      status: 'w-1.5 h-1.5 bottom-0 right-0',
      badge: 'w-3 h-3 text-[8px] -top-0.5 -right-0.5',
    },
    sm: {
      container: 'w-8 h-8',
      avatar: 'w-8 h-8',
      text: 'text-xs',
      icon: 'w-4 h-4',
      status: 'w-2 h-2 bottom-0 right-0',
      badge: 'w-4 h-4 text-[9px] -top-0.5 -right-0.5',
    },
    md: {
      container: 'w-10 h-10',
      avatar: 'w-10 h-10',
      text: 'text-sm',
      icon: 'w-5 h-5',
      status: 'w-2.5 h-2.5 bottom-0 right-0',
      badge: 'w-5 h-5 text-[10px] -top-1 -right-1',
    },
    lg: {
      container: 'w-12 h-12',
      avatar: 'w-12 h-12',
      text: 'text-base',
      icon: 'w-6 h-6',
      status: 'w-3 h-3 bottom-0 right-0',
      badge: 'w-5 h-5 text-xs -top-1 -right-1',
    },
    xl: {
      container: 'w-16 h-16',
      avatar: 'w-16 h-16',
      text: 'text-lg',
      icon: 'w-8 h-8',
      status: 'w-4 h-4 bottom-0.5 right-0.5',
      badge: 'w-6 h-6 text-xs -top-1 -right-1',
    },
    '2xl': {
      container: 'w-20 h-20',
      avatar: 'w-20 h-20',
      text: 'text-xl',
      icon: 'w-10 h-10',
      status: 'w-5 h-5 bottom-1 right-1',
      badge: 'w-7 h-7 text-sm -top-1 -right-1',
    },
  };
  return sizes[props.size];
});

const statusClasses = computed(() => {
  const statuses: Record<string, string> = {
    online: 'bg-success-500',
    offline: 'bg-surface-400',
    busy: 'bg-error-500',
    away: 'bg-warning-500',
  };
  return statuses[props.status || 'offline'];
});

const bgClass = computed(() => {
  const colors: Record<string, string> = {
    primary: 'bg-primary-100 dark:bg-primary-900/30',
    accent: 'bg-accent-100 dark:bg-accent-900/30',
    success: 'bg-success-100 dark:bg-success-900/30',
    warning: 'bg-warning-100 dark:bg-warning-900/30',
    error: 'bg-error-100 dark:bg-error-900/30',
    neutral: 'bg-surface-100 dark:bg-surface-800',
  };
  return colors[props.color];
});

const textClass = computed(() => {
  const colors: Record<string, string> = {
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    success: 'text-success-600 dark:text-success-400',
    warning: 'text-warning-600 dark:text-warning-400',
    error: 'text-error-600 dark:text-error-400',
    neutral: 'text-surface-600 dark:text-surface-400',
  };
  return colors[props.color];
});
</script>
