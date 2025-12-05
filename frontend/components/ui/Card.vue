<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    :class="cardClasses"
  >
    <!-- Header -->
    <div v-if="$slots.header || title" :class="headerClasses">
      <slot name="header">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-surface-900 dark:text-white">{{ title }}</h3>
            <p v-if="subtitle" class="text-sm text-surface-500 mt-0.5">{{ subtitle }}</p>
          </div>
          <slot name="headerAction" />
        </div>
      </slot>
    </div>

    <!-- Body -->
    <div :class="bodyClasses">
      <slot />
    </div>

    <!-- Footer -->
    <div v-if="$slots.footer" :class="footerClasses">
      <slot name="footer" />
    </div>
  </component>
</template>

<script setup lang="ts">
interface Props {
  title?: string;
  subtitle?: string;
  to?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  divided?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hover: false,
  padding: 'md',
  divided: false,
});

const NuxtLink = resolveComponent('NuxtLink');

const cardClasses = computed(() => {
  const base = [
    'bg-white dark:bg-surface-900',
    'border border-surface-200 dark:border-surface-800',
    'rounded-xl',
  ];

  if (props.hover) {
    base.push(
      'hover:shadow-md hover:border-surface-300 dark:hover:border-surface-700',
      'transition-all duration-200',
      'cursor-pointer'
    );
  } else {
    base.push('shadow-sm');
  }

  return base;
});

const paddingSizes: Record<string, string> = {
  none: '',
  sm: 'px-4 py-3',
  md: 'px-6 py-4',
  lg: 'px-8 py-6',
};

const headerClasses = computed(() => [
  paddingSizes[props.padding],
  props.divided ? 'border-b border-surface-200 dark:border-surface-800' : '',
]);

const bodyClasses = computed(() => [
  paddingSizes[props.padding],
]);

const footerClasses = computed(() => [
  paddingSizes[props.padding],
  'border-t border-surface-200 dark:border-surface-800',
  'bg-surface-50 dark:bg-surface-900/50',
  'rounded-b-xl',
]);
</script>
