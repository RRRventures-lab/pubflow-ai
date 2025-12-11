<template>
  <Card :class="['relative overflow-hidden', clickable && 'cursor-pointer']" :hover="clickable" @click="clickable && $emit('click')">
    <!-- Background pattern -->
    <div
      v-if="showPattern"
      class="absolute top-0 right-0 w-32 h-32 opacity-5"
      :class="patternColorClass"
    >
      <component :is="icon" class="w-full h-full" />
    </div>

    <div class="relative">
      <!-- Header with icon -->
      <div class="flex items-start justify-between mb-4">
        <div
          :class="[
            'w-12 h-12 rounded-xl flex items-center justify-center',
            iconBgClass,
          ]"
        >
          <component :is="icon" :class="['w-6 h-6', iconColorClass]" />
        </div>

        <!-- Trend badge -->
        <div
          v-if="trend !== undefined"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            trendClasses,
          ]"
        >
          <component :is="trendIcon" class="w-3 h-3" />
          <span>{{ Math.abs(trend) }}%</span>
        </div>
      </div>

      <!-- Value -->
      <div class="mb-1">
        <span :class="['text-3xl font-bold tracking-tight', valueColorClass]">
          {{ formattedValue }}
        </span>
        <span v-if="unit" class="text-lg text-surface-400 ml-1">{{ unit }}</span>
      </div>

      <!-- Label -->
      <p class="text-sm text-surface-500">{{ label }}</p>

      <!-- Comparison -->
      <p v-if="comparison" class="text-xs text-surface-400 mt-2">
        {{ comparison }}
      </p>

      <!-- Sparkline -->
      <div v-if="sparklineData?.length" class="mt-4 h-10">
        <svg class="w-full h-full" preserveAspectRatio="none">
          <path
            :d="sparklinePath"
            fill="none"
            :class="sparklineColorClass"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            :d="sparklineAreaPath"
            :class="sparklineAreaClass"
          />
        </svg>
      </div>

      <!-- Progress bar -->
      <div v-if="progress !== undefined" class="mt-4">
        <div class="flex items-center justify-between text-xs text-surface-500 mb-1">
          <span>Progress</span>
          <span>{{ progress }}%</span>
        </div>
        <div class="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
          <div
            :class="['h-full rounded-full transition-all duration-500', progressColorClass]"
            :style="{ width: `${Math.min(100, progress)}%` }"
          />
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/vue/20/solid';
import { ChartBarIcon } from '@heroicons/vue/24/outline';

interface Props {
  label: string;
  value: number | string;
  unit?: string;
  icon?: Component;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'neutral';
  trend?: number;
  comparison?: string;
  sparklineData?: number[];
  progress?: number;
  clickable?: boolean;
  showPattern?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  icon: () => ChartBarIcon,
  color: 'primary',
  clickable: false,
  showPattern: false,
});

defineEmits<{
  click: [];
}>();

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value;
  if (props.value >= 1000000) {
    return (props.value / 1000000).toFixed(1) + 'M';
  }
  if (props.value >= 1000) {
    return (props.value / 1000).toFixed(1) + 'K';
  }
  return props.value.toLocaleString();
});

const colorClasses = computed(() => {
  const colors: Record<string, Record<string, string>> = {
    primary: {
      iconBg: 'bg-primary-100 dark:bg-primary-900/30',
      iconColor: 'text-primary-600 dark:text-primary-400',
      sparkline: 'stroke-primary-500',
      sparklineArea: 'fill-primary-500/10',
      progress: 'bg-primary-500',
      pattern: 'text-primary-500',
      value: 'text-surface-900 dark:text-white',
    },
    success: {
      iconBg: 'bg-success-100 dark:bg-success-900/30',
      iconColor: 'text-success-600 dark:text-success-400',
      sparkline: 'stroke-success-500',
      sparklineArea: 'fill-success-500/10',
      progress: 'bg-success-500',
      pattern: 'text-success-500',
      value: 'text-surface-900 dark:text-white',
    },
    warning: {
      iconBg: 'bg-warning-100 dark:bg-warning-900/30',
      iconColor: 'text-warning-600 dark:text-warning-400',
      sparkline: 'stroke-warning-500',
      sparklineArea: 'fill-warning-500/10',
      progress: 'bg-warning-500',
      pattern: 'text-warning-500',
      value: 'text-surface-900 dark:text-white',
    },
    error: {
      iconBg: 'bg-error-100 dark:bg-error-900/30',
      iconColor: 'text-error-600 dark:text-error-400',
      sparkline: 'stroke-error-500',
      sparklineArea: 'fill-error-500/10',
      progress: 'bg-error-500',
      pattern: 'text-error-500',
      value: 'text-surface-900 dark:text-white',
    },
    accent: {
      iconBg: 'bg-accent-100 dark:bg-accent-900/30',
      iconColor: 'text-accent-600 dark:text-accent-400',
      sparkline: 'stroke-accent-500',
      sparklineArea: 'fill-accent-500/10',
      progress: 'bg-accent-500',
      pattern: 'text-accent-500',
      value: 'text-surface-900 dark:text-white',
    },
    neutral: {
      iconBg: 'bg-surface-100 dark:bg-surface-800',
      iconColor: 'text-surface-600 dark:text-surface-400',
      sparkline: 'stroke-surface-400',
      sparklineArea: 'fill-surface-400/10',
      progress: 'bg-surface-400',
      pattern: 'text-surface-400',
      value: 'text-surface-900 dark:text-white',
    },
  };
  return colors[props.color];
});

const iconBgClass = computed(() => colorClasses.value.iconBg);
const iconColorClass = computed(() => colorClasses.value.iconColor);
const sparklineColorClass = computed(() => colorClasses.value.sparkline);
const sparklineAreaClass = computed(() => colorClasses.value.sparklineArea);
const progressColorClass = computed(() => colorClasses.value.progress);
const patternColorClass = computed(() => colorClasses.value.pattern);
const valueColorClass = computed(() => colorClasses.value.value);

const trendIcon = computed(() => {
  if (!props.trend) return MinusIcon;
  return props.trend > 0 ? ArrowUpIcon : ArrowDownIcon;
});

const trendClasses = computed(() => {
  if (!props.trend) {
    return 'bg-surface-100 dark:bg-surface-800 text-surface-500';
  }
  return props.trend > 0
    ? 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400'
    : 'bg-error-100 dark:bg-error-900/30 text-error-600 dark:text-error-400';
});

// Sparkline path generation
const sparklinePath = computed(() => {
  if (!props.sparklineData?.length) return '';

  const data = props.sparklineData;
  const width = 100;
  const height = 40;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((value - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  return `M${points.join(' L')}`;
});

const sparklineAreaPath = computed(() => {
  if (!props.sparklineData?.length) return '';

  const data = props.sparklineData;
  const width = 100;
  const height = 40;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((value - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  return `M${padding},${height} L${points.join(' L')} L${width - padding},${height} Z`;
});
</script>
