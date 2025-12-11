/**
 * Music Data Hub Composable
 * Provides reactive state management and API integration for music data features
 */

import type { Ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

// Types
export interface Track {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  imageUrl?: string;
  duration?: number;
  releaseDate?: string;
  releaseYear?: number;
  status: 'matched' | 'pending' | 'unmatched' | 'enriched';
  sources: string[];
  matchConfidence?: number;
  isrc?: string;
  iswc?: string;
  upc?: string;
  label?: string;
  genre?: string;
  explicit?: boolean;
  plays?: number;
  writers?: Writer[];
  sourceDetails?: SourceDetail[];
}

export interface Writer {
  id: string;
  name: string;
  role: string;
  share: number;
  ipi?: string;
}

export interface SourceDetail {
  platform: string;
  title: string;
  matched: boolean;
  confidence: number;
  plays?: number;
  lastUpdated?: string;
  url?: string;
  externalId?: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  tracksIndexed?: number;
  artistsIndexed?: number;
  lastSyncStatus?: string;
  lastSyncTime?: Date;
  syncInProgress?: boolean;
  syncProgress?: number;
  lastError?: string;
  color?: string;
  apiKey?: string;
}

export interface MusicDataStats {
  totalTracks: number;
  tracksTrend?: number;
  tracksHistory?: number[];
  totalArtists: number;
  artistsTrend?: number;
  activeSources: number;
  syncProgress?: number;
  aiEnrichments: number;
  enrichmentTrend?: number;
  matchRate?: number;
  enrichmentCoverage?: number;
  isrcCoverage?: number;
}

export interface SearchFilters {
  query?: string;
  status?: Track['status'][];
  sources?: string[];
  hasIsrc?: boolean;
  minConfidence?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface Activity {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  timestamp: Date;
  status: 'completed' | 'current' | 'pending';
  highlighted?: boolean;
}

// State (shared across component instances)
const tracks: Ref<Track[]> = ref([]);
const dataSources: Ref<DataSource[]> = ref([]);
const activity: Ref<Activity[]> = ref([]);
const stats: Ref<MusicDataStats> = ref({
  totalTracks: 0,
  totalArtists: 0,
  activeSources: 0,
  aiEnrichments: 0,
});
const loading = ref(false);
const error: Ref<string | null> = ref(null);

// Composable
export function useMusicData() {
  const config = useRuntimeConfig();
  const authStore = useAuthStore();
  const apiBase = config.public.apiBase || 'http://localhost:3001/api/v1';

  // Helper to get auth headers
  function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (authStore.token) {
      headers['Authorization'] = `Bearer ${authStore.token}`;
    }
    return headers;
  }

  // Helper for authenticated fetch using Nuxt's $fetch
  async function apiFetch<T>(
    endpoint: string,
    options: Parameters<typeof $fetch>[1] = {}
  ): Promise<T> {
    return $fetch<T>(`${apiBase}${endpoint}`, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    });
  }

  // Fetch all tracks with optional filters
  async function fetchTracks(filters?: SearchFilters) {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (filters?.query) params.append('q', filters.query);
      if (filters?.status?.length) params.append('status', filters.status.join(','));
      if (filters?.sources?.length) params.append('sources', filters.sources.join(','));
      if (filters?.hasIsrc !== undefined) params.append('hasIsrc', String(filters.hasIsrc));
      if (filters?.minConfidence) params.append('minConfidence', String(filters.minConfidence));

      const queryString = params.toString();
      const endpoint = `/music-data/tracks${queryString ? `?${queryString}` : ''}`;

      const data = await apiFetch<{ tracks: Track[]; total: number }>(endpoint);
      tracks.value = data.tracks;
      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Fetch single track by ID
  async function fetchTrack(id: string): Promise<Track> {
    loading.value = true;
    error.value = null;

    try {
      const track = await apiFetch<Track>(`/music-data/tracks/${id}`);
      return track;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Fetch data sources
  async function fetchDataSources() {
    loading.value = true;
    error.value = null;

    try {
      const data = await apiFetch<{ sources: DataSource[] }>('/music-data/sources');
      dataSources.value = data.sources;
      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Fetch stats
  async function fetchStats() {
    try {
      const data = await apiFetch<MusicDataStats>('/music-data/stats');
      stats.value = data;
      return data;
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }

  // Fetch activity log
  async function fetchActivity() {
    try {
      const data = await apiFetch<{ activity: Activity[] }>('/music-data/activity');
      activity.value = data.activity;
      return data;
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }

  // Connect a data source
  async function connectSource(sourceId: string, credentials?: Record<string, string>) {
    loading.value = true;
    error.value = null;

    try {
      const data = await apiFetch<{ success: boolean; source: Partial<DataSource> }>(
        `/music-data/sources/${sourceId}/connect`,
        {
          method: 'POST',
          body: credentials,
        }
      );

      // Update local state
      const idx = dataSources.value.findIndex((s) => s.id === sourceId);
      if (idx !== -1) {
        dataSources.value[idx] = { ...dataSources.value[idx], ...data.source, connected: true };
      }

      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Disconnect a data source
  async function disconnectSource(sourceId: string) {
    loading.value = true;
    error.value = null;

    try {
      await apiFetch(`/music-data/sources/${sourceId}/disconnect`, {
        method: 'POST',
      });

      // Update local state
      const idx = dataSources.value.findIndex((s) => s.id === sourceId);
      if (idx !== -1) {
        dataSources.value[idx].connected = false;
      }

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Sync a data source
  async function syncSource(sourceId: string) {
    const idx = dataSources.value.findIndex((s) => s.id === sourceId);
    if (idx !== -1) {
      dataSources.value[idx].syncInProgress = true;
      dataSources.value[idx].syncProgress = 0;
    }

    try {
      const data = await apiFetch<{ success: boolean; jobId: string }>(
        `/music-data/sources/${sourceId}/sync`,
        { method: 'POST' }
      );

      // The actual sync happens in the background
      // We'll poll for updates or use WebSocket
      return data;
    } catch (err) {
      if (idx !== -1) {
        dataSources.value[idx].syncInProgress = false;
        dataSources.value[idx].lastError = err instanceof Error ? err.message : 'Sync failed';
      }
      throw err;
    }
  }

  // Sync all connected sources
  async function syncAllSources() {
    const connectedSources = dataSources.value.filter((s) => s.connected);
    await Promise.all(connectedSources.map((s) => syncSource(s.id)));
  }

  // Enrich a track with AI
  async function enrichTrack(trackId: string) {
    loading.value = true;
    error.value = null;

    try {
      const data = await apiFetch<{ success: boolean; track: Partial<Track> }>(
        `/music-data/tracks/${trackId}/enrich`,
        { method: 'POST' }
      );

      // Update local state
      const idx = tracks.value.findIndex((t) => t.id === trackId);
      if (idx !== -1) {
        tracks.value[idx] = { ...tracks.value[idx], ...data.track, status: 'enriched' };
      }

      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Bulk enrich tracks
  async function bulkEnrichTracks(trackIds: string[]) {
    loading.value = true;
    error.value = null;

    try {
      const data = await apiFetch<{ success: boolean; jobId: string; tracksQueued: number }>(
        '/music-data/tracks/bulk-enrich',
        {
          method: 'POST',
          body: { trackIds },
        }
      );

      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Export tracks
  async function exportTracks(trackIds: string[], format: 'csv' | 'json' | 'xlsx' = 'csv') {
    try {
      const response = await fetch(`${apiBase}/music-data/tracks/export`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ trackIds, format }),
      });

      if (!response.ok) throw new Error('Failed to export tracks');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tracks-export-${Date.now()}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    }
  }

  // Search tracks (local filter)
  function searchTracks(query: string) {
    return tracks.value.filter((track) => {
      const searchLower = query.toLowerCase();
      return (
        track.title.toLowerCase().includes(searchLower) ||
        track.artists.some((a) => a.toLowerCase().includes(searchLower)) ||
        track.isrc?.toLowerCase().includes(searchLower) ||
        track.album?.toLowerCase().includes(searchLower)
      );
    });
  }

  // Get track by ID from local state
  function getTrackById(id: string): Track | undefined {
    return tracks.value.find((t) => t.id === id);
  }

  // Get connected sources
  const connectedSources = computed(() => dataSources.value.filter((s) => s.connected));

  // Get sources currently syncing
  const syncingSources = computed(() => dataSources.value.filter((s) => s.syncInProgress));

  // Overall sync progress
  const overallSyncProgress = computed(() => {
    const syncing = syncingSources.value;
    if (syncing.length === 0) return 100;
    const total = syncing.reduce((acc, s) => acc + (s.syncProgress || 0), 0);
    return Math.round(total / syncing.length);
  });

  return {
    // State
    tracks,
    dataSources,
    activity,
    stats,
    loading,
    error,

    // Computed
    connectedSources,
    syncingSources,
    overallSyncProgress,

    // Methods
    fetchTracks,
    fetchTrack,
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
    searchTracks,
    getTrackById,
  };
}
