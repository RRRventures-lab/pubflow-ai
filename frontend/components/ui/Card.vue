<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    :class="cardClasses"
  >
    <!-- Chrome shine effect overlay -->
    <div v-if="chrome" class="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
      <div class="chrome-shine-bar" />
    </div>

    <!-- Top highlight line (liquid glass effect) -->
    <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-[inherit]" />

    <!-- Header -->
    <div v-if="$slots.header || title" :class="headerClasses" class="relative z-10">
      <slot name="header">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-white">{{ title }}</h3>
            <p v-if="subtitle" class="text-sm text-zinc-400 mt-0.5">{{ subtitle }}</p>
          </div>
          <slot name="headerAction" />
        </div>
      </slot>
    </div>

    <!-- Body -->
    <div :class="bodyClasses" class="relative z-10">
      <slot />
    </div>

    <!-- Footer -->
    <div v-if="$slots.footer" :class="footerClasses" class="relative z-10">
      <slot name="footer" />
    </div>
  </component>
</template>

<script setup lang="ts">
interface Props {
  title?: string;
  subtitle?: string;
  to?: string;
  variant?: 'glass' | 'chrome' | 'solid';
  hover?: boolean;
  glow?: boolean;
  chrome?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  divided?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'glass',
  hover: false,
  glow: false,
  chrome: false,
  padding: 'md',
  divided: false,
});

const NuxtLink = resolveComponent('NuxtLink');

const cardClasses = computed(() => {
  const base = [
    'relative overflow-hidden',
    'rounded-3xl',
    'transition-all duration-300 ease-fluid',
  ];

  // Variant styles - liquid glass effects
  const variants: Record<string, string[]> = {
    glass: [
      // Liquid glass background
      'bg-gradient-to-br from-white/10 via-white/5 to-white/[0.02]',
      'backdrop-blur-xl',
      'border border-white/[0.15]',
      'shadow-glass',
    ],
    chrome: [
      // Chrome/metallic effect
      'bg-gradient-to-br from-white/15 via-zinc-400/10 to-white/5',
      'backdrop-blur-2xl',
      'border border-white/[0.12]',
      'shadow-chrome-md',
    ],
    solid: [
      'bg-surface-100',
      'border border-white/10',
      'shadow-chrome-sm',
    ],
  };

  // Hover effects
  const hoverEffects = props.hover ? [
    'cursor-pointer',
    'hover:-translate-y-1',
    props.variant === 'glass'
      ? 'hover:bg-gradient-to-br hover:from-white/15 hover:via-white/8 hover:to-white/[0.03] hover:border-white/20 hover:shadow-glass-hover'
      : '',
    props.variant === 'chrome'
      ? 'hover:border-white/20 hover:shadow-chrome-lg'
      : '',
    props.variant === 'solid'
      ? 'hover:bg-surface-200'
      : '',
  ] : [];

  // Glow effect
  const glowEffect = props.glow ? ['shadow-glow-white animate-pulse-glow'] : [];

  return [
    ...base,
    ...variants[props.variant],
    ...hoverEffects,
    ...glowEffect,
  ];
});

const paddingSizes: Record<string, string> = {
  none: '',
  sm: 'px-4 py-3',
  md: 'px-6 py-5',
  lg: 'px-8 py-6',
};

const headerClasses = computed(() => [
  paddingSizes[props.padding],
  props.divided ? 'border-b border-white/10' : '',
]);

const bodyClasses = computed(() => [
  paddingSizes[props.padding],
]);

const footerClasses = computed(() => [
  paddingSizes[props.padding],
  'border-t border-white/10',
  'bg-white/[0.03]',
  'rounded-b-3xl',
]);
</script>

<style scoped>
.chrome-shine-bar {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.12),
    transparent
  );
  animation: shine 4s ease-in-out infinite;
}

@keyframes shine {
  0% { left: -100%; }
  50%, 100% { left: 200%; }
}
</style>
