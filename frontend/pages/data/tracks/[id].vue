<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-center py-20">
      <p class="text-error-500">{{ error }}</p>
      <Button variant="secondary" class="mt-4" @click="loadTrack">
        Try Again
      </Button>
    </div>

    <!-- Track content -->
    <template v-else-if="track">
      <!-- Back navigation -->
      <div class="flex items-center gap-4">
        <Button variant="ghost" :icon="ArrowLeftIcon" @click="navigateTo('/data')">
          Back to Data Hub
        </Button>
      </div>

      <!-- Track header -->
      <div class="flex gap-6">
        <!-- Album art -->
        <div class="shrink-0">
          <div class="w-48 h-48 rounded-xl bg-surface-100 dark:bg-surface-800 overflow-hidden shadow-lg">
            <img
              v-if="track.imageUrl"
              :src="track.imageUrl"
              :alt="track.title"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <MusicalNoteIcon class="w-20 h-20 text-surface-400" />
            </div>
          </div>
        </div>

        <!-- Track info -->
        <div class="flex-1">
          <div class="flex items-start justify-between">
            <div>
              <Badge :variant="getStatusVariant(track.status)" class="mb-2">
                {{ track.status }}
              </Badge>
              <h1 class="text-3xl font-bold text-surface-900 dark:text-white">
                {{ track.title }}
              </h1>
              <p class="text-xl text-surface-500 mt-1">
                {{ track.artists?.join(', ') || 'Unknown Artist' }}
              </p>
              <p v-if="track.album" class="text-surface-400 mt-1">
                {{ track.album }} &bull; {{ track.releaseYear }}
              </p>
            </div>

            <div class="flex items-center gap-2">
              <Button variant="secondary" :icon="PencilIcon">
                Edit
              </Button>
              <Button :icon="SparklesIcon" :loading="enriching" @click="handleEnrichTrack">
                AI Enrich
              </Button>
            </div>
          </div>

          <!-- Quick stats -->
          <div class="flex items-center gap-6 mt-6">
            <div class="text-center">
              <ProgressRing
                :value="track.matchConfidence || 0"
                :size="64"
                :stroke-width="5"
                :color="(track.matchConfidence || 0) >= 80 ? 'success' : (track.matchConfidence || 0) >= 50 ? 'warning' : 'error'"
              />
              <p class="text-xs text-surface-500 mt-1">Match Score</p>
            </div>

            <div class="h-12 border-l border-surface-200 dark:border-surface-700" />

            <div>
              <p class="text-2xl font-bold text-surface-900 dark:text-white">
                {{ track.sources?.length || 0 }}
              </p>
              <p class="text-sm text-surface-500">Sources</p>
            </div>

            <div>
              <p class="text-2xl font-bold text-surface-900 dark:text-white">
                {{ track.plays ? formatNumber(track.plays) : '—' }}
              </p>
              <p class="text-sm text-surface-500">Total Plays</p>
            </div>

            <div>
              <p class="text-2xl font-bold text-surface-900 dark:text-white">
                {{ track.duration ? formatDuration(track.duration) : '—' }}
              </p>
              <p class="text-sm text-surface-500">Duration</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabbed content -->
      <TabGroup v-model="activeTab" :tabs="tabs">
        <!-- Metadata tab -->
        <template #metadata>
          <div class="grid lg:grid-cols-2 gap-6">
            <!-- Identifiers -->
            <Card title="Identifiers" divided>
              <div class="space-y-4">
                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">ISRC</span>
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-sm text-surface-900 dark:text-white bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded">
                      {{ track.isrc || '—' }}
                    </code>
                    <Button v-if="track.isrc" variant="ghost" size="sm" :icon="ClipboardIcon" @click="copyToClipboard(track.isrc)" />
                  </div>
                </div>

                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">ISWC</span>
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-sm text-surface-900 dark:text-white bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded">
                      {{ track.iswc || '—' }}
                    </code>
                    <Button v-if="track.iswc" variant="ghost" size="sm" :icon="ClipboardIcon" @click="copyToClipboard(track.iswc)" />
                  </div>
                </div>

                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">UPC/EAN</span>
                  <code class="font-mono text-sm text-surface-900 dark:text-white bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded">
                    {{ track.upc || '—' }}
                  </code>
                </div>

                <div class="flex items-center justify-between py-2">
                  <span class="text-sm text-surface-500">Internal ID</span>
                  <code class="font-mono text-sm text-surface-900 dark:text-white bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded">
                    {{ track.id }}
                  </code>
                </div>
              </div>
            </Card>

            <!-- Release Info -->
            <Card title="Release Information" divided>
              <div class="space-y-4">
                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">Album</span>
                  <span class="text-sm text-surface-900 dark:text-white">{{ track.album || '—' }}</span>
                </div>

                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">Label</span>
                  <span class="text-sm text-surface-900 dark:text-white">{{ track.label || '—' }}</span>
                </div>

                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">Release Date</span>
                  <span class="text-sm text-surface-900 dark:text-white">{{ track.releaseDate || '—' }}</span>
                </div>

                <div class="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800">
                  <span class="text-sm text-surface-500">Genre</span>
                  <span class="text-sm text-surface-900 dark:text-white">{{ track.genre || '—' }}</span>
                </div>

                <div class="flex items-center justify-between py-2">
                  <span class="text-sm text-surface-500">Explicit</span>
                  <Badge :variant="track.explicit ? 'warning' : 'neutral'">
                    {{ track.explicit ? 'Yes' : 'No' }}
                  </Badge>
                </div>
              </div>
            </Card>

            <!-- Credits -->
            <Card title="Credits & Contributors" divided class="lg:col-span-2">
              <div class="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 class="text-sm font-medium text-surface-500 mb-3">Artists</h4>
                  <div class="space-y-2">
                    <div
                      v-for="(artist, index) in track.artists"
                      :key="index"
                      class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800"
                    >
                      <Avatar :name="artist" size="sm" />
                      <div>
                        <p class="text-sm font-medium text-surface-900 dark:text-white">{{ artist }}</p>
                        <p class="text-xs text-surface-500">Primary Artist</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 class="text-sm font-medium text-surface-500 mb-3">Writers & Composers</h4>
                  <div class="space-y-2">
                    <div
                      v-for="writer in track.writers || []"
                      :key="writer.id"
                      class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800"
                    >
                      <Avatar :name="writer.name" size="sm" color="accent" />
                      <div class="flex-1">
                        <p class="text-sm font-medium text-surface-900 dark:text-white">{{ writer.name }}</p>
                        <p class="text-xs text-surface-500">{{ writer.role }}</p>
                      </div>
                      <span class="text-sm font-medium text-primary-600">{{ writer.share }}%</span>
                    </div>
                    <EmptyState
                      v-if="!track.writers?.length"
                      size="sm"
                      title="No writers found"
                      description="AI enrichment can discover writer credits"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </template>

        <!-- Sources tab -->
        <template #sources>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card
              v-for="source in track.sourceDetails"
              :key="source.platform"
              :class="['relative', source.matched && 'ring-2 ring-success-500/20']"
            >
              <div class="flex items-start gap-4">
                <div :class="['w-12 h-12 rounded-xl flex items-center justify-center', getSourceBgClass(source.platform)]">
                  <span class="text-lg font-bold">{{ source.platform.charAt(0).toUpperCase() }}</span>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-surface-900 dark:text-white capitalize">
                      {{ source.platform }}
                    </h4>
                    <Badge v-if="source.matched" variant="success" size="sm">Matched</Badge>
                  </div>

                  <p class="text-sm text-surface-500 mt-1 truncate">
                    {{ source.title }}
                  </p>

                  <div class="flex items-center gap-4 mt-3 text-xs text-surface-400">
                    <span v-if="source.plays">{{ formatNumber(source.plays) }} plays</span>
                    <span v-if="source.lastUpdated">Updated {{ source.lastUpdated }}</span>
                  </div>
                </div>

                <Button variant="ghost" size="sm" :icon="ArrowTopRightOnSquareIcon" @click="openExternalLink(source.url)" />
              </div>

              <!-- Confidence bar -->
              <div class="mt-4 pt-4 border-t border-surface-100 dark:border-surface-800">
                <div class="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span>Match Confidence</span>
                  <span>{{ source.confidence }}%</span>
                </div>
                <div class="h-1.5 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                  <div
                    :class="['h-full rounded-full', source.confidence >= 80 ? 'bg-success-500' : source.confidence >= 50 ? 'bg-warning-500' : 'bg-error-500']"
                    :style="{ width: `${source.confidence}%` }"
                  />
                </div>
              </div>
            </Card>
          </div>
        </template>

        <!-- History tab -->
        <template #history>
          <Card>
            <Timeline :items="trackHistory" />
          </Card>
        </template>
      </TabGroup>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeftIcon,
  MusicalNoteIcon,
  PencilIcon,
  SparklesIcon,
  ClipboardIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/vue/24/outline';
import type { TimelineItem } from '~/components/ui/Timeline.vue';
import { useMusicData, type Track } from '~/composables/useMusicData';

const route = useRoute();
const trackId = route.params.id as string;

const { fetchTrack, enrichTrack, loading, error } = useMusicData();

const activeTab = ref(0);
const enriching = ref(false);
const track = ref<Track | null>(null);

const tabs = computed(() => [
  { key: 'metadata', label: 'Metadata' },
  { key: 'sources', label: 'Sources', badge: track.value?.sources?.length || 0 },
  { key: 'history', label: 'History' },
]);

// History timeline (would come from API in production)
const trackHistory = ref<TimelineItem[]>([
  {
    id: '1',
    title: 'AI enrichment completed',
    subtitle: 'Added ISWC and writer credits',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'completed',
  },
  {
    id: '2',
    title: 'Matched with Apple Music',
    subtitle: 'Confidence: 95%',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    status: 'completed',
  },
  {
    id: '3',
    title: 'Matched with Spotify',
    subtitle: 'Confidence: 98%',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    status: 'completed',
  },
  {
    id: '4',
    title: 'Track imported',
    subtitle: 'Initial import from catalog',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'completed',
  },
]);

// Load track on mount
async function loadTrack() {
  try {
    track.value = await fetchTrack(trackId);
  } catch (e) {
    console.error('Failed to load track:', e);
  }
}

onMounted(() => {
  loadTrack();
});

function getStatusVariant(status: string): 'success' | 'warning' | 'error' | 'primary' | 'neutral' {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'primary' | 'neutral'> = {
    matched: 'success',
    pending: 'warning',
    unmatched: 'error',
    enriched: 'primary',
  };
  return variants[status] || 'neutral';
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getSourceBgClass(platform: string): string {
  const classes: Record<string, string> = {
    spotify: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    apple: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600',
    youtube: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    deezer: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  };
  return classes[platform] || 'bg-surface-100 dark:bg-surface-800 text-surface-600';
}

async function handleEnrichTrack() {
  if (!track.value) return;
  enriching.value = true;
  try {
    await enrichTrack(track.value.id);
    // Reload track to get updated data
    await loadTrack();
  } finally {
    enriching.value = false;
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function openExternalLink(url?: string) {
  if (url) {
    window.open(url, '_blank');
  }
}
</script>
