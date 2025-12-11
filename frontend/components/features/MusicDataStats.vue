<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <MetricCard
      label="Total Tracks"
      :value="stats.totalTracks"
      :icon="MusicalNoteIcon"
      color="primary"
      :trend="stats.tracksTrend"
      comparison="vs last month"
      :sparkline-data="stats.tracksHistory"
    />

    <MetricCard
      label="Artists Tracked"
      :value="stats.totalArtists"
      :icon="UserGroupIcon"
      color="accent"
      :trend="stats.artistsTrend"
      comparison="vs last month"
    />

    <MetricCard
      label="Data Sources"
      :value="stats.activeSources"
      unit="active"
      :icon="CloudArrowDownIcon"
      color="success"
      :progress="stats.syncProgress"
    />

    <MetricCard
      label="AI Enrichments"
      :value="stats.aiEnrichments"
      :icon="SparklesIcon"
      color="warning"
      :trend="stats.enrichmentTrend"
      comparison="this week"
    />
  </div>
</template>

<script setup lang="ts">
import {
  MusicalNoteIcon,
  UserGroupIcon,
  CloudArrowDownIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline';

interface Props {
  stats: {
    totalTracks: number;
    tracksTrend?: number;
    tracksHistory?: number[];
    totalArtists: number;
    artistsTrend?: number;
    activeSources: number;
    syncProgress?: number;
    aiEnrichments: number;
    enrichmentTrend?: number;
  };
}

withDefaults(defineProps<Props>(), {
  stats: () => ({
    totalTracks: 0,
    totalArtists: 0,
    activeSources: 0,
    aiEnrichments: 0,
  }),
});
</script>
