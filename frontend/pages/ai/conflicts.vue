<template>
  <div class="h-[calc(100vh-8rem)] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">Conflict Detection</h1>
        <p class="text-surface-500 mt-1">
          Review and resolve AI-detected conflicts in your catalog
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Badge v-if="criticalCount > 0" variant="error">
          {{ criticalCount }} critical
        </Badge>
        <Badge v-if="openCount > 0" variant="warning">
          {{ openCount }} open
        </Badge>
        <Button variant="secondary" :icon="AdjustmentsHorizontalIcon" @click="showFilters = !showFilters">
          Filters
        </Button>
        <Button variant="primary" :icon="ShieldCheckIcon" @click="runBulkCheck">
          Run Bulk Check
        </Button>
      </div>
    </div>

    <!-- Severity summary -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <button
        :class="[
          'p-4 rounded-lg border-2 transition-all text-left',
          severityFilter === 'CRITICAL'
            ? 'border-error-500 bg-error-50 dark:bg-error-900/20'
            : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
        ]"
        @click="severityFilter = severityFilter === 'CRITICAL' ? '' : 'CRITICAL'"
      >
        <div class="flex items-center gap-3">
          <ExclamationCircleIcon class="w-8 h-8 text-error-500" />
          <div>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">{{ criticalCount }}</p>
            <p class="text-sm text-surface-500">Critical</p>
          </div>
        </div>
      </button>

      <button
        :class="[
          'p-4 rounded-lg border-2 transition-all text-left',
          severityFilter === 'HIGH'
            ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/20'
            : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
        ]"
        @click="severityFilter = severityFilter === 'HIGH' ? '' : 'HIGH'"
      >
        <div class="flex items-center gap-3">
          <ExclamationTriangleIcon class="w-8 h-8 text-warning-500" />
          <div>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">{{ highCount }}</p>
            <p class="text-sm text-surface-500">High</p>
          </div>
        </div>
      </button>

      <button
        :class="[
          'p-4 rounded-lg border-2 transition-all text-left',
          severityFilter === 'MEDIUM'
            ? 'border-surface-500 bg-surface-50 dark:bg-surface-800'
            : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
        ]"
        @click="severityFilter = severityFilter === 'MEDIUM' ? '' : 'MEDIUM'"
      >
        <div class="flex items-center gap-3">
          <InformationCircleIcon class="w-8 h-8 text-surface-500" />
          <div>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">{{ mediumCount }}</p>
            <p class="text-sm text-surface-500">Medium</p>
          </div>
        </div>
      </button>

      <button
        :class="[
          'p-4 rounded-lg border-2 transition-all text-left',
          severityFilter === 'LOW'
            ? 'border-surface-400 bg-surface-50 dark:bg-surface-800'
            : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
        ]"
        @click="severityFilter = severityFilter === 'LOW' ? '' : 'LOW'"
      >
        <div class="flex items-center gap-3">
          <QuestionMarkCircleIcon class="w-8 h-8 text-surface-400" />
          <div>
            <p class="text-2xl font-bold text-surface-900 dark:text-white">{{ lowCount }}</p>
            <p class="text-sm text-surface-500">Low</p>
          </div>
        </div>
      </button>
    </div>

    <!-- Filter bar -->
    <div v-if="showFilters" class="mb-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <Input
            v-model="searchQuery"
            placeholder="Search by work title or description..."
            :leading-icon="MagnifyingGlassIcon"
          />
        </div>
        <div class="w-48">
          <select
            v-model="statusFilter"
            class="w-full px-3 py-2 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700 rounded-lg"
          >
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
        <div class="w-48">
          <select
            v-model="typeFilter"
            class="w-full px-3 py-2 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700 rounded-lg"
          >
            <option value="">All Types</option>
            <option value="share_total_invalid">Invalid Share Total</option>
            <option value="duplicate_iswc">Duplicate ISWC</option>
            <option value="duplicate_work">Duplicate Work</option>
            <option value="writer_conflict">Writer Conflict</option>
            <option value="territory_overlap">Territory Overlap</option>
            <option value="missing_controlled">Missing Controlled Party</option>
            <option value="ipi_mismatch">IPI Mismatch</option>
          </select>
        </div>
        <Button variant="ghost" size="sm" @click="clearFilters">Clear</Button>
      </div>
    </div>

    <!-- Main content -->
    <Card class="flex-1 flex flex-col" padding="none">
      <!-- Conflicts list -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="conflict in filteredConflicts"
          :key="conflict.id"
          class="p-4 border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/30"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4">
              <!-- Severity icon -->
              <div
                :class="[
                  'p-2 rounded-lg',
                  getSeverityBg(conflict.severity),
                ]"
              >
                <component
                  :is="getSeverityIcon(conflict.severity)"
                  :class="['w-5 h-5', getSeverityColor(conflict.severity)]"
                />
              </div>

              <!-- Content -->
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <NuxtLink :to="`/catalog/works/${conflict.workId}`" class="hover:underline">
                    <p class="font-medium text-surface-900 dark:text-white">
                      {{ conflict.workTitle }}
                    </p>
                  </NuxtLink>
                  <Badge :variant="getTypeVariant(conflict.conflictType)" size="sm">
                    {{ formatConflictType(conflict.conflictType) }}
                  </Badge>
                </div>
                <p class="text-sm text-surface-600 dark:text-surface-400 mt-1">
                  {{ conflict.description }}
                </p>

                <!-- Details accordion -->
                <details v-if="conflict.details" class="mt-2">
                  <summary class="text-xs text-primary-600 dark:text-primary-400 cursor-pointer">
                    View details
                  </summary>
                  <pre class="mt-2 p-2 bg-surface-100 dark:bg-surface-800 rounded text-xs overflow-x-auto">{{ JSON.stringify(conflict.details, null, 2) }}</pre>
                </details>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <Badge :variant="conflict.status === 'OPEN' ? 'warning' : 'success'" size="sm">
                {{ conflict.status }}
              </Badge>
              <Button
                v-if="conflict.status === 'OPEN'"
                variant="secondary"
                size="sm"
                :icon="WrenchScrewdriverIcon"
                @click="openResolveModal(conflict)"
              >
                Resolve
              </Button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredConflicts.length === 0" class="flex items-center justify-center py-16">
          <div class="text-center">
            <ShieldCheckIcon class="w-12 h-12 mx-auto text-success-500 mb-4" />
            <p class="text-surface-900 dark:text-white font-medium">No conflicts found</p>
            <p class="text-sm text-surface-400 mt-1">
              Your catalog looks clean!
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
        <div class="flex items-center justify-between text-sm text-surface-500">
          <span>Showing {{ filteredConflicts.length }} of {{ conflicts.length }} conflicts</span>
          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 bg-warning-500 rounded-full" />
              {{ openCount }} open
            </span>
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 bg-success-500 rounded-full" />
              {{ resolvedCount }} resolved
            </span>
          </div>
        </div>
      </div>
    </Card>

    <!-- Resolve Modal -->
    <Modal v-model="showResolve" :title="`Resolve: ${selectedConflict?.workTitle}`" size="md">
      <div v-if="selectedConflict" class="space-y-4">
        <div class="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
          <div class="flex items-center gap-2 mb-2">
            <Badge :variant="getTypeVariant(selectedConflict.conflictType)">
              {{ formatConflictType(selectedConflict.conflictType) }}
            </Badge>
            <Badge :variant="getSeverityVariant(selectedConflict.severity)">
              {{ selectedConflict.severity }}
            </Badge>
          </div>
          <p class="text-surface-700 dark:text-surface-300">
            {{ selectedConflict.description }}
          </p>
        </div>

        <div>
          <p class="text-sm font-medium text-surface-500 mb-2">Resolution Type</p>
          <div class="space-y-2">
            <label class="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg cursor-pointer">
              <input v-model="resolution" type="radio" value="FIXED" class="w-4 h-4" />
              <div>
                <p class="font-medium text-surface-900 dark:text-white">Fixed</p>
                <p class="text-sm text-surface-500">The underlying issue has been corrected</p>
              </div>
            </label>

            <label class="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg cursor-pointer">
              <input v-model="resolution" type="radio" value="ACCEPTED" class="w-4 h-4" />
              <div>
                <p class="font-medium text-surface-900 dark:text-white">Accepted</p>
                <p class="text-sm text-surface-500">The conflict is acknowledged but intentional</p>
              </div>
            </label>

            <label class="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg cursor-pointer">
              <input v-model="resolution" type="radio" value="FALSE_POSITIVE" class="w-4 h-4" />
              <div>
                <p class="font-medium text-surface-900 dark:text-white">False Positive</p>
                <p class="text-sm text-surface-500">The AI detection was incorrect</p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium text-surface-500 mb-2">Notes (optional)</p>
          <textarea
            v-model="resolutionNotes"
            rows="3"
            class="w-full px-3 py-2 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700 rounded-lg"
            placeholder="Add any notes about the resolution..."
          />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="secondary" @click="showResolve = false">Cancel</Button>
          <Button
            variant="success"
            :icon="CheckIcon"
            :disabled="!resolution"
            @click="resolveConflict"
          >
            Mark Resolved
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  CheckIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline';

const { $api } = useNuxtApp();

const conflicts = ref<any[]>([]);
const showFilters = ref(false);
const showResolve = ref(false);
const selectedConflict = ref<any>(null);
const resolution = ref('');
const resolutionNotes = ref('');

// Filters
const searchQuery = ref('');
const statusFilter = ref('');
const severityFilter = ref('');
const typeFilter = ref('');

const filteredConflicts = computed(() => {
  let result = conflicts.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (c) =>
        c.workTitle?.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
    );
  }

  if (statusFilter.value) {
    result = result.filter((c) => c.status === statusFilter.value);
  }

  if (severityFilter.value) {
    result = result.filter((c) => c.severity === severityFilter.value);
  }

  if (typeFilter.value) {
    result = result.filter((c) => c.conflictType === typeFilter.value);
  }

  return result;
});

const openCount = computed(() => conflicts.value.filter((c) => c.status === 'OPEN').length);
const resolvedCount = computed(() => conflicts.value.filter((c) => c.status === 'RESOLVED').length);
const criticalCount = computed(() => conflicts.value.filter((c) => c.severity === 'CRITICAL' && c.status === 'OPEN').length);
const highCount = computed(() => conflicts.value.filter((c) => c.severity === 'HIGH' && c.status === 'OPEN').length);
const mediumCount = computed(() => conflicts.value.filter((c) => c.severity === 'MEDIUM' && c.status === 'OPEN').length);
const lowCount = computed(() => conflicts.value.filter((c) => c.severity === 'LOW' && c.status === 'OPEN').length);

async function fetchConflicts() {
  try {
    const response = await $api('/ai/conflicts', {
      params: { limit: 500 },
    });
    conflicts.value = response.data;
  } catch (e) {
    console.error('Failed to fetch conflicts:', e);
  }
}

async function runBulkCheck() {
  try {
    // Get all work IDs (simplified)
    const worksResponse = await $api('/works', { params: { limit: 100 } });
    const workIds = worksResponse.data.map((w: any) => w.id);

    await $api('/ai/conflicts/bulk-check', {
      method: 'POST',
      body: { workIds },
    });

    await fetchConflicts();
  } catch (e) {
    console.error('Bulk check failed:', e);
  }
}

function openResolveModal(conflict: any) {
  selectedConflict.value = conflict;
  resolution.value = '';
  resolutionNotes.value = '';
  showResolve.value = true;
}

async function resolveConflict() {
  if (!selectedConflict.value || !resolution.value) return;

  try {
    await $api(`/ai/conflicts/${selectedConflict.value.id}/resolve`, {
      method: 'POST',
      body: {
        resolution: resolution.value,
        notes: resolutionNotes.value,
      },
    });

    const conflict = conflicts.value.find((c) => c.id === selectedConflict.value.id);
    if (conflict) conflict.status = 'RESOLVED';

    showResolve.value = false;
  } catch (e) {
    console.error('Failed to resolve conflict:', e);
  }
}

function clearFilters() {
  searchQuery.value = '';
  statusFilter.value = '';
  severityFilter.value = '';
  typeFilter.value = '';
}

function formatConflictType(type: string): string {
  const names: Record<string, string> = {
    share_total_invalid: 'Invalid Shares',
    duplicate_iswc: 'Duplicate ISWC',
    duplicate_work: 'Duplicate Work',
    writer_conflict: 'Writer Conflict',
    territory_overlap: 'Territory Overlap',
    missing_controlled: 'Missing Controlled',
    ipi_mismatch: 'IPI Mismatch',
    society_mismatch: 'Society Mismatch',
    invalid_role: 'Invalid Role',
  };
  return names[type] || type.replace(/_/g, ' ');
}

function getTypeVariant(type: string) {
  const variants: Record<string, any> = {
    share_total_invalid: 'error',
    duplicate_iswc: 'warning',
    duplicate_work: 'warning',
    writer_conflict: 'secondary',
    territory_overlap: 'primary',
  };
  return variants[type] || 'neutral';
}

function getSeverityIcon(severity: string) {
  const icons: Record<string, any> = {
    CRITICAL: ExclamationCircleIcon,
    HIGH: ExclamationTriangleIcon,
    MEDIUM: InformationCircleIcon,
    LOW: QuestionMarkCircleIcon,
  };
  return icons[severity] || InformationCircleIcon;
}

function getSeverityColor(severity: string) {
  const colors: Record<string, string> = {
    CRITICAL: 'text-error-500',
    HIGH: 'text-warning-500',
    MEDIUM: 'text-surface-500',
    LOW: 'text-surface-400',
  };
  return colors[severity] || 'text-surface-500';
}

function getSeverityBg(severity: string) {
  const bgs: Record<string, string> = {
    CRITICAL: 'bg-error-100 dark:bg-error-900/30',
    HIGH: 'bg-warning-100 dark:bg-warning-900/30',
    MEDIUM: 'bg-surface-100 dark:bg-surface-800',
    LOW: 'bg-surface-50 dark:bg-surface-800/50',
  };
  return bgs[severity] || 'bg-surface-100';
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

onMounted(() => {
  fetchConflicts();
});
</script>
