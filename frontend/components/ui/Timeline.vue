<template>
  <div class="relative">
    <!-- Timeline line -->
    <div
      v-if="items.length > 1"
      class="absolute left-4 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700"
    />

    <!-- Timeline items -->
    <div class="space-y-6">
      <div
        v-for="(item, index) in items"
        :key="item.id || index"
        class="relative pl-10"
      >
        <!-- Dot -->
        <div
          :class="[
            'absolute left-2 w-4 h-4 rounded-full border-2 bg-white dark:bg-surface-900',
            getDotClasses(item),
          ]"
        >
          <component
            v-if="item.icon"
            :is="item.icon"
            class="w-2.5 h-2.5 absolute top-0.5 left-0.5"
          />
        </div>

        <!-- Content -->
        <div
          :class="[
            'p-4 rounded-lg border transition-colors',
            item.highlighted
              ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
              : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
          ]"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 mb-2">
            <div>
              <h4 class="font-medium text-surface-900 dark:text-white">
                {{ item.title }}
              </h4>
              <p v-if="item.subtitle" class="text-sm text-surface-500">
                {{ item.subtitle }}
              </p>
            </div>
            <time
              v-if="item.timestamp"
              class="text-xs text-surface-400 whitespace-nowrap"
            >
              {{ formatTimestamp(item.timestamp) }}
            </time>
          </div>

          <!-- Description -->
          <p v-if="item.description" class="text-sm text-surface-600 dark:text-surface-400">
            {{ item.description }}
          </p>

          <!-- Custom content slot -->
          <slot :name="`item-${item.id || index}`" :item="item" />

          <!-- Actions -->
          <div v-if="item.actions?.length" class="mt-3 flex items-center gap-2">
            <Button
              v-for="action in item.actions"
              :key="action.label"
              :variant="action.variant || 'ghost'"
              size="sm"
              @click="$emit('action', { action: action.action, item })"
            >
              {{ action.label }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface TimelineAction {
  label: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export interface TimelineItem {
  id?: string | number;
  title: string;
  subtitle?: string;
  description?: string;
  timestamp?: Date | string;
  status?: 'completed' | 'current' | 'pending' | 'error';
  icon?: Component;
  highlighted?: boolean;
  actions?: TimelineAction[];
}

interface Props {
  items: TimelineItem[];
}

defineProps<Props>();

defineEmits<{
  action: [payload: { action: string; item: TimelineItem }];
}>();

function getDotClasses(item: TimelineItem): string {
  const statusClasses: Record<string, string> = {
    completed: 'border-success-500 bg-success-500',
    current: 'border-primary-500 bg-primary-500 ring-4 ring-primary-100 dark:ring-primary-900',
    pending: 'border-surface-300 dark:border-surface-600',
    error: 'border-error-500 bg-error-500',
  };
  return statusClasses[item.status || 'pending'];
}

function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
</script>
