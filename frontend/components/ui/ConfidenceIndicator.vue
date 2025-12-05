<template>
  <div :class="['inline-flex items-center gap-1.5', sizeClasses]">
    <!-- Progress bar style -->
    <template v-if="variant === 'bar'">
      <div :class="['flex-1 rounded-full overflow-hidden', barBgClass]">
        <div
          :class="['h-full rounded-full transition-all', barFillClass]"
          :style="{ width: `${percentage}%` }"
        />
      </div>
      <span :class="['font-medium tabular-nums', textClass]">
        {{ percentage }}%
      </span>
    </template>

    <!-- Circle style -->
    <template v-else-if="variant === 'circle'">
      <svg :class="circleSize" viewBox="0 0 36 36">
        <path
          class="stroke-surface-200 dark:stroke-surface-800"
          fill="none"
          stroke-width="3"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          :class="strokeClass"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="`${percentage}, 100`"
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <text
          x="18"
          y="21"
          :class="['fill-current', textClass]"
          text-anchor="middle"
          font-size="8"
          font-weight="600"
        >
          {{ percentage }}
        </text>
      </svg>
    </template>

    <!-- Badge style (default) -->
    <template v-else>
      <div :class="['inline-flex items-center gap-1 rounded-full px-2 py-0.5', badgeBgClass]">
        <div :class="['rounded-full', dotSize, dotClass]" />
        <span :class="['font-medium tabular-nums', textClass]">
          {{ percentage }}%
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface Props {
  value: number; // 0-1 or 0-100
  size?: 'sm' | 'md' | 'lg';
  variant?: 'badge' | 'bar' | 'circle';
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  variant: 'badge',
  showLabel: true,
});

// Normalize to 0-100 range
const percentage = computed(() => {
  const val = props.value > 1 ? props.value : props.value * 100;
  return Math.round(Math.min(100, Math.max(0, val)));
});

// Determine confidence level
const level = computed(() => {
  if (percentage.value >= 95) return 'excellent';
  if (percentage.value >= 80) return 'good';
  if (percentage.value >= 60) return 'fair';
  if (percentage.value >= 40) return 'low';
  return 'poor';
});

// Size classes
const sizeClasses = computed(() => {
  const sizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  return sizes[props.size];
});

const barBgClass = computed(() => {
  const sizes = {
    sm: 'h-1 w-12',
    md: 'h-1.5 w-16',
    lg: 'h-2 w-20',
  };
  return `bg-surface-200 dark:bg-surface-800 ${sizes[props.size]}`;
});

const circleSize = computed(() => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };
  return sizes[props.size];
});

const dotSize = computed(() => {
  const sizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };
  return sizes[props.size];
});

// Color classes based on level
const barFillClass = computed(() => {
  const colors = {
    excellent: 'bg-success-500',
    good: 'bg-primary-500',
    fair: 'bg-warning-500',
    low: 'bg-orange-500',
    poor: 'bg-error-500',
  };
  return colors[level.value];
});

const dotClass = computed(() => {
  const colors = {
    excellent: 'bg-success-500',
    good: 'bg-primary-500',
    fair: 'bg-warning-500',
    low: 'bg-orange-500',
    poor: 'bg-error-500',
  };
  return colors[level.value];
});

const strokeClass = computed(() => {
  const colors = {
    excellent: 'stroke-success-500',
    good: 'stroke-primary-500',
    fair: 'stroke-warning-500',
    low: 'stroke-orange-500',
    poor: 'stroke-error-500',
  };
  return colors[level.value];
});

const badgeBgClass = computed(() => {
  const colors = {
    excellent: 'bg-success-100 dark:bg-success-900/30',
    good: 'bg-primary-100 dark:bg-primary-900/30',
    fair: 'bg-warning-100 dark:bg-warning-900/30',
    low: 'bg-orange-100 dark:bg-orange-900/30',
    poor: 'bg-error-100 dark:bg-error-900/30',
  };
  return colors[level.value];
});

const textClass = computed(() => {
  const colors = {
    excellent: 'text-success-700 dark:text-success-400',
    good: 'text-primary-700 dark:text-primary-400',
    fair: 'text-warning-700 dark:text-warning-400',
    low: 'text-orange-700 dark:text-orange-400',
    poor: 'text-error-700 dark:text-error-400',
  };
  return colors[level.value];
});
</script>
