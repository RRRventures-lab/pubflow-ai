<template>
  <div class="h-[calc(100vh-8rem)] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">Enrichment Proposals</h1>
        <p class="text-surface-500 mt-1">
          Review AI-suggested metadata improvements from external sources
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Badge v-if="pendingCount > 0" variant="warning">
          {{ pendingCount }} pending
        </Badge>
        <Button variant="secondary" :icon="AdjustmentsHorizontalIcon" @click="showFilters = !showFilters">
          Filters
        </Button>
        <Button
          variant="success"
          :icon="CheckIcon"
          :disabled="highConfidenceCount === 0"
          @click="bulkApproveHighConfidence"
        >
          Approve High Confidence ({{ highConfidenceCount }})
        </Button>
      </div>
    </div>

    <!-- Filter bar -->
    <div v-if="showFilters" class="mb-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <Input
            v-model="searchQuery"
            placeholder="Search by work title..."
            :leading-icon="MagnifyingGlassIcon"
          />
        </div>
        <div class="w-48">
          <select
            v-model="statusFilter"
            class="w-full px-3 py-2 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700 rounded-lg"
          >
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div class="w-48">
          <select
            v-model="sourceFilter"
            class="w-full px-3 py-2 bg-white dark:bg-surface-900 border border-surface-300 dark:border-surface-700 rounded-lg"
          >
            <option value="">All Sources</option>
            <option value="musicbrainz">MusicBrainz</option>
            <option value="discogs">Discogs</option>
            <option value="ascap">ASCAP</option>
            <option value="bmi">BMI</option>
          </select>
        </div>
        <Button variant="ghost" size="sm" @click="clearFilters">Clear</Button>
      </div>
    </div>

    <!-- Main content -->
    <Card class="flex-1 flex flex-col" padding="none">
      <!-- Table header -->
      <div class="grid grid-cols-12 gap-4 p-4 border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 text-sm font-medium text-surface-500">
        <div class="col-span-3">Work</div>
        <div class="col-span-2">Field</div>
        <div class="col-span-2">Current Value</div>
        <div class="col-span-2">Proposed Value</div>
        <div class="col-span-1">Source</div>
        <div class="col-span-1 text-center">Confidence</div>
        <div class="col-span-1 text-right">Actions</div>
      </div>

      <!-- Table body -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="proposal in filteredProposals"
          :key="proposal.id"
          class="grid grid-cols-12 gap-4 p-4 border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/30 items-center"
        >
          <div class="col-span-3">
            <NuxtLink :to="`/catalog/works/${proposal.workId}`" class="hover:underline">
              <p class="font-medium text-surface-900 dark:text-white truncate">
                {{ proposal.workTitle }}
              </p>
            </NuxtLink>
          </div>
          <div class="col-span-2">
            <Badge variant="secondary" size="sm">{{ formatFieldName(proposal.fieldName) }}</Badge>
          </div>
          <div class="col-span-2">
            <p class="text-surface-600 dark:text-surface-400 truncate font-mono text-sm">
              {{ proposal.currentValue || '—' }}
            </p>
          </div>
          <div class="col-span-2">
            <p class="text-surface-900 dark:text-white truncate font-mono text-sm font-medium">
              {{ proposal.proposedValue }}
            </p>
          </div>
          <div class="col-span-1">
            <Badge :variant="getSourceVariant(proposal.source)" size="sm">
              {{ proposal.source }}
            </Badge>
          </div>
          <div class="col-span-1 text-center">
            <ConfidenceIndicator :value="proposal.confidence" />
          </div>
          <div class="col-span-1 flex justify-end gap-1">
            <template v-if="proposal.status === 'PENDING'">
              <Button
                variant="ghost"
                size="sm"
                :icon="CheckIcon"
                class="text-success-600 hover:bg-success-50 dark:hover:bg-success-900/20"
                @click="approveProposal(proposal.id)"
              />
              <Button
                variant="ghost"
                size="sm"
                :icon="XMarkIcon"
                class="text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                @click="rejectProposal(proposal.id)"
              />
            </template>
            <Badge v-else :variant="getStatusVariant(proposal.status)" size="sm">
              {{ proposal.status }}
            </Badge>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredProposals.length === 0" class="flex items-center justify-center py-16">
          <div class="text-center">
            <SparklesIcon class="w-12 h-12 mx-auto text-surface-300 dark:text-surface-700 mb-4" />
            <p class="text-surface-500">No enrichment proposals found</p>
            <p class="text-sm text-surface-400 mt-1">
              Run enrichment on works to discover missing metadata
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
        <div class="flex items-center justify-between text-sm text-surface-500">
          <span>Showing {{ filteredProposals.length }} of {{ proposals.length }} proposals</span>
          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 bg-success-500 rounded-full" />
              {{ approvedCount }} approved
            </span>
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 bg-warning-500 rounded-full" />
              {{ pendingCount }} pending
            </span>
            <span class="flex items-center gap-1">
              <span class="w-2 h-2 bg-error-500 rounded-full" />
              {{ rejectedCount }} rejected
            </span>
          </div>
        </div>
      </div>
    </Card>

    <!-- Detail Modal -->
    <Modal v-model="showDetail" :title="selectedProposal?.workTitle || 'Proposal Details'" size="lg">
      <div v-if="selectedProposal" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-sm font-medium text-surface-500 mb-1">Field</p>
            <p class="text-surface-900 dark:text-white">{{ formatFieldName(selectedProposal.fieldName) }}</p>
          </div>
          <div>
            <p class="text-sm font-medium text-surface-500 mb-1">Source</p>
            <Badge :variant="getSourceVariant(selectedProposal.source)">{{ selectedProposal.source }}</Badge>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium text-surface-500 mb-1">Current Value</p>
          <p class="p-3 bg-surface-100 dark:bg-surface-800 rounded-lg font-mono text-sm">
            {{ selectedProposal.currentValue || 'Not set' }}
          </p>
        </div>

        <div>
          <p class="text-sm font-medium text-surface-500 mb-1">Proposed Value</p>
          <p class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg font-mono text-sm border border-primary-200 dark:border-primary-800">
            {{ selectedProposal.proposedValue }}
          </p>
        </div>

        <div>
          <p class="text-sm font-medium text-surface-500 mb-1">Confidence</p>
          <div class="flex items-center gap-3">
            <div class="flex-1 h-2 bg-surface-200 dark:bg-surface-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-primary-600 rounded-full"
                :style="{ width: `${selectedProposal.confidence * 100}%` }"
              />
            </div>
            <span class="font-medium">{{ (selectedProposal.confidence * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between">
          <Button variant="secondary" @click="showDetail = false">Close</Button>
          <div v-if="selectedProposal?.status === 'PENDING'" class="flex gap-2">
            <Button variant="error" :icon="XMarkIcon" @click="rejectProposal(selectedProposal.id); showDetail = false">
              Reject
            </Button>
            <Button variant="success" :icon="CheckIcon" @click="approveProposal(selectedProposal.id); showDetail = false">
              Approve
            </Button>
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline';

const { $api } = useNuxtApp();

const proposals = ref<any[]>([]);
const showFilters = ref(false);
const showDetail = ref(false);
const selectedProposal = ref<any>(null);

// Filters
const searchQuery = ref('');
const statusFilter = ref('');
const sourceFilter = ref('');

const filteredProposals = computed(() => {
  let result = proposals.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((p) => p.workTitle?.toLowerCase().includes(query));
  }

  if (statusFilter.value) {
    result = result.filter((p) => p.status === statusFilter.value);
  }

  if (sourceFilter.value) {
    result = result.filter((p) => p.source === sourceFilter.value);
  }

  return result;
});

const pendingCount = computed(() => proposals.value.filter((p) => p.status === 'PENDING').length);
const approvedCount = computed(() => proposals.value.filter((p) => p.status === 'APPROVED').length);
const rejectedCount = computed(() => proposals.value.filter((p) => p.status === 'REJECTED').length);
const highConfidenceCount = computed(() =>
  proposals.value.filter((p) => p.status === 'PENDING' && p.confidence >= 0.95).length
);

async function fetchProposals() {
  try {
    const response = await $api('/ai/enrichments', {
      params: { limit: 500 },
    });
    proposals.value = response.data;
  } catch (e) {
    console.error('Failed to fetch proposals:', e);
  }
}

async function approveProposal(id: string) {
  try {
    await $api(`/ai/enrichments/${id}/approve`, { method: 'POST' });
    const proposal = proposals.value.find((p) => p.id === id);
    if (proposal) proposal.status = 'APPROVED';
  } catch (e) {
    console.error('Failed to approve proposal:', e);
  }
}

async function rejectProposal(id: string) {
  try {
    await $api(`/ai/enrichments/${id}/reject`, { method: 'POST' });
    const proposal = proposals.value.find((p) => p.id === id);
    if (proposal) proposal.status = 'REJECTED';
  } catch (e) {
    console.error('Failed to reject proposal:', e);
  }
}

async function bulkApproveHighConfidence() {
  try {
    await $api('/ai/enrichments/bulk-approve', {
      method: 'POST',
      body: { minConfidence: 0.95 },
    });
    await fetchProposals();
  } catch (e) {
    console.error('Failed to bulk approve:', e);
  }
}

function clearFilters() {
  searchQuery.value = '';
  statusFilter.value = '';
  sourceFilter.value = '';
}

function formatFieldName(field: string): string {
  const names: Record<string, string> = {
    iswc: 'ISWC',
    isrc: 'ISRC',
    ipi: 'IPI Number',
    release_date: 'Release Date',
    duration: 'Duration',
    genre: 'Genre',
    alternate_title: 'Alt. Title',
  };
  return names[field] || field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSourceVariant(source: string) {
  const variants: Record<string, any> = {
    musicbrainz: 'primary',
    discogs: 'secondary',
    ascap: 'success',
    bmi: 'warning',
  };
  return variants[source] || 'neutral';
}

function getStatusVariant(status: string) {
  const variants: Record<string, any> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
  };
  return variants[status] || 'neutral';
}

onMounted(() => {
  fetchProposals();
});
</script>
