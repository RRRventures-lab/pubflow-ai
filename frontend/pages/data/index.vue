<template>
  <div class="space-y-8">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-4xl font-bold text-chrome">
          Music Data Hub
        </h1>
        <p class="text-zinc-500 mt-2">
          Aggregate, enrich, and manage music metadata from multiple sources
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="liquid" :icon="ArrowPathIcon" :loading="syncing" @click="handleSyncAll">
          Sync All
        </Button>
        <Button variant="chrome" :icon="PlusIcon" @click="showAddSource = true">
          Add Source
        </Button>
      </div>
    </div>

    <!-- Stats overview -->
    <MusicDataStats :stats="stats" />

    <!-- Browse Categories (Liquid Glass Style) -->
    <section>
      <h2 class="text-xl font-semibold text-white mb-4">Browse Categories</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div
          v-for="category in browseCategories"
          :key="category.id"
          :class="[
            'glass-card p-5 cursor-pointer group',
            'hover:-translate-y-1 hover:shadow-glass-hover',
            'transition-all duration-300 ease-fluid',
          ]"
          @click="handleCategoryClick(category)"
        >
          <div :class="['w-12 h-12 rounded-2xl flex items-center justify-center mb-3', category.iconBg]">
            <component :is="category.icon" class="w-6 h-6" :class="category.iconColor" />
          </div>
          <h3 class="text-base font-semibold text-white group-hover:text-zinc-100">{{ category.name }}</h3>
          <p class="text-sm text-zinc-500 mt-1">{{ category.count }} items</p>
        </div>
      </div>
    </section>

    <!-- Recently Searched (Liquid Glass Style) -->
    <section v-if="recentSearches.length > 0">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-white">Recently Searched</h2>
        <Button variant="ghost" size="sm" @click="clearRecentSearches">
          Clear All
        </Button>
      </div>
      <div class="scroll-section">
        <div
          v-for="item in recentSearches"
          :key="item.id"
          class="shrink-0 w-40 cursor-pointer group"
          @click="openTrackDetails(item)"
        >
          <div class="relative album-liquid-glow">
            <AlbumArt
              :src="item.imageUrl"
              :alt="item.title"
              size="lg"
              rounded="xl"
              playable
              @play="handlePlayTrack(item)"
            />
          </div>
          <p class="mt-3 text-sm font-medium text-white truncate group-hover:text-zinc-300 transition-colors">
            {{ item.title }}
          </p>
          <p class="text-xs text-zinc-500 truncate">
            {{ item.artists?.join(', ') || 'Unknown Artist' }}
          </p>
        </div>
      </div>
    </section>

    <!-- Tab navigation -->
    <TabGroup v-model="activeTab" :tabs="tabs">
      <!-- Sources tab -->
      <template #sources>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DataSourceCard
            v-for="source in dataSources"
            :key="source.id"
            :source="source"
            :icon="getSourceIcon(source.type)"
            @toggle="toggleSource"
            @sync="handleSyncSource"
            @connect="handleConnectSource"
            @configure="configureSource"
          />

          <!-- Add source placeholder -->
          <div
            class="glass-card flex items-center justify-center min-h-[200px] border-2 border-dashed border-white/20 cursor-pointer hover:border-white/40 transition-colors"
            @click="showAddSource = true"
          >
            <div class="text-center">
              <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 flex items-center justify-center">
                <PlusCircleIcon class="w-7 h-7 text-zinc-400" />
              </div>
              <p class="text-sm font-medium text-zinc-400">Add Data Source</p>
            </div>
          </div>
        </div>
      </template>

      <!-- Tracks tab -->
      <template #tracks>
        <Card variant="glass" padding="none">
          <DataTableVirtual
            :data="tracks"
            :columns="trackColumns"
            searchable
            search-placeholder="Search tracks by title, artist, ISRC..."
            :loading="loading"
            selectable
            @row-click="openTrackDetails"
            @search="handleSearchTracks"
          >
            <template #cell-title="{ row }">
              <div class="flex items-center gap-3">
                <AlbumArt
                  :src="row.imageUrl"
                  :alt="row.title"
                  size="xs"
                  rounded="md"
                />
                <div class="min-w-0">
                  <p class="font-medium text-white truncate">
                    {{ row.title }}
                  </p>
                  <p class="text-xs text-zinc-500 truncate">
                    {{ row.album || 'Single' }}
                  </p>
                </div>
              </div>
            </template>

            <template #cell-artists="{ value }">
              <span class="text-zinc-300">
                {{ value?.join(', ') || '-' }}
              </span>
            </template>

            <template #cell-sources="{ value }">
              <div class="flex items-center gap-1">
                <div
                  v-for="source in (value || []).slice(0, 3)"
                  :key="source"
                  :class="['w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center', getSourceClasses(source)]"
                  :title="source"
                >
                  {{ source.charAt(0).toUpperCase() }}
                </div>
                <span v-if="(value?.length || 0) > 3" class="text-xs text-zinc-500 ml-1">
                  +{{ value.length - 3 }}
                </span>
              </div>
            </template>

            <template #cell-matchConfidence="{ value }">
              <ProgressRing
                v-if="value !== undefined"
                :value="value"
                :size="36"
                :stroke-width="3"
                :color="value >= 80 ? 'success' : value >= 50 ? 'warning' : 'error'"
              />
              <span v-else class="text-zinc-600">-</span>
            </template>

            <template #cell-status="{ value }">
              <Badge :variant="getStatusVariant(value)" :glow="value === 'enriched'">
                {{ value }}
              </Badge>
            </template>

            <template #actions="{ row }">
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  :icon="EyeIcon"
                  @click.stop="openTrackDetails(row)"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  :icon="SparklesIcon"
                  @click.stop="handleEnrichTrack(row)"
                />
              </div>
            </template>

            <template #bulkActions="{ selected }">
              <Button variant="liquid" size="sm" @click="handleBulkEnrich(selected)">
                Enrich Selected
              </Button>
              <Button variant="liquid" size="sm" @click="handleBulkExport(selected)">
                Export
              </Button>
            </template>
          </DataTableVirtual>
        </Card>
      </template>

      <!-- Activity tab -->
      <template #activity>
        <div class="grid lg:grid-cols-3 gap-6">
          <!-- Activity timeline -->
          <Card variant="glass" title="Recent Activity" class="lg:col-span-2" divided>
            <Timeline :items="recentActivity" @action="handleActivityAction" />
          </Card>

          <!-- Sync status sidebar -->
          <div class="space-y-6">
            <Card variant="glass" title="Sync Status" divided>
              <div class="space-y-4">
                <div
                  v-for="source in connectedSources"
                  :key="source.id"
                  class="flex items-center justify-between"
                >
                  <div class="flex items-center gap-2">
                    <div
                      :class="[
                        'w-2 h-2 rounded-full',
                        source.syncInProgress ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
                      ]"
                    />
                    <span class="text-sm text-zinc-300">
                      {{ source.name }}
                    </span>
                  </div>
                  <span class="text-xs text-zinc-500">
                    {{ source.lastSyncStatus }}
                  </span>
                </div>
              </div>
            </Card>

            <Card variant="glass" title="Data Quality" divided>
              <div class="space-y-4">
                <div>
                  <div class="flex items-center justify-between text-sm mb-2">
                    <span class="text-zinc-400">Match Rate</span>
                    <span class="font-semibold text-white">{{ stats.matchRate || 0 }}%</span>
                  </div>
                  <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-slow shadow-[0_0_10px_rgba(16,185,129,0.3)]" :style="{ width: `${stats.matchRate || 0}%` }" />
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between text-sm mb-2">
                    <span class="text-zinc-400">Enrichment Coverage</span>
                    <span class="font-semibold text-white">{{ stats.enrichmentCoverage || 0 }}%</span>
                  </div>
                  <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-slow shadow-[0_0_10px_rgba(59,130,246,0.3)]" :style="{ width: `${stats.enrichmentCoverage || 0}%` }" />
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between text-sm mb-2">
                    <span class="text-zinc-400">ISRC Coverage</span>
                    <span class="font-semibold text-white">{{ stats.isrcCoverage || 0 }}%</span>
                  </div>
                  <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-slow shadow-[0_0_10px_rgba(168,85,247,0.3)]" :style="{ width: `${stats.isrcCoverage || 0}%` }" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </template>
    </TabGroup>

    <!-- Add source modal -->
    <Modal v-model="showAddSource" title="Add Data Source" size="lg">
      <div class="grid grid-cols-2 gap-4">
        <button
          v-for="sourceType in availableSourceTypes"
          :key="sourceType.id"
          class="glass-card p-5 text-left group hover:-translate-y-1 transition-all duration-300"
          @click="selectSourceType(sourceType)"
        >
          <div class="flex items-center gap-4">
            <div :class="['w-14 h-14 rounded-2xl flex items-center justify-center', sourceType.bgClass]">
              <component :is="sourceType.icon" class="w-7 h-7" :class="sourceType.iconClass" />
            </div>
            <div>
              <p class="font-semibold text-white group-hover:text-zinc-100 transition-colors">{{ sourceType.name }}</p>
              <p class="text-sm text-zinc-500 mt-0.5">{{ sourceType.description }}</p>
            </div>
          </div>
        </button>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import {
  ArrowPathIcon,
  PlusIcon,
  PlusCircleIcon,
  MusicalNoteIcon,
  EyeIcon,
  SparklesIcon,
  CloudIcon,
  UserGroupIcon,
  TagIcon,
  ClockIcon,
  ChartBarIcon,
  MusicalNoteIcon as MusicIcon,
} from '@heroicons/vue/24/outline';
import type { Column } from '~/components/ui/DataTableVirtual.vue';
import type { TimelineItem } from '~/components/ui/Timeline.vue';
import { useMusicData, type DataSource, type Track } from '~/composables/useMusicData';

// Use the composable for API integration
const {
  tracks,
  dataSources,
  activity,
  stats,
  loading,
  connectedSources,
  fetchTracks,
  fetchDataSources,
  fetchStats,
  fetchActivity,
  connectSource,
  disconnectSource,
  syncSource,
  syncAllSources,
  enrichTrack,
  bulkEnrichTracks,
  exportTracks,
} = useMusicData();

// Local state
const activeTab = ref(0);
const syncing = ref(false);
const showAddSource = ref(false);

// Browse categories (Liquid Glass style)
const browseCategories = [
  { id: 'all', name: 'All Tracks', count: stats.value.totalTracks || 0, icon: MusicIcon, iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' },
  { id: 'artists', name: 'Artists', count: stats.value.totalArtists || 0, icon: UserGroupIcon, iconBg: 'bg-purple-500/20', iconColor: 'text-purple-400' },
  { id: 'unmatched', name: 'Unmatched', count: 42, icon: TagIcon, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
  { id: 'pending', name: 'Pending', count: 18, icon: ClockIcon, iconBg: 'bg-cyan-500/20', iconColor: 'text-cyan-400' },
  { id: 'enriched', name: 'AI Enriched', count: stats.value.aiEnrichments || 0, icon: SparklesIcon, iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' },
  { id: 'analytics', name: 'Analytics', count: 0, icon: ChartBarIcon, iconBg: 'bg-pink-500/20', iconColor: 'text-pink-400' },
];

// Recent searches (would be persisted in localStorage in production)
const recentSearches = ref<Track[]>([]);

const tabs = computed(() => [
  { key: 'sources', label: 'Data Sources', badge: dataSources.value.length },
  { key: 'tracks', label: 'Tracks', badge: stats.value.totalTracks > 1000 ? `${(stats.value.totalTracks / 1000).toFixed(1)}K` : stats.value.totalTracks },
  { key: 'activity', label: 'Activity' },
]);

// Track columns
const trackColumns: Column[] = [
  { key: 'title', label: 'Track', width: 280, sortable: true, searchable: true },
  { key: 'artists', label: 'Artists', width: 200, sortable: true, searchable: true },
  { key: 'isrc', label: 'ISRC', width: 140, sortable: true, searchable: true },
  { key: 'sources', label: 'Sources', width: 120 },
  { key: 'matchConfidence', label: 'Match', width: 80, sortable: true },
  { key: 'status', label: 'Status', width: 100, sortable: true },
];

// Recent activity mapped from composable
const recentActivity = computed<TimelineItem[]>(() => {
  return activity.value.map(item => ({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    timestamp: new Date(item.timestamp),
    status: item.status,
    highlighted: item.highlighted,
    actions: item.type === 'matches_found' ? [{ label: 'Review', action: 'review-matches' }] : undefined,
  }));
});

// Available source types for adding
const availableSourceTypes = [
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Connect Spotify for Artists',
    icon: CloudIcon,
    bgClass: 'bg-emerald-500/20',
    iconClass: 'text-emerald-400',
  },
  {
    id: 'apple',
    name: 'Apple Music',
    description: 'Connect Apple Music for Artists',
    icon: CloudIcon,
    bgClass: 'bg-pink-500/20',
    iconClass: 'text-pink-400',
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    description: 'Connect YouTube Studio',
    icon: CloudIcon,
    bgClass: 'bg-red-500/20',
    iconClass: 'text-red-400',
  },
  {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    description: 'Open music encyclopedia',
    icon: CloudIcon,
    bgClass: 'bg-orange-500/20',
    iconClass: 'text-orange-400',
  },
];

// Fetch data on mount
onMounted(async () => {
  await Promise.all([
    fetchStats(),
    fetchDataSources(),
    fetchTracks(),
    fetchActivity(),
  ]);

  // Populate recent searches with first few tracks for demo
  if (tracks.value.length > 0) {
    recentSearches.value = tracks.value.slice(0, 6);
  }
});

// Methods
function getSourceIcon(type: string): Component {
  return CloudIcon;
}

function getSourceClasses(source: string): string {
  const classes: Record<string, string> = {
    spotify: 'bg-emerald-500/20 text-emerald-400',
    apple: 'bg-pink-500/20 text-pink-400',
    youtube: 'bg-red-500/20 text-red-400',
    deezer: 'bg-purple-500/20 text-purple-400',
  };
  return classes[source.toLowerCase()] || 'bg-white/10 text-zinc-400';
}

function getStatusVariant(status: string): 'success' | 'warning' | 'error' | 'primary' | 'neutral' {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'primary' | 'neutral'> = {
    matched: 'success',
    pending: 'warning',
    unmatched: 'error',
    enriched: 'primary',
  };
  return variants[status] || 'neutral';
}

async function handleSyncAll() {
  syncing.value = true;
  try {
    await syncAllSources();
  } finally {
    syncing.value = false;
  }
}

async function toggleSource(source: DataSource) {
  if (source.connected) {
    await disconnectSource(source.id);
  } else {
    await connectSource(source.id);
  }
}

async function handleSyncSource(source: DataSource) {
  await syncSource(source.id);
}

async function handleConnectSource(source: DataSource) {
  await connectSource(source.id);
}

function configureSource(source: DataSource) {
  console.log('Configuring source:', source.name);
}

function openTrackDetails(track: Track) {
  // Add to recent searches
  if (!recentSearches.value.find(t => t.id === track.id)) {
    recentSearches.value = [track, ...recentSearches.value.slice(0, 5)];
  }
  navigateTo(`/data/tracks/${track.id}`);
}

async function handleSearchTracks(query: string) {
  await fetchTracks({ query });
}

async function handleEnrichTrack(track: Track) {
  await enrichTrack(track.id);
}

async function handleBulkEnrich(selected: Track[]) {
  const trackIds = selected.map(t => t.id);
  await bulkEnrichTracks(trackIds);
}

async function handleBulkExport(selected: Track[]) {
  const trackIds = selected.map(t => t.id);
  await exportTracks(trackIds);
}

function handleActivityAction(payload: { action: string; item: TimelineItem }) {
  console.log('Activity action:', payload.action);
}

function selectSourceType(sourceType: any) {
  showAddSource.value = false;
  console.log('Selected source type:', sourceType.name);
}

function handleCategoryClick(category: any) {
  console.log('Category clicked:', category.name);
  // Navigate to filtered view based on category
}

function handlePlayTrack(track: Track) {
  console.log('Play track:', track.title);
}

function clearRecentSearches() {
  recentSearches.value = [];
}
</script>
