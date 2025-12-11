<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    :disabled="disabled || loading"
    :class="buttonClasses"
    v-bind="$attrs"
  >
    <!-- Chrome shine effect -->
    <div v-if="variant === 'chrome'" class="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
      <div class="btn-shine" />
    </div>

    <!-- Content -->
    <span class="relative z-10 flex items-center justify-center gap-2">
      <Spinner v-if="loading" class="w-4 h-4" />
      <component :is="icon" v-else-if="icon" :class="iconClasses" />
      <slot />
    </span>
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

interface Props {
  variant?: 'liquid' | 'chrome' | 'ghost' | 'danger' | 'success' | 'primary' | 'secondary' | 'error';
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  icon?: Component;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'liquid',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  iconPosition: 'left',
  fullWidth: false,
});

const NuxtLink = resolveComponent('NuxtLink');

const buttonClasses = computed(() => {
  const base = [
    'relative inline-flex items-center justify-center',
    'font-semibold',
    'rounded-full',
    'transition-all duration-300 ease-fluid',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-[0.97]',
    'overflow-hidden',
  ];

  // Variant styles - liquid glass effects
  const variants: Record<string, string[]> = {
    liquid: [
      // Liquid glass button
      'bg-gradient-to-br from-white/20 via-white/10 to-white/5',
      'backdrop-blur-xl',
      'border border-white/20',
      'text-white',
      'shadow-chrome-sm',
      'hover:from-white/30 hover:via-white/15 hover:to-white/8',
      'hover:border-white/30',
      'hover:-translate-y-0.5',
      'hover:shadow-chrome-md hover:shadow-glow-white',
    ],
    chrome: [
      // Solid chrome/metallic button
      'bg-gradient-to-b from-white via-zinc-200 to-zinc-300',
      'border border-white/50',
      'text-zinc-900',
      'shadow-chrome-md',
      'hover:from-white hover:via-zinc-100 hover:to-zinc-200',
      'hover:shadow-chrome-lg hover:shadow-glow-white',
      'hover:-translate-y-0.5',
    ],
    ghost: [
      'bg-transparent',
      'border border-transparent',
      'text-zinc-300',
      'hover:bg-white/10',
      'hover:text-white',
      'hover:border-white/10',
    ],
    danger: [
      'bg-gradient-to-br from-red-500/30 via-red-500/20 to-red-500/10',
      'backdrop-blur-xl',
      'border border-red-500/30',
      'text-red-300',
      'hover:from-red-500/40 hover:via-red-500/30 hover:to-red-500/20',
      'hover:border-red-500/50',
      'hover:text-red-200',
      'hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
    ],
    success: [
      'bg-gradient-to-br from-emerald-500/30 via-emerald-500/20 to-emerald-500/10',
      'backdrop-blur-xl',
      'border border-emerald-500/30',
      'text-emerald-300',
      'hover:from-emerald-500/40 hover:via-emerald-500/30 hover:to-emerald-500/20',
      'hover:border-emerald-500/50',
      'hover:text-emerald-200',
      'hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    ],
    // Alias: primary = chrome (main action button)
    primary: [
      'bg-gradient-to-b from-white via-zinc-200 to-zinc-300',
      'border border-white/50',
      'text-zinc-900',
      'shadow-chrome-md',
      'hover:from-white hover:via-zinc-100 hover:to-zinc-200',
      'hover:shadow-chrome-lg hover:shadow-glow-white',
      'hover:-translate-y-0.5',
    ],
    // Alias: secondary = liquid (secondary action)
    secondary: [
      'bg-gradient-to-br from-white/20 via-white/10 to-white/5',
      'backdrop-blur-xl',
      'border border-white/20',
      'text-white',
      'shadow-chrome-sm',
      'hover:from-white/30 hover:via-white/15 hover:to-white/8',
      'hover:border-white/30',
      'hover:-translate-y-0.5',
      'hover:shadow-chrome-md hover:shadow-glow-white',
    ],
    // Alias: error = danger
    error: [
      'bg-gradient-to-br from-red-500/30 via-red-500/20 to-red-500/10',
      'backdrop-blur-xl',
      'border border-red-500/30',
      'text-red-300',
      'hover:from-red-500/40 hover:via-red-500/30 hover:to-red-500/20',
      'hover:border-red-500/50',
      'hover:text-red-200',
      'hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
    ],
  };

  // Sizes
  const sizes: Record<string, string> = {
    sm: 'px-4 py-2 text-xs gap-1.5',
    md: 'px-6 py-3 text-sm gap-2',
    lg: 'px-8 py-4 text-base gap-2.5',
  };

  return [
    ...base,
    ...variants[props.variant],
    sizes[props.size],
    props.fullWidth ? 'w-full' : '',
    props.iconPosition === 'right' ? 'flex-row-reverse' : '',
  ];
});

const iconClasses = computed(() => {
  const sizes: Record<string, string> = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  return sizes[props.size];
});
</script>

<style scoped>
.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: btnShine 3s ease-in-out infinite;
}

@keyframes btnShine {
  0% { left: -100%; }
  50%, 100% { left: 200%; }
}
</style>
