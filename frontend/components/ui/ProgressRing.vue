<template>
  <div class="relative inline-flex items-center justify-center">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- Background circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        class="fill-none stroke-surface-200 dark:stroke-surface-700"
      />
      <!-- Progress circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :class="[
          'fill-none transition-all duration-500 ease-out',
          colorClass,
        ]"
        stroke-linecap="round"
        :style="{ transform: 'rotate(-90deg)', transformOrigin: 'center' }"
      />
    </svg>
    <!-- Center content -->
    <div class="absolute inset-0 flex items-center justify-center">
      <slot>
        <span :class="['font-semibold', textSizeClass, textColorClass]">
          {{ displayValue }}
        </span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'accent';
  showPercent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  max: 100,
  size: 80,
  strokeWidth: 6,
  color: 'primary',
  showPercent: true,
});

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const percent = computed(() => Math.min(100, Math.max(0, (props.value / props.max) * 100)));
const offset = computed(() => circumference.value - (percent.value / 100) * circumference.value);

const displayValue = computed(() => {
  if (props.showPercent) {
    return `${Math.round(percent.value)}%`;
  }
  return props.value.toLocaleString();
});

const colorClass = computed(() => {
  const colors: Record<string, string> = {
    primary: 'stroke-primary-500',
    success: 'stroke-success-500',
    warning: 'stroke-warning-500',
    error: 'stroke-error-500',
    accent: 'stroke-accent-500',
  };
  return colors[props.color];
});

const textColorClass = computed(() => {
  const colors: Record<string, string> = {
    primary: 'text-primary-600 dark:text-primary-400',
    success: 'text-success-600 dark:text-success-400',
    warning: 'text-warning-600 dark:text-warning-400',
    error: 'text-error-600 dark:text-error-400',
    accent: 'text-accent-600 dark:text-accent-400',
  };
  return colors[props.color];
});

const textSizeClass = computed(() => {
  if (props.size <= 60) return 'text-xs';
  if (props.size <= 80) return 'text-sm';
  if (props.size <= 120) return 'text-base';
  return 'text-lg';
});
</script>
