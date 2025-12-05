<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div
      v-if="$slots.toolbar || searchable || selectable"
      class="flex items-center justify-between gap-4 p-4 border-b border-surface-200 dark:border-surface-800"
    >
      <div class="flex items-center gap-4 flex-1">
        <!-- Search -->
        <div v-if="searchable" class="relative w-80">
          <MagnifyingGlassIcon
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400"
          />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="w-full pl-9 pr-4 py-2 text-sm border border-surface-300 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            @input="onSearch"
          />
        </div>

        <!-- Selection info -->
        <div
          v-if="selectable && selectedRows.size > 0"
          class="flex items-center gap-3 text-sm"
        >
          <span class="text-surface-600 dark:text-surface-400">
            {{ selectedRows.size.toLocaleString() }} selected
          </span>
          <button
            class="text-primary-600 hover:text-primary-700 font-medium"
            @click="clearSelection"
          >
            Clear
          </button>
        </div>

        <slot name="toolbar" />
      </div>

      <!-- Bulk actions -->
      <div v-if="selectable && selectedRows.size > 0" class="flex items-center gap-2">
        <slot name="bulkActions" :selected="Array.from(selectedRows)" />
      </div>

      <!-- Column visibility toggle -->
      <Menu v-if="columnToggle" as="div" class="relative">
        <MenuButton class="btn-ghost p-2">
          <ViewColumnsIcon class="w-5 h-5" />
        </MenuButton>
        <MenuItems
          class="absolute right-0 mt-2 w-56 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 z-10"
        >
          <MenuItem
            v-for="col in toggleableColumns"
            :key="col.key"
            v-slot="{ active }"
          >
            <button
              :class="[
                'w-full flex items-center gap-2 px-4 py-2 text-sm',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
              ]"
              @click="toggleColumn(col.key)"
            >
              <CheckIcon
                v-if="visibleColumns.has(col.key)"
                class="w-4 h-4 text-primary-600"
              />
              <div v-else class="w-4 h-4" />
              <span class="text-surface-700 dark:text-surface-300">
                {{ col.label }}
              </span>
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
    </div>

    <!-- Table container -->
    <div
      ref="tableContainer"
      class="flex-1 overflow-auto relative"
      @scroll="onScroll"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800"
        :style="{ minWidth: `${totalWidth}px` }"
      >
        <!-- Select all checkbox -->
        <div
          v-if="selectable"
          class="flex items-center justify-center w-12 px-3 py-3 border-r border-surface-200 dark:border-surface-800"
        >
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="someSelected && !allSelected"
            class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
            @change="toggleSelectAll"
          />
        </div>

        <!-- Column headers -->
        <div
          v-for="column in activeColumns"
          :key="column.key"
          :class="[
            'flex items-center gap-2 px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider',
            column.sortable ? 'cursor-pointer hover:text-surface-700 dark:hover:text-surface-200' : '',
          ]"
          :style="{ width: `${column.width || 150}px`, minWidth: `${column.minWidth || 100}px` }"
          @click="column.sortable && onSort(column.key)"
        >
          <span>{{ column.label }}</span>
          <template v-if="column.sortable && sortKey === column.key">
            <ChevronUpIcon v-if="sortDirection === 'asc'" class="w-4 h-4" />
            <ChevronDownIcon v-else class="w-4 h-4" />
          </template>
        </div>

        <!-- Actions column header -->
        <div
          v-if="$slots.actions"
          class="w-24 px-4 py-3 text-right text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider"
        >
          Actions
        </div>
      </div>

      <!-- Virtual scroll container -->
      <div
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          width: `${totalWidth}px`,
          position: 'relative',
        }"
      >
        <!-- Virtual rows -->
        <div
          v-for="virtualRow in virtualizer.getVirtualItems()"
          :key="virtualRow.key"
          :class="[
            'absolute top-0 left-0 flex items-center border-b border-surface-100 dark:border-surface-800',
            'hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors',
            selectedRows.has(getRowId(virtualRow.index)) ? 'bg-primary-50 dark:bg-primary-900/20' : '',
            focusedRowIndex === virtualRow.index ? 'ring-2 ring-inset ring-primary-500' : '',
          ]"
          :style="{
            transform: `translateY(${virtualRow.start}px)`,
            height: `${virtualRow.size}px`,
            width: '100%',
          }"
          @click="onRowClick(virtualRow.index)"
          @dblclick="onRowDoubleClick(virtualRow.index)"
        >
          <!-- Select checkbox -->
          <div
            v-if="selectable"
            class="flex items-center justify-center w-12 px-3"
            @click.stop="toggleRowSelection(virtualRow.index)"
          >
            <input
              type="checkbox"
              :checked="selectedRows.has(getRowId(virtualRow.index))"
              class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
            />
          </div>

          <!-- Cell values -->
          <div
            v-for="column in activeColumns"
            :key="column.key"
            class="px-4 py-3 text-sm text-surface-700 dark:text-surface-300 truncate"
            :style="{ width: `${column.width || 150}px`, minWidth: `${column.minWidth || 100}px` }"
          >
            <slot
              :name="`cell-${column.key}`"
              :value="getCellValue(virtualRow.index, column.key)"
              :row="data[virtualRow.index]"
              :column="column"
              :index="virtualRow.index"
            >
              <component
                v-if="column.render"
                :is="column.render"
                :value="getCellValue(virtualRow.index, column.key)"
                :row="data[virtualRow.index]"
              />
              <template v-else>
                {{ formatCellValue(virtualRow.index, column) }}
              </template>
            </slot>
          </div>

          <!-- Actions -->
          <div
            v-if="$slots.actions"
            class="w-24 px-4 py-3 text-right"
            @click.stop
          >
            <slot name="actions" :row="data[virtualRow.index]" :index="virtualRow.index" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="data.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="text-center">
          <slot name="empty">
            <InboxIcon class="w-12 h-12 mx-auto text-surface-300 mb-3" />
            <p class="text-surface-500">{{ emptyText }}</p>
          </slot>
        </div>
      </div>

      <!-- Loading overlay -->
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-surface-900/80"
      >
        <Spinner size="lg" />
      </div>
    </div>

    <!-- Footer -->
    <div
      v-if="showFooter"
      class="flex items-center justify-between px-4 py-3 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900"
    >
      <p class="text-sm text-surface-500">
        {{ data.length.toLocaleString() }} {{ data.length === 1 ? 'item' : 'items' }}
        <template v-if="totalCount && totalCount !== data.length">
          of {{ totalCount.toLocaleString() }} total
        </template>
      </p>

      <!-- Pagination or infinite scroll indicator -->
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue';
import {
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InboxIcon,
} from '@heroicons/vue/24/outline';

export interface Column<T = any> {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  searchable?: boolean;
  hidden?: boolean;
  format?: (value: any, row: T) => string;
  render?: any;
}

interface Props {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  overscan?: number;
  rowKey?: string | ((row: T, index: number) => string | number);
  selectable?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  columnToggle?: boolean;
  loading?: boolean;
  emptyText?: string;
  showFooter?: boolean;
  totalCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  rowHeight: 52,
  overscan: 10,
  rowKey: 'id',
  selectable: false,
  searchable: false,
  searchPlaceholder: 'Search...',
  columnToggle: false,
  loading: false,
  emptyText: 'No data available',
  showFooter: true,
});

const emit = defineEmits<{
  rowClick: [row: T, index: number];
  rowDoubleClick: [row: T, index: number];
  selectionChange: [selectedIds: (string | number)[]];
  sort: [key: string, direction: 'asc' | 'desc'];
  search: [query: string];
}>();

// Refs
const tableContainer = ref<HTMLElement>();
const searchQuery = ref('');
const sortKey = ref<string | null>(null);
const sortDirection = ref<'asc' | 'desc'>('asc');
const selectedRows = ref(new Set<string | number>());
const focusedRowIndex = ref<number | null>(null);
const visibleColumns = ref(new Set(props.columns.filter((c) => !c.hidden).map((c) => c.key)));

// Computed
const activeColumns = computed(() =>
  props.columns.filter((c) => visibleColumns.value.has(c.key))
);

const toggleableColumns = computed(() =>
  props.columns.filter((c) => c.key !== 'id')
);

const totalWidth = computed(() => {
  let width = activeColumns.value.reduce((acc, col) => acc + (col.width || 150), 0);
  if (props.selectable) width += 48;
  if (props.$slots?.actions) width += 96;
  return width;
});

const allSelected = computed(() =>
  props.data.length > 0 && selectedRows.value.size === props.data.length
);

const someSelected = computed(() =>
  selectedRows.value.size > 0 && selectedRows.value.size < props.data.length
);

// Virtual scrolling
const virtualizer = useVirtualizer({
  count: computed(() => props.data.length),
  getScrollElement: () => tableContainer.value,
  estimateSize: () => props.rowHeight,
  overscan: props.overscan,
});

// Methods
function getRowId(index: number): string | number {
  const row = props.data[index];
  if (!row) return index;

  if (typeof props.rowKey === 'function') {
    return props.rowKey(row, index);
  }
  return row[props.rowKey] ?? index;
}

function getCellValue(index: number, key: string): any {
  const row = props.data[index];
  if (!row) return null;

  // Support nested keys like "writer.name"
  return key.split('.').reduce((obj, k) => obj?.[k], row);
}

function formatCellValue(index: number, column: Column<T>): string {
  const value = getCellValue(index, column.key);
  if (column.format) {
    return column.format(value, props.data[index]);
  }
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function onRowClick(index: number) {
  focusedRowIndex.value = index;
  emit('rowClick', props.data[index], index);
}

function onRowDoubleClick(index: number) {
  emit('rowDoubleClick', props.data[index], index);
}

function toggleRowSelection(index: number) {
  const id = getRowId(index);
  if (selectedRows.value.has(id)) {
    selectedRows.value.delete(id);
  } else {
    selectedRows.value.add(id);
  }
  emit('selectionChange', Array.from(selectedRows.value));
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedRows.value.clear();
  } else {
    props.data.forEach((_, index) => {
      selectedRows.value.add(getRowId(index));
    });
  }
  emit('selectionChange', Array.from(selectedRows.value));
}

function clearSelection() {
  selectedRows.value.clear();
  emit('selectionChange', []);
}

function toggleColumn(key: string) {
  if (visibleColumns.value.has(key)) {
    visibleColumns.value.delete(key);
  } else {
    visibleColumns.value.add(key);
  }
}

function onSort(key: string) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDirection.value = 'asc';
  }
  emit('sort', key, sortDirection.value);
}

function onSearch() {
  emit('search', searchQuery.value);
}

function onScroll() {
  // Could emit scroll events for infinite loading
}

// Keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  if (focusedRowIndex.value === null) return;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      focusedRowIndex.value = Math.min(focusedRowIndex.value + 1, props.data.length - 1);
      scrollToRow(focusedRowIndex.value);
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      focusedRowIndex.value = Math.max(focusedRowIndex.value - 1, 0);
      scrollToRow(focusedRowIndex.value);
      break;
    case ' ':
      if (props.selectable) {
        e.preventDefault();
        toggleRowSelection(focusedRowIndex.value);
      }
      break;
    case 'Enter':
      e.preventDefault();
      emit('rowDoubleClick', props.data[focusedRowIndex.value], focusedRowIndex.value);
      break;
  }
}

function scrollToRow(index: number) {
  virtualizer.value.scrollToIndex(index, { align: 'auto' });
}

// Lifecycle
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// Expose methods
defineExpose({
  scrollToRow,
  clearSelection,
  getSelectedRows: () => Array.from(selectedRows.value),
});
</script>
