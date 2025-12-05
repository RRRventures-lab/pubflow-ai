<template>
  <TransitionRoot appear :show="modelValue" as="template">
    <Dialog as="div" class="relative z-50" @close="close">
      <!-- Backdrop -->
      <TransitionChild
        as="template"
        enter="duration-200 ease-out"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="duration-150 ease-in"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/50" />
      </TransitionChild>

      <!-- Modal -->
      <div class="fixed inset-0 overflow-y-auto pt-20 sm:pt-32">
        <TransitionChild
          as="template"
          enter="duration-200 ease-out"
          enter-from="opacity-0 scale-95"
          enter-to="opacity-100 scale-100"
          leave="duration-150 ease-in"
          leave-from="opacity-100 scale-100"
          leave-to="opacity-0 scale-95"
        >
          <DialogPanel
            class="mx-auto max-w-xl bg-white dark:bg-surface-900 rounded-xl shadow-2xl ring-1 ring-surface-200 dark:ring-surface-800 overflow-hidden"
          >
            <!-- Search input -->
            <div class="relative">
              <MagnifyingGlassIcon
                class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400"
              />
              <input
                ref="searchInput"
                v-model="query"
                type="text"
                placeholder="Search works, writers, recordings..."
                class="w-full px-4 py-4 pl-12 pr-12 text-lg bg-transparent border-b border-surface-200 dark:border-surface-800 focus:outline-none text-surface-900 dark:text-white placeholder:text-surface-400"
                @keydown.down.prevent="moveSelection(1)"
                @keydown.up.prevent="moveSelection(-1)"
                @keydown.enter="selectResult"
                @keydown.esc="close"
              />
              <kbd class="absolute right-4 top-1/2 -translate-y-1/2 kbd">esc</kbd>
            </div>

            <!-- Results -->
            <div class="max-h-96 overflow-y-auto">
              <!-- Loading state -->
              <div v-if="loading" class="p-4 space-y-3">
                <div class="skeleton h-12 rounded-lg" />
                <div class="skeleton h-12 rounded-lg" />
                <div class="skeleton h-12 rounded-lg" />
              </div>

              <!-- Empty state -->
              <div
                v-else-if="query && results.length === 0"
                class="p-8 text-center text-surface-500"
              >
                <DocumentMagnifyingGlassIcon class="w-12 h-12 mx-auto mb-3 text-surface-300" />
                <p>No results found for "{{ query }}"</p>
                <p class="text-sm mt-1">Try a different search term</p>
              </div>

              <!-- Results list -->
              <div v-else-if="results.length > 0" class="py-2">
                <div
                  v-for="(group, groupIndex) in groupedResults"
                  :key="group.type"
                  class="mb-2"
                >
                  <p class="px-4 py-2 text-xs font-medium text-surface-500 uppercase tracking-wider">
                    {{ group.type }}
                  </p>
                  <button
                    v-for="(result, resultIndex) in group.items"
                    :key="result.id"
                    :class="[
                      'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-100 dark:hover:bg-surface-800',
                      selectedIndex === getAbsoluteIndex(groupIndex, resultIndex)
                        ? 'bg-surface-100 dark:bg-surface-800'
                        : '',
                    ]"
                    @click="navigateToResult(result)"
                  >
                    <div
                      :class="[
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        getResultIconBg(result.type),
                      ]"
                    >
                      <component
                        :is="getResultIcon(result.type)"
                        class="w-5 h-5 text-white"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-surface-900 dark:text-white truncate">
                        {{ result.title }}
                      </p>
                      <p class="text-sm text-surface-500 truncate">
                        {{ result.subtitle }}
                      </p>
                    </div>
                    <Badge
                      v-if="result.badge"
                      :variant="result.badgeVariant || 'neutral'"
                      size="sm"
                    >
                      {{ result.badge }}
                    </Badge>
                  </button>
                </div>
              </div>

              <!-- Quick actions (when no query) -->
              <div v-else class="p-4">
                <p class="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">
                  Quick Actions
                </p>
                <div class="space-y-1">
                  <button
                    v-for="action in quickActions"
                    :key="action.label"
                    class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                    @click="action.action"
                  >
                    <component
                      :is="action.icon"
                      class="w-5 h-5 text-surface-400"
                    />
                    <span class="text-sm text-surface-700 dark:text-surface-300">
                      {{ action.label }}
                    </span>
                    <kbd class="kbd ml-auto">{{ action.shortcut }}</kbd>
                  </button>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center gap-4 px-4 py-3 border-t border-surface-200 dark:border-surface-800 text-xs text-surface-500">
              <span class="flex items-center gap-1">
                <kbd class="kbd">↑↓</kbd> Navigate
              </span>
              <span class="flex items-center gap-1">
                <kbd class="kbd">↵</kbd> Select
              </span>
              <span class="flex items-center gap-1">
                <kbd class="kbd">esc</kbd> Close
              </span>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogPanel,
} from '@headlessui/vue';
import {
  MagnifyingGlassIcon,
  DocumentMagnifyingGlassIcon,
  MusicalNoteIcon,
  UserIcon,
  DocumentTextIcon,
  PlusIcon,
  CloudArrowUpIcon,
} from '@heroicons/vue/24/outline';

interface SearchResult {
  id: string;
  type: 'work' | 'writer' | 'cwr' | 'statement';
  title: string;
  subtitle: string;
  badge?: string;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  url: string;
}

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const searchInput = ref<HTMLInputElement>();
const query = ref('');
const loading = ref(false);
const selectedIndex = ref(0);
const results = ref<SearchResult[]>([]);

// Demo results - would be from API
const demoResults: SearchResult[] = [
  {
    id: '1',
    type: 'work',
    title: 'Bohemian Rhapsody',
    subtitle: 'Queen • T-002345678-2',
    badge: 'ISWC',
    badgeVariant: 'success',
    url: '/catalog/works/1',
  },
  {
    id: '2',
    type: 'work',
    title: 'Imagine',
    subtitle: 'John Lennon • T-001234567-1',
    badge: 'ISWC',
    badgeVariant: 'success',
    url: '/catalog/works/2',
  },
  {
    id: '3',
    type: 'writer',
    title: 'Freddie Mercury',
    subtitle: 'IPI: 00123456789',
    url: '/catalog/writers/3',
  },
  {
    id: '4',
    type: 'cwr',
    title: 'CWR-2024-001',
    subtitle: 'Generated Dec 1, 2024 • 150 works',
    badge: 'Acknowledged',
    badgeVariant: 'success',
    url: '/cwr/viewer/4',
  },
];

const groupedResults = computed(() => {
  const groups: { type: string; items: SearchResult[] }[] = [];
  const typeMap = new Map<string, SearchResult[]>();

  for (const result of results.value) {
    const items = typeMap.get(result.type) || [];
    items.push(result);
    typeMap.set(result.type, items);
  }

  const typeLabels: Record<string, string> = {
    work: 'Works',
    writer: 'Writers',
    cwr: 'CWR Files',
    statement: 'Statements',
  };

  for (const [type, items] of typeMap) {
    groups.push({ type: typeLabels[type] || type, items });
  }

  return groups;
});

const quickActions = [
  {
    icon: PlusIcon,
    label: 'Create new work',
    shortcut: 'N',
    action: () => navigateTo('/catalog/works/new'),
  },
  {
    icon: CloudArrowUpIcon,
    label: 'Upload statement',
    shortcut: 'U',
    action: () => navigateTo('/royalties/statements?upload=true'),
  },
  {
    icon: DocumentTextIcon,
    label: 'Generate CWR',
    shortcut: 'G',
    action: () => navigateTo('/cwr/generate'),
  },
];

// Search with debounce
watch(query, async (newQuery) => {
  if (!newQuery.trim()) {
    results.value = [];
    return;
  }

  loading.value = true;
  selectedIndex.value = 0;

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Filter demo results
  results.value = demoResults.filter(
    (r) =>
      r.title.toLowerCase().includes(newQuery.toLowerCase()) ||
      r.subtitle.toLowerCase().includes(newQuery.toLowerCase())
  );

  loading.value = false;
});

// Focus input when modal opens
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      nextTick(() => searchInput.value?.focus());
    } else {
      query.value = '';
      results.value = [];
      selectedIndex.value = 0;
    }
  }
);

function getAbsoluteIndex(groupIndex: number, itemIndex: number): number {
  let index = itemIndex;
  for (let i = 0; i < groupIndex; i++) {
    index += groupedResults.value[i].items.length;
  }
  return index;
}

function moveSelection(delta: number) {
  const total = results.value.length;
  if (total === 0) return;
  selectedIndex.value = (selectedIndex.value + delta + total) % total;
}

function selectResult() {
  if (results.value[selectedIndex.value]) {
    navigateToResult(results.value[selectedIndex.value]);
  }
}

function navigateToResult(result: SearchResult) {
  close();
  navigateTo(result.url);
}

function getResultIcon(type: string) {
  const icons: Record<string, any> = {
    work: MusicalNoteIcon,
    writer: UserIcon,
    cwr: DocumentTextIcon,
    statement: DocumentTextIcon,
  };
  return icons[type] || DocumentTextIcon;
}

function getResultIconBg(type: string) {
  const colors: Record<string, string> = {
    work: 'bg-primary-500',
    writer: 'bg-accent-500',
    cwr: 'bg-success-500',
    statement: 'bg-warning-500',
  };
  return colors[type] || 'bg-surface-500';
}

function close() {
  emit('update:modelValue', false);
}
</script>
