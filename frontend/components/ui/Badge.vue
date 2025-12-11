<template>
  <span :class="badgeClasses">
    <span v-if="dot" :class="dotClasses" />
    <slot />
  </span>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  rounded?: boolean;
  glow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'md',
  dot: false,
  rounded: true,
  glow: false,
});

const badgeClasses = computed(() => {
  const base = [
    'inline-flex items-center gap-1.5 font-semibold',
    'transition-all duration-fast',
    props.rounded ? 'rounded-full' : 'rounded-lg',
  ];

  // Apple Music style - darker, more opacity-based backgrounds
  const variants: Record<string, string> = {
    primary: 'bg-primary-500/20 text-primary-400',
    success: 'bg-success-500/20 text-success-400',
    warning: 'bg-warning-500/20 text-warning-400',
    error: 'bg-error-500/20 text-error-400',
    neutral: 'bg-surface-300 text-surface-800',
    info: 'bg-blue-500/20 text-blue-400',
    accent: 'bg-accent-500/20 text-accent-400',
  };

  const sizes: Record<string, string> = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  };

  // Glow effect for highlighted badges
  const glowStyles: Record<string, string> = {
    primary: 'shadow-glow-sm',
    success: 'shadow-glow-success',
    warning: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]',
    error: 'shadow-[0_0_10px_rgba(239,68,68,0.2)]',
    neutral: '',
    info: 'shadow-[0_0_10px_rgba(59,130,246,0.2)]',
    accent: 'shadow-glow-accent',
  };

  return [
    ...base,
    variants[props.variant],
    sizes[props.size],
    props.glow ? glowStyles[props.variant] : '',
  ];
});

const dotClasses = computed(() => {
  const base = ['w-1.5 h-1.5 rounded-full animate-pulse'];

  const dotColors: Record<string, string> = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    neutral: 'bg-surface-500',
    info: 'bg-blue-500',
    accent: 'bg-accent-500',
  };

  return [...base, dotColors[props.variant]];
});
</script>
