<template>
  <div class="h-[calc(100vh-8rem)]">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">Works Catalog</h1>
        <p class="text-surface-500 mt-1">
          {{ works.totalCount.toLocaleString() }} works in your catalog
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="secondary" :icon="FunnelIcon" @click="showFilters = !showFilters">
          Filters
          <Badge v-if="works.activeFiltersCount" variant="primary" size="sm" class="ml-1">
            {{ works.activeFiltersCount }}
          </Badge>
        </Button>
        <Button variant="secondary" :icon="ArrowDownTrayIcon" @click="exportWorks">
          Export
        </Button>
        <Button :icon="PlusIcon" @click="navigateTo('/catalog/works/new')">
          New Work
        </Button>
      </div>
    </div>

    <!-- Filters panel -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <Card v-if="showFilters" class="mb-4" padding="md">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Status
            </label>
            <select
              v-model="filters.status"
              multiple
              class="input"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="registered">Registered</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Has ISWC
            </label>
            <select v-model="filters.hasIswc" class="input">
              <option :value="undefined">Any</option>
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              AI Enriched
            </label>
            <select v-model="filters.aiEnriched" class="input">
              <option :value="undefined">Any</option>
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              Has Conflicts
            </label>
            <select v-model="filters.hasConflicts" class="input">
              <option :value="undefined">Any</option>
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-surface-200 dark:border-surface-800">
          <Button variant="ghost" @click="clearFilters">Clear Filters</Button>
          <Button @click="applyFilters">Apply Filters</Button>
        </div>
      </Card>
    </transition>

    <!-- Data table -->
    <Card padding="none" class="h-full">
      <DataTableVirtual
        :data="works.works"
        :columns="columns"
        :loading="works.isLoading"
        :total-count="works.totalCount"
        row-key="id"
        searchable
        search-placeholder="Search works by title, ISWC, or writer..."
        selectable
        column-toggle
        @search="onSearch"
        @sort="onSort"
        @row-click="onRowClick"
        @row-double-click="onRowDoubleClick"
        @selection-change="onSelectionChange"
      >
        <!-- Custom cell renderers -->
        <template #cell-title="{ value, row }">
          <div class="flex items-center gap-2">
            <div>
              <p class="font-medium text-surface-900 dark:text-white">{{ value }}</p>
              <p v-if="row.alternateTitles?.length" class="text-xs text-surface-500">
                +{{ row.alternateTitles.length }} alternate titles
              </p>
            </div>
            <SparklesIcon
              v-if="row.aiEnriched"
              class="w-4 h-4 text-primary-500"
              title="AI Enriched"
            />
            <ExclamationTriangleIcon
              v-if="row.hasConflicts"
              class="w-4 h-4 text-error-500"
              title="Has Conflicts"
            />
          </div>
        </template>

        <template #cell-iswc="{ value }">
          <code v-if="value" class="text-xs font-mono bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">
            {{ value }}
          </code>
          <span v-else class="text-surface-400">—</span>
        </template>

        <template #cell-writers="{ row }">
          <div v-if="row.writers?.length" class="text-sm">
            {{ row.writers.map((w: any) => `${w.lastName}`).slice(0, 2).join(', ') }}
            <span v-if="row.writers.length > 2" class="text-surface-500">
              +{{ row.writers.length - 2 }}
            </span>
          </div>
          <span v-else class="text-surface-400">—</span>
        </template>

        <template #cell-status="{ value }">
          <Badge :variant="getStatusVariant(value)">
            {{ value }}
          </Badge>
        </template>

        <template #cell-aiConfidence="{ value }">
          <div v-if="value !== undefined" class="flex items-center gap-2">
            <div class="w-16 h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
              <div
                :class="[
                  'h-full rounded-full transition-all',
                  value >= 0.9 ? 'bg-success-500' : value >= 0.7 ? 'bg-warning-500' : 'bg-error-500',
                ]"
                :style="{ width: `${value * 100}%` }"
              />
            </div>
            <span class="text-xs text-surface-500">{{ Math.round(value * 100) }}%</span>
          </div>
          <span v-else class="text-surface-400">—</span>
        </template>

        <template #cell-updatedAt="{ value }">
          <span class="text-sm text-surface-500">
            {{ formatDate(value) }}
          </span>
        </template>

        <!-- Row actions -->
        <template #actions="{ row }">
          <Menu as="div" class="relative">
            <MenuButton class="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
              <EllipsisVerticalIcon class="w-5 h-5 text-surface-400" />
            </MenuButton>
            <MenuItems
              class="absolute right-0 mt-1 w-48 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 z-10"
            >
              <MenuItem v-slot="{ active }">
                <button
                  :class="[
                    'w-full flex items-center gap-2 px-4 py-2 text-sm',
                    active ? 'bg-surface-100 dark:bg-surface-700' : '',
                  ]"
                  @click="navigateTo(`/catalog/works/${row.id}`)"
                >
                  <EyeIcon class="w-4 h-4" />
                  View Details
                </button>
              </MenuItem>
              <MenuItem v-slot="{ active }">
                <button
                  :class="[
                    'w-full flex items-center gap-2 px-4 py-2 text-sm',
                    active ? 'bg-surface-100 dark:bg-surface-700' : '',
                  ]"
                  @click="editWork(row)"
                >
                  <PencilIcon class="w-4 h-4" />
                  Edit
                </button>
              </MenuItem>
              <MenuItem v-slot="{ active }">
                <button
                  :class="[
                    'w-full flex items-center gap-2 px-4 py-2 text-sm',
                    active ? 'bg-surface-100 dark:bg-surface-700' : '',
                  ]"
                  @click="duplicateWork(row)"
                >
                  <DocumentDuplicateIcon class="w-4 h-4" />
                  Duplicate
                </button>
              </MenuItem>
              <div class="border-t border-surface-200 dark:border-surface-700 my-1" />
              <MenuItem v-slot="{ active }">
                <button
                  :class="[
                    'w-full flex items-center gap-2 px-4 py-2 text-sm text-error-600',
                    active ? 'bg-surface-100 dark:bg-surface-700' : '',
                  ]"
                  @click="confirmDelete(row)"
                >
                  <TrashIcon class="w-4 h-4" />
                  Delete
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </template>

        <!-- Bulk actions -->
        <template #bulkActions="{ selected }">
          <Button variant="secondary" size="sm" @click="bulkExport(selected)">
            Export Selected
          </Button>
          <Button variant="danger" size="sm" @click="bulkDelete(selected)">
            Delete Selected
          </Button>
        </template>

        <!-- Empty state -->
        <template #empty>
          <div class="text-center py-12">
            <MusicalNoteIcon class="w-16 h-16 mx-auto text-surface-300 mb-4" />
            <h3 class="text-lg font-semibold text-surface-900 dark:text-white mb-2">
              No works yet
            </h3>
            <p class="text-surface-500 mb-6 max-w-sm mx-auto">
              Start building your catalog by adding your first musical work.
            </p>
            <Button @click="navigateTo('/catalog/works/new')">
              <PlusIcon class="w-5 h-5 mr-2" />
              Add Your First Work
            </Button>
          </div>
        </template>
      </DataTableVirtual>
    </Card>

    <!-- Delete confirmation modal -->
    <Modal v-model="showDeleteModal" title="Delete Work" size="sm">
      <p class="text-surface-600 dark:text-surface-400">
        Are you sure you want to delete <strong>{{ workToDelete?.title }}</strong>?
        This action cannot be undone.
      </p>
      <template #footer>
        <Button variant="secondary" @click="showDeleteModal = false">Cancel</Button>
        <Button variant="danger" @click="deleteWork">Delete</Button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue';
import {
  PlusIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  PencilIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  MusicalNoteIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import { format } from 'date-fns';
import type { Column } from '~/components/ui/DataTableVirtual.vue';
import type { Work } from '~/stores/works';

const works = useWorksStore();

const showFilters = ref(false);
const showDeleteModal = ref(false);
const workToDelete = ref<Work | null>(null);

const filters = reactive({
  status: [] as string[],
  hasIswc: undefined as boolean | undefined,
  aiEnriched: undefined as boolean | undefined,
  hasConflicts: undefined as boolean | undefined,
});

const columns: Column<Work>[] = [
  { key: 'title', label: 'Title', width: 300, sortable: true, searchable: true },
  { key: 'iswc', label: 'ISWC', width: 150, sortable: true, searchable: true },
  { key: 'writers', label: 'Writers', width: 200 },
  { key: 'status', label: 'Status', width: 120, sortable: true },
  { key: 'aiConfidence', label: 'AI Score', width: 120, sortable: true },
  { key: 'updatedAt', label: 'Updated', width: 140, sortable: true },
];

function getStatusVariant(status: string) {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
    active: 'success',
    registered: 'primary',
    draft: 'neutral',
    disputed: 'error',
  };
  return variants[status] || 'neutral';
}

function formatDate(dateString: string) {
  if (!dateString) return '—';
  return format(new Date(dateString), 'MMM d, yyyy');
}

function onSearch(query: string) {
  works.setFilters({ ...works.filters, search: query });
  works.fetchWorks();
}

function onSort(key: string, direction: 'asc' | 'desc') {
  works.setSort(key, direction);
  works.fetchWorks();
}

function onRowClick(row: Work) {
  // Could show quick preview
}

function onRowDoubleClick(row: Work) {
  navigateTo(`/catalog/works/${row.id}`);
}

function onSelectionChange(ids: string[]) {
  works.selectedIds = ids;
}

function applyFilters() {
  works.setFilters({
    status: filters.status.length > 0 ? filters.status as any : undefined,
    hasIswc: filters.hasIswc,
    aiEnriched: filters.aiEnriched,
    hasConflicts: filters.hasConflicts,
  });
  works.fetchWorks();
  showFilters.value = false;
}

function clearFilters() {
  filters.status = [];
  filters.hasIswc = undefined;
  filters.aiEnriched = undefined;
  filters.hasConflicts = undefined;
  works.setFilters({});
  works.fetchWorks();
}

function editWork(work: Work) {
  navigateTo(`/catalog/works/${work.id}/edit`);
}

function duplicateWork(work: Work) {
  navigateTo(`/catalog/works/new?duplicate=${work.id}`);
}

function confirmDelete(work: Work) {
  workToDelete.value = work;
  showDeleteModal.value = true;
}

async function deleteWork() {
  if (workToDelete.value) {
    await works.deleteWork(workToDelete.value.id);
    showDeleteModal.value = false;
    workToDelete.value = null;
  }
}

function exportWorks() {
  // TODO: Implement export
}

function bulkExport(ids: string[]) {
  // TODO: Implement bulk export
}

async function bulkDelete(ids: string[]) {
  if (confirm(`Delete ${ids.length} works? This action cannot be undone.`)) {
    await works.bulkDelete(ids);
  }
}

// Initial fetch
onMounted(() => {
  works.fetchWorks();
});
</script>
