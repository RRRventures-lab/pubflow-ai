<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">AI Intelligence</h1>
        <p class="text-surface-500 mt-1">
          Monitor and manage AI-powered enrichment, matching, and conflict detection
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="secondary" :icon="ArrowPathIcon" :loading="refreshing" @click="refreshStats">
          Refresh
        </Button>
        <Button variant="primary" :icon="SparklesIcon" @click="showBulkProcess = true">
          Bulk Process
        </Button>
      </div>
    </div>

    <!-- Stats cards -->
    <div class="grid grid-cols-4 gap-4">
      <Card>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
            <DocumentMagnifyingGlassIcon class="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p class="text-sm text-surface-500">Enrichment Proposals</p>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">
              {{ stats.enrichmentsPending }}
            </p>
            <p class="text-xs text-surface-400">{{ stats.enrichmentsApproved }} approved</p>
          </div>
        </div>
      </Card>

      <Card>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-warning-100 dark:bg-warning-900/30 rounded-xl">
            <ExclamationTriangleIcon class="w-6 h-6 text-warning-600 dark:text-warning-400" />
          </div>
          <div>
            <p class="text-sm text-surface-500">Active Conflicts</p>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">
              {{ stats.conflictsOpen }}
            </p>
            <p class="text-xs text-surface-400">{{ stats.conflictsCritical }} critical</p>
          </div>
        </div>
      </Card>

      <Card>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-success-100 dark:bg-success-900/30 rounded-xl">
            <CheckCircleIcon class="w-6 h-6 text-success-600 dark:text-success-400" />
          </div>
          <div>
            <p class="text-sm text-surface-500">Auto-Matched</p>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">
              {{ stats.matchesAuto }}
            </p>
            <p class="text-xs text-surface-400">{{ stats.matchAccuracy }}% accuracy</p>
          </div>
        </div>
      </Card>

      <Card>
        <div class="flex items-center gap-4">
          <div class="p-3 bg-secondary-100 dark:bg-secondary-900/30 rounded-xl">
            <CubeTransparentIcon class="w-6 h-6 text-secondary-600 dark:text-secondary-400" />
          </div>
          <div>
            <p class="text-sm text-surface-500">Works Embedded</p>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">
              {{ stats.worksEmbedded }}
            </p>
            <p class="text-xs text-surface-400">of {{ stats.totalWorks }} total</p>
          </div>
        </div>
      </Card>
    </div>

    <!-- Main content grid -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Recent enrichments -->
      <Card>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-surface-900 dark:text-white">Recent Enrichments</h2>
            <NuxtLink to="/ai/enrichment">
              <Button variant="ghost" size="sm">View All</Button>
            </NuxtLink>
          </div>
        </template>

        <div class="space-y-3">
          <div
            v-for="enrichment in recentEnrichments"
            :key="enrichment.id"
            class="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg"
          >
            <div class="flex-1 min-w-0">
              <p class="font-medium text-surface-900 dark:text-white truncate">
                {{ enrichment.workTitle }}
              </p>
              <div class="flex items-center gap-2 mt-1">
                <Badge size="sm" variant="secondary">{{ enrichment.fieldName }}</Badge>
                <span class="text-xs text-surface-500">from {{ enrichment.source }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <ConfidenceIndicator :value="enrichment.confidence" />
              <Badge :variant="getEnrichmentVariant(enrichment.status)" size="sm">
                {{ enrichment.status }}
              </Badge>
            </div>
          </div>

          <div v-if="recentEnrichments.length === 0" class="text-center py-8 text-surface-500">
            No recent enrichments
          </div>
        </div>
      </Card>

      <!-- Recent conflicts -->
      <Card>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-surface-900 dark:text-white">Active Conflicts</h2>
            <NuxtLink to="/ai/conflicts">
              <Button variant="ghost" size="sm">View All</Button>
            </NuxtLink>
          </div>
        </template>

        <div class="space-y-3">
          <div
            v-for="conflict in recentConflicts"
            :key="conflict.id"
            class="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg"
          >
            <div class="flex-1 min-w-0">
              <p class="font-medium text-surface-900 dark:text-white truncate">
                {{ conflict.workTitle }}
              </p>
              <p class="text-sm text-surface-500 truncate mt-1">
                {{ conflict.description }}
              </p>
            </div>
            <Badge :variant="getSeverityVariant(conflict.severity)" size="sm">
              {{ conflict.severity }}
            </Badge>
          </div>

          <div v-if="recentConflicts.length === 0" class="text-center py-8 text-surface-500">
            No active conflicts
          </div>
        </div>
      </Card>
    </div>

    <!-- AI Activity Timeline -->
    <Card>
      <template #header>
        <h2 class="font-semibold text-surface-900 dark:text-white">Recent AI Activity</h2>
      </template>

      <div class="relative">
        <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-800" />

        <div class="space-y-6">
          <div
            v-for="activity in recentActivity"
            :key="activity.id"
            class="relative flex gap-4 pl-10"
          >
            <div
              :class="[
                'absolute left-2 w-4 h-4 rounded-full border-2 bg-white dark:bg-surface-900',
                getActivityColor(activity.type),
              ]"
            />
            <div class="flex-1 pb-6">
              <div class="flex items-center gap-2">
                <span class="font-medium text-surface-900 dark:text-white">
                  {{ activity.title }}
                </span>
                <Badge :variant="getActivityVariant(activity.type)" size="sm">
                  {{ activity.type }}
                </Badge>
              </div>
              <p class="text-sm text-surface-500 mt-1">{{ activity.description }}</p>
              <p class="text-xs text-surface-400 mt-1">{{ formatTimeAgo(activity.createdAt) }}</p>
            </div>
          </div>

          <div v-if="recentActivity.length === 0" class="text-center py-8 text-surface-500">
            No recent activity
          </div>
        </div>
      </div>
    </Card>

    <!-- Bulk Process Modal -->
    <Modal v-model="showBulkProcess" title="Bulk AI Processing" size="md">
      <div class="space-y-4">
        <p class="text-surface-600 dark:text-surface-400">
          Run AI processing on multiple works at once. Select the operations to perform:
        </p>

        <div class="space-y-3">
          <label class="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg cursor-pointer">
            <input v-model="bulkOperations" type="checkbox" value="enrich" class="w-4 h-4 rounded" />
            <div>
              <p class="font-medium text-surface-900 dark:text-white">Enrichment</p>
              <p class="text-sm text-surface-500">Find missing metadata from MusicBrainz & Discogs</p>
            </div>
          </label>

          <label class="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg cursor-pointer">
            <input v-model="bulkOperations" type="checkbox" value="conflicts" class="w-4 h-4 rounded" />
            <div>
              <p class="font-medium text-surface-900 dark:text-white">Conflict Detection</p>
              <p class="text-sm text-surface-500">Check for share issues, duplicates, and errors</p>
            </div>
          </label>
        </div>

        <div class="flex items-center gap-2 text-sm text-surface-500">
          <InformationCircleIcon class="w-4 h-4" />
          <span>This will process all {{ stats.totalWorks }} works in your catalog.</span>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="secondary" @click="showBulkProcess = false">Cancel</Button>
          <Button
            variant="primary"
            :icon="SparklesIcon"
            :loading="processing"
            :disabled="bulkOperations.length === 0"
            @click="runBulkProcess"
          >
            Start Processing
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowPathIcon,
  SparklesIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CubeTransparentIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';

const { $api } = useNuxtApp();

const refreshing = ref(false);
const processing = ref(false);
const showBulkProcess = ref(false);
const bulkOperations = ref<string[]>(['conflicts']);

const stats = ref({
  enrichmentsPending: 0,
  enrichmentsApproved: 0,
  conflictsOpen: 0,
  conflictsCritical: 0,
  matchesAuto: 0,
  matchAccuracy: 0,
  worksEmbedded: 0,
  totalWorks: 0,
});

const recentEnrichments = ref<any[]>([]);
const recentConflicts = ref<any[]>([]);
const recentActivity = ref<any[]>([]);

async function fetchStats() {
  try {
    const response = await $api('/ai/stats');
    stats.value = response.data;
  } catch (e) {
    console.error('Failed to fetch AI stats:', e);
  }
}

async function fetchRecentEnrichments() {
  try {
    const response = await $api('/ai/enrichments', {
      params: { limit: 5 },
    });
    recentEnrichments.value = response.data;
  } catch (e) {
    console.error('Failed to fetch enrichments:', e);
  }
}

async function fetchRecentConflicts() {
  try {
    const response = await $api('/ai/conflicts', {
      params: { status: 'OPEN', limit: 5 },
    });
    recentConflicts.value = response.data;
  } catch (e) {
    console.error('Failed to fetch conflicts:', e);
  }
}

async function fetchRecentActivity() {
  try {
    const response = await $api('/ai/audit', {
      params: { limit: 10 },
    });
    recentActivity.value = response.data.map((item: any) => ({
      id: item.id,
      type: item.action,
      title: formatActivityTitle(item),
      description: formatActivityDescription(item),
      createdAt: item.created_at,
    }));
  } catch (e) {
    console.error('Failed to fetch activity:', e);
  }
}

async function refreshStats() {
  refreshing.value = true;
  await Promise.all([
    fetchStats(),
    fetchRecentEnrichments(),
    fetchRecentConflicts(),
    fetchRecentActivity(),
  ]);
  refreshing.value = false;
}

async function runBulkProcess() {
  processing.value = true;
  try {
    // Get all work IDs (simplified - in production use pagination)
    const worksResponse = await $api('/works', { params: { limit: 100 } });
    const workIds = worksResponse.data.map((w: any) => w.id);

    await $api('/ai/batch', {
      method: 'POST',
      body: {
        workIds,
        operations: bulkOperations.value,
      },
    });

    showBulkProcess.value = false;
    await refreshStats();
  } catch (e) {
    console.error('Bulk process failed:', e);
  } finally {
    processing.value = false;
  }
}

function getEnrichmentVariant(status: string) {
  const variants: Record<string, any> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
  };
  return variants[status] || 'neutral';
}

function getSeverityVariant(severity: string) {
  const variants: Record<string, any> = {
    CRITICAL: 'error',
    HIGH: 'warning',
    MEDIUM: 'neutral',
    LOW: 'secondary',
  };
  return variants[severity] || 'neutral';
}

function getActivityColor(type: string) {
  const colors: Record<string, string> = {
    ENRICHMENT_APPROVED: 'border-success-500',
    ENRICHMENT_REJECTED: 'border-error-500',
    MATCH_CONFIRMED: 'border-primary-500',
    MATCH_REJECTED: 'border-error-500',
    CONFLICT_RESOLVED: 'border-success-500',
  };
  return colors[type] || 'border-surface-400';
}

function getActivityVariant(type: string) {
  const variants: Record<string, any> = {
    ENRICHMENT_APPROVED: 'success',
    ENRICHMENT_REJECTED: 'error',
    MATCH_CONFIRMED: 'primary',
    MATCH_REJECTED: 'error',
    CONFLICT_RESOLVED: 'success',
  };
  return variants[type] || 'neutral';
}

function formatActivityTitle(item: any): string {
  const titles: Record<string, string> = {
    ENRICHMENT_APPROVED: 'Enrichment Approved',
    ENRICHMENT_REJECTED: 'Enrichment Rejected',
    MATCH_CONFIRMED: 'Match Confirmed',
    MATCH_REJECTED: 'Match Rejected',
    CONFLICT_RESOLVED: 'Conflict Resolved',
  };
  return titles[item.action] || item.action;
}

function formatActivityDescription(item: any): string {
  const details = item.details || {};
  return `Entity: ${item.entity_type} - ${item.entity_id?.slice(0, 8)}...`;
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

onMounted(() => {
  refreshStats();
});
</script>
