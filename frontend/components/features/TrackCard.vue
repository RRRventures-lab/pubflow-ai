<template>
  <Card hover class="group" @click="$emit('click', track)">
    <div class="flex gap-4">
      <!-- Album art / thumbnail -->
      <div class="relative shrink-0">
        <div
          class="w-16 h-16 rounded-lg bg-surface-100 dark:bg-surface-800 overflow-hidden"
        >
          <img
            v-if="track.imageUrl"
            :src="track.imageUrl"
            :alt="track.title"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <MusicalNoteIcon class="w-8 h-8 text-surface-400" />
          </div>
        </div>

        <!-- Play button overlay -->
        <button
          v-if="playable"
          class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
          @click.stop="$emit('play', track)"
        >
          <PlayIcon class="w-8 h-8 text-white" />
        </button>
      </div>

      <!-- Track info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h4 class="font-medium text-surface-900 dark:text-white truncate">
              {{ track.title }}
            </h4>
            <p class="text-sm text-surface-500 truncate">
              {{ track.artists?.join(', ') || 'Unknown Artist' }}
            </p>
          </div>

          <!-- Status badge -->
          <Badge v-if="track.status" :variant="statusVariant">
            {{ track.status }}
          </Badge>
        </div>

        <!-- Metadata row -->
        <div class="flex items-center gap-4 mt-2 text-xs text-surface-400">
          <span v-if="track.album" class="truncate max-w-[120px]">
            {{ track.album }}
          </span>
          <span v-if="track.duration">
            {{ formatDuration(track.duration) }}
          </span>
          <span v-if="track.releaseDate">
            {{ formatDate(track.releaseDate) }}
          </span>
        </div>

        <!-- Sources indicators -->
        <div v-if="track.sources?.length" class="flex items-center gap-2 mt-2">
          <div
            v-for="source in track.sources.slice(0, 3)"
            :key="source"
            :class="[
              'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold',
              getSourceClasses(source),
            ]"
            :title="source"
          >
            {{ getSourceInitial(source) }}
          </div>
          <span
            v-if="track.sources.length > 3"
            class="text-xs text-surface-400"
          >
            +{{ track.sources.length - 3 }}
          </span>
        </div>
      </div>

      <!-- Match confidence -->
      <div v-if="track.matchConfidence !== undefined" class="shrink-0">
        <ProgressRing
          :value="track.matchConfidence"
          :size="48"
          :stroke-width="4"
          :color="getConfidenceColor(track.matchConfidence)"
        />
      </div>
    </div>

    <!-- Expanded details -->
    <Transition name="slide">
      <div v-if="expanded" class="mt-4 pt-4 border-t border-surface-200 dark:border-surface-800">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div v-if="track.isrc">
            <span class="text-surface-400">ISRC:</span>
            <span class="ml-2 font-mono text-surface-700 dark:text-surface-300">
              {{ track.isrc }}
            </span>
          </div>
          <div v-if="track.iswc">
            <span class="text-surface-400">ISWC:</span>
            <span class="ml-2 font-mono text-surface-700 dark:text-surface-300">
              {{ track.iswc }}
            </span>
          </div>
          <div v-if="track.upc">
            <span class="text-surface-400">UPC:</span>
            <span class="ml-2 font-mono text-surface-700 dark:text-surface-300">
              {{ track.upc }}
            </span>
          </div>
          <div v-if="track.label">
            <span class="text-surface-400">Label:</span>
            <span class="ml-2 text-surface-700 dark:text-surface-300">
              {{ track.label }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Card>
</template>

<script setup lang="ts">
import { MusicalNoteIcon, PlayIcon } from '@heroicons/vue/24/outline';

export interface Track {
  id: string;
  title: string;
  artists?: string[];
  album?: string;
  imageUrl?: string;
  duration?: number;
  releaseDate?: string;
  status?: 'matched' | 'pending' | 'unmatched' | 'enriched';
  sources?: string[];
  matchConfidence?: number;
  isrc?: string;
  iswc?: string;
  upc?: string;
  label?: string;
}

interface Props {
  track: Track;
  expanded?: boolean;
  playable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
  playable: false,
});

defineEmits<{
  click: [track: Track];
  play: [track: Track];
}>();

const statusVariant = computed(() => {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'primary' | 'neutral'> = {
    matched: 'success',
    pending: 'warning',
    unmatched: 'error',
    enriched: 'primary',
  };
  return variants[props.track.status || ''] || 'neutral';
});

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });
}

function getSourceClasses(source: string): string {
  const classes: Record<string, string> = {
    spotify: 'bg-green-500/20 text-green-600',
    apple: 'bg-pink-500/20 text-pink-600',
    youtube: 'bg-red-500/20 text-red-600',
    deezer: 'bg-purple-500/20 text-purple-600',
    tidal: 'bg-blue-500/20 text-blue-600',
    soundcloud: 'bg-orange-500/20 text-orange-600',
  };
  return classes[source.toLowerCase()] || 'bg-surface-200 dark:bg-surface-700 text-surface-600';
}

function getSourceInitial(source: string): string {
  return source.charAt(0).toUpperCase();
}

function getConfidenceColor(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence >= 80) return 'success';
  if (confidence >= 50) return 'warning';
  return 'error';
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
}
</style>
