<template>
  <NuxtLink
    :to="to"
    :class="navItemClasses"
    @click="emit('click')"
  >
    <component :is="icon" class="w-5 h-5 shrink-0" />
    <span class="flex-1 truncate">{{ label }}</span>
    <Badge v-if="badge" variant="primary" size="sm">
      {{ badge }}
    </Badge>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface Props {
  to: string;
  icon: Component;
  label: string;
  badge?: number | string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  click: [];
}>();

const route = useRoute();

const isActive = computed(() => {
  if (props.to === '/') {
    return route.path === '/';
  }
  return route.path.startsWith(props.to);
});

const navItemClasses = computed(() => [
  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium',
  'transition-colors duration-150',
  isActive.value
    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200',
]);
</script>
