<template>
  <div class="h-[calc(100vh-8rem)] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">Matching Queue</h1>
        <p class="text-surface-500 mt-1">
          Review and resolve AI-matched royalty statements
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Badge v-if="matching.pendingCount > 0" variant="warning">
          {{ matching.pendingCount }} pending
        </Badge>
        <Button variant="secondary" :icon="AdjustmentsHorizontalIcon" @click="showFilters = !showFilters">
          Filters
        </Button>
        <Button variant="secondary" :icon="QuestionMarkCircleIcon" @click="showShortcuts = true">
          Shortcuts
        </Button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="mb-4">
      <div class="flex items-center justify-between text-sm mb-1">
        <span class="text-surface-600 dark:text-surface-400">Progress</span>
        <span class="text-surface-900 dark:text-white font-medium">{{ matching.progress }}%</span>
      </div>
      <div class="h-2 bg-surface-200 dark:bg-surface-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-600 rounded-full transition-all duration-300"
          :style="{ width: `${matching.progress}%` }"
        />
      </div>
    </div>

    <!-- Main content -->
    <div class="flex-1 flex gap-4 overflow-hidden">
      <!-- Queue list (left sidebar) -->
      <Card class="w-80 shrink-0 flex flex-col" padding="none">
        <div class="p-4 border-b border-surface-200 dark:border-surface-800">
          <Input
            v-model="queueSearch"
            placeholder="Filter queue..."
            :leading-icon="MagnifyingGlassIcon"
            size="sm"
          />
        </div>

        <div class="flex-1 overflow-y-auto">
          <button
            v-for="(item, index) in filteredItems"
            :key="item.id"
            :class="[
              'w-full text-left p-4 border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors',
              matching.currentItem?.id === item.id ? 'bg-primary-50 dark:bg-primary-900/20' : '',
            ]"
            @click="matching.goToItem(index)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <p class="font-medium text-surface-900 dark:text-white truncate">
                  {{ item.originalTitle }}
                </p>
                <p class="text-sm text-surface-500 truncate">
                  {{ item.originalWriter || 'Unknown writer' }}
                </p>
              </div>
              <ConfidenceIndicator :value="item.confidence" />
            </div>
            <div class="flex items-center gap-2 mt-2">
              <Badge size="sm" :variant="getStatusVariant(item.status)">
                {{ item.status }}
              </Badge>
              <span class="text-xs text-surface-400">
                {{ formatCurrency(item.amount, item.currency) }}
              </span>
            </div>
          </button>

          <div v-if="filteredItems.length === 0" class="p-8 text-center text-surface-500">
            No items in queue
          </div>
        </div>

        <div class="p-4 border-t border-surface-200 dark:border-surface-800 text-sm text-surface-500">
          {{ matching.currentPosition }}
        </div>
      </Card>

      <!-- Current item detail -->
      <Card class="flex-1 flex flex-col" padding="none">
        <template v-if="matching.currentItem">
          <!-- Item header -->
          <div class="p-6 border-b border-surface-200 dark:border-surface-800">
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-xl font-bold text-surface-900 dark:text-white">
                  {{ matching.currentItem.originalTitle }}
                </h2>
                <div class="flex items-center gap-4 mt-2 text-sm text-surface-500">
                  <span>{{ matching.currentItem.originalWriter || 'Unknown' }}</span>
                  <span>{{ matching.currentItem.source }}</span>
                  <span class="font-medium text-surface-900 dark:text-white">
                    {{ formatCurrency(matching.currentItem.amount, matching.currentItem.currency) }}
                  </span>
                </div>
              </div>
              <ConfidenceIndicator :value="matching.currentItem.confidence" size="lg" />
            </div>
          </div>

          <!-- Candidates -->
          <div class="flex-1 overflow-y-auto p-6">
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-4">
              Match Candidates
            </h3>

            <div class="space-y-4">
              <div
                v-for="(candidate, index) in matching.currentItem.candidates"
                :key="candidate.workId"
                :class="[
                  'p-4 rounded-lg border-2 transition-all cursor-pointer',
                  selectedCandidate === candidate.workId
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700',
                ]"
                @click="selectedCandidate = candidate.workId"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <kbd class="kbd">{{ index + 1 }}</kbd>
                      <p class="font-medium text-surface-900 dark:text-white">
                        {{ candidate.workTitle }}
                      </p>
                      <Badge
                        :variant="candidate.matchType === 'exact' ? 'success' : candidate.matchType === 'fuzzy' ? 'warning' : 'primary'"
                        size="sm"
                      >
                        {{ candidate.matchType }}
                      </Badge>
                    </div>
                    <p class="text-sm text-surface-500 mt-1">
                      {{ candidate.writers.join(', ') }}
                    </p>
                    <p v-if="candidate.iswc" class="text-xs font-mono text-surface-400 mt-1">
                      {{ candidate.iswc }}
                    </p>
                    <p v-if="candidate.explanation" class="text-xs text-surface-500 mt-2 italic">
                      {{ candidate.explanation }}
                    </p>
                  </div>
                  <div class="text-right">
                    <ConfidenceIndicator :value="candidate.score" />
                  </div>
                </div>
              </div>

              <div
                v-if="matching.currentItem.candidates.length === 0"
                class="text-center py-8 text-surface-500"
              >
                No candidates found for this item
              </div>
            </div>
          </div>

          <!-- Actions bar -->
          <div class="p-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    v-model="matching.autoAdvance"
                    type="checkbox"
                    class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600"
                  />
                  <span class="text-surface-600 dark:text-surface-400">Auto-advance</span>
                </label>
              </div>

              <div class="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  :icon="ArrowLeftIcon"
                  :disabled="matching.currentIndex === 0"
                  @click="matching.previousItem()"
                >
                  Previous
                </Button>

                <div class="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    :icon="ForwardIcon"
                    @click="skip"
                    title="Skip (S)"
                  >
                    Skip
                  </Button>
                  <Button
                    variant="danger"
                    :icon="XMarkIcon"
                    @click="reject"
                    title="Reject (R)"
                  >
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    :icon="CheckIcon"
                    :disabled="!selectedCandidate && !matching.topCandidate"
                    @click="accept"
                    title="Accept (A)"
                  >
                    Accept
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  :icon="ArrowRightIcon"
                  icon-position="right"
                  :disabled="matching.currentIndex >= matching.items.length - 1"
                  @click="matching.nextItem()"
                >
                  Next
                </Button>
              </div>
            </div>

            <!-- Keyboard hints -->
            <div class="flex items-center justify-center gap-6 mt-3 text-xs text-surface-400">
              <span><kbd class="kbd">J</kbd> / <kbd class="kbd">K</kbd> Navigate</span>
              <span><kbd class="kbd">1-9</kbd> Select candidate</span>
              <span><kbd class="kbd">A</kbd> Accept</span>
              <span><kbd class="kbd">R</kbd> Reject</span>
              <span><kbd class="kbd">S</kbd> Skip</span>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div v-else class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <CheckCircleIcon class="w-16 h-16 mx-auto text-success-500 mb-4" />
            <h2 class="text-xl font-bold text-surface-900 dark:text-white mb-2">
              All caught up!
            </h2>
            <p class="text-surface-500">
              No items pending review in the queue.
            </p>
          </div>
        </div>
      </Card>
    </div>

    <!-- Keyboard shortcuts modal -->
    <KeyboardShortcutsModal v-model="showShortcuts" />
  </div>
</template>

<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  ForwardIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from '@heroicons/vue/24/outline';

const matching = useMatchingStore();

const showFilters = ref(false);
const showShortcuts = ref(false);
const queueSearch = ref('');
const selectedCandidate = ref<string | null>(null);

const filteredItems = computed(() => {
  if (!queueSearch.value) return matching.items;
  const query = queueSearch.value.toLowerCase();
  return matching.items.filter(
    (item) =>
      item.originalTitle.toLowerCase().includes(query) ||
      item.originalWriter?.toLowerCase().includes(query)
  );
});

function getStatusVariant(status: string) {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
    pending: 'warning',
    matched: 'success',
    rejected: 'error',
    skipped: 'neutral',
    new_work: 'primary',
  };
  return variants[status] || 'neutral';
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

async function accept() {
  const candidateId = selectedCandidate.value || matching.topCandidate?.workId;
  if (candidateId) {
    await matching.acceptMatch(candidateId);
    selectedCandidate.value = null;
  }
}

async function reject() {
  await matching.rejectMatch();
  selectedCandidate.value = null;
}

async function skip() {
  await matching.skipItem();
  selectedCandidate.value = null;
}

// Keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  // Don't handle if in input
  if ((e.target as HTMLElement).tagName === 'INPUT') return;

  switch (e.key.toLowerCase()) {
    case 'j':
      e.preventDefault();
      matching.nextItem();
      selectedCandidate.value = null;
      break;
    case 'k':
      e.preventDefault();
      matching.previousItem();
      selectedCandidate.value = null;
      break;
    case 'a':
      e.preventDefault();
      accept();
      break;
    case 'r':
      e.preventDefault();
      reject();
      break;
    case 's':
      e.preventDefault();
      skip();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      const candidate = matching.currentItem?.candidates[index];
      if (candidate) {
        selectedCandidate.value = candidate.workId;
      }
      break;
    case 'enter':
      e.preventDefault();
      if (selectedCandidate.value) {
        accept();
      }
      break;
  }
}

onMounted(() => {
  matching.fetchQueue();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// Reset selection when current item changes
watch(
  () => matching.currentItem,
  () => {
    selectedCandidate.value = null;
  }
);
</script>
