<template>
  <div :class="containerClasses" :style="containerStyle">
    <!-- Glow effect background (blurred duplicate) -->
    <div
      v-if="glow && src"
      class="absolute inset-0 scale-110 blur-3xl opacity-50 -z-10"
      :style="{ backgroundImage: `url(${src})`, backgroundSize: 'cover' }"
    />

    <!-- Album image -->
    <div :class="imageWrapperClasses">
      <img
        v-if="src"
        :src="src"
        :alt="alt"
        class="w-full h-full object-cover"
        loading="lazy"
        @error="handleError"
      />

      <!-- Placeholder when no image -->
      <div v-else class="w-full h-full flex items-center justify-center bg-surface-200">
        <MusicalNoteIcon :class="placeholderIconClasses" />
      </div>

      <!-- Play button overlay -->
      <div
        v-if="playable"
        :class="[
          'absolute inset-0 flex items-center justify-center',
          'bg-black/40 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-normal',
        ]"
      >
        <button
          :class="playButtonClasses"
          @click.stop="$emit('play')"
        >
          <PlayIcon class="w-1/2 h-1/2 text-white ml-0.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MusicalNoteIcon, PlayIcon } from '@heroicons/vue/24/solid';

interface Props {
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  glow?: boolean;
  playable?: boolean;
  shadow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  alt: 'Album art',
  size: 'md',
  rounded: 'lg',
  glow: false,
  playable: false,
  shadow: true,
});

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'error'): void;
}>();

// Size mappings
const sizes: Record<string, string> = {
  xs: '40px',
  sm: '64px',
  md: '96px',
  lg: '128px',
  xl: '192px',
  '2xl': '256px',
};

// Rounded corner mappings
const roundedMap: Record<string, string> = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
  full: 'rounded-full',
};

const containerStyle = computed(() => ({
  width: sizes[props.size],
  height: sizes[props.size],
}));

const containerClasses = computed(() => [
  'relative shrink-0 group',
  props.glow && 'overflow-visible',
]);

const imageWrapperClasses = computed(() => [
  'relative w-full h-full overflow-hidden',
  roundedMap[props.rounded],
  props.shadow && 'shadow-album',
  'transition-all duration-normal ease-apple',
  props.playable && 'group-hover:shadow-album-hover',
]);

const placeholderIconClasses = computed(() => {
  const iconSizes: Record<string, string> = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28',
  };
  return [iconSizes[props.size], 'text-surface-500'];
});

const playButtonClasses = computed(() => {
  const buttonSizes: Record<string, string> = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
  };
  return [
    buttonSizes[props.size],
    'rounded-full bg-primary-500',
    'flex items-center justify-center',
    'hover:bg-primary-400 hover:scale-105',
    'transition-all duration-fast',
    'shadow-lg',
  ];
});

function handleError() {
  emit('error');
}
</script>
