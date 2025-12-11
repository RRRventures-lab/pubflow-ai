<template>
  <Card :class="['relative overflow-hidden', connected && 'ring-2 ring-success-500/20']">
    <!-- Connection status indicator -->
    <div
      :class="[
        'absolute top-0 left-0 right-0 h-1',
        connected ? 'bg-success-500' : 'bg-surface-200 dark:bg-surface-700',
      ]"
    />

    <div class="pt-2">
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <!-- Source logo -->
          <div
            :class="[
              'w-12 h-12 rounded-xl flex items-center justify-center',
              logoClass,
            ]"
          >
            <component :is="icon" class="w-6 h-6" />
          </div>

          <div>
            <h4 class="font-semibold text-surface-900 dark:text-white">
              {{ source.name }}
            </h4>
            <p class="text-sm text-surface-500">
              {{ source.type }}
            </p>
          </div>
        </div>

        <!-- Status toggle -->
        <div class="flex items-center gap-2">
          <span :class="['text-xs font-medium', connected ? 'text-success-600' : 'text-surface-400']">
            {{ connected ? 'Connected' : 'Disconnected' }}
          </span>
          <button
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              connected ? 'bg-success-500' : 'bg-surface-200 dark:bg-surface-700',
            ]"
            @click="$emit('toggle', source)"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                connected ? 'translate-x-6' : 'translate-x-1',
              ]"
            />
          </button>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-semibold text-surface-900 dark:text-white">
            {{ formatNumber(source.tracksIndexed || 0) }}
          </p>
          <p class="text-xs text-surface-500">Tracks</p>
        </div>
        <div class="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-semibold text-surface-900 dark:text-white">
            {{ formatNumber(source.artistsIndexed || 0) }}
          </p>
          <p class="text-xs text-surface-500">Artists</p>
        </div>
        <div class="text-center p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
          <p class="text-lg font-semibold text-surface-900 dark:text-white">
            {{ source.lastSyncStatus || 'Never' }}
          </p>
          <p class="text-xs text-surface-500">Last Sync</p>
        </div>
      </div>

      <!-- Sync progress -->
      <div v-if="source.syncInProgress" class="mb-4">
        <div class="flex items-center justify-between text-xs text-surface-500 mb-1">
          <span>Syncing...</span>
          <span>{{ source.syncProgress || 0 }}%</span>
        </div>
        <div class="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 rounded-full transition-all duration-300"
            :style="{ width: `${source.syncProgress || 0}%` }"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <Button
          v-if="connected"
          variant="secondary"
          size="sm"
          :icon="ArrowPathIcon"
          :loading="source.syncInProgress"
          @click="$emit('sync', source)"
        >
          Sync Now
        </Button>
        <Button
          v-else
          variant="primary"
          size="sm"
          :icon="LinkIcon"
          @click="$emit('connect', source)"
        >
          Connect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :icon="Cog6ToothIcon"
          @click="$emit('configure', source)"
        />
      </div>

      <!-- Error message -->
      <div
        v-if="source.lastError"
        class="mt-4 p-3 rounded-lg bg-error-50 dark:bg-error-900/20 text-error-600 dark:text-error-400 text-sm"
      >
        <div class="flex items-start gap-2">
          <ExclamationTriangleIcon class="w-5 h-5 shrink-0" />
          <p>{{ source.lastError }}</p>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import {
  ArrowPathIcon,
  LinkIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  CloudIcon,
} from '@heroicons/vue/24/outline';

export interface DataSource {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  tracksIndexed?: number;
  artistsIndexed?: number;
  lastSyncStatus?: string;
  syncInProgress?: boolean;
  syncProgress?: number;
  lastError?: string;
  color?: string;
}

interface Props {
  source: DataSource;
  icon?: Component;
}

const props = withDefaults(defineProps<Props>(), {
  icon: () => CloudIcon,
});

defineEmits<{
  toggle: [source: DataSource];
  sync: [source: DataSource];
  connect: [source: DataSource];
  configure: [source: DataSource];
}>();

const connected = computed(() => props.source.connected);

const logoClass = computed(() => {
  if (props.source.color) {
    return `bg-${props.source.color}-100 dark:bg-${props.source.color}-900/30 text-${props.source.color}-600`;
  }
  return 'bg-surface-100 dark:bg-surface-800 text-surface-600';
});

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}
</script>
