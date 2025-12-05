<template>
  <Card padding="md">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm font-medium text-surface-500">{{ title }}</p>
        <p class="mt-2 text-3xl font-bold text-surface-900 dark:text-white">
          {{ formattedValue }}
        </p>
        <p v-if="trend !== undefined" class="mt-1 text-sm">
          <span :class="trendClass">
            {{ trendPrefix }}{{ formattedTrend }}
          </span>
          <span class="text-surface-500"> {{ trendLabel }}</span>
        </p>
      </div>
      <div
        :class="[
          'w-12 h-12 rounded-xl flex items-center justify-center',
          iconColor,
          alert ? 'animate-pulse' : '',
        ]"
      >
        <component :is="icon" class="w-6 h-6 text-white" />
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface Props {
  title: string;
  value: number | string;
  trend?: number;
  trendLabel?: string;
  icon: Component;
  iconColor?: string;
  alert?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  iconColor: 'bg-primary-500',
  trendLabel: 'vs last period',
  alert: false,
});

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value;
  return props.value.toLocaleString();
});

const formattedTrend = computed(() => {
  if (props.trend === undefined) return '';
  return props.trend.toLocaleString();
});

const trendPrefix = computed(() => {
  if (props.trend === undefined) return '';
  if (props.trend > 0) return '+';
  return '';
});

const trendClass = computed(() => {
  if (props.trend === undefined) return '';
  if (props.trend > 0) return 'text-success-600 dark:text-success-400';
  if (props.trend < 0) return 'text-error-600 dark:text-error-400';
  return 'text-surface-500';
});
</script>
