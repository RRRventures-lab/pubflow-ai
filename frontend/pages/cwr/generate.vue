<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-surface-900 dark:text-white">Generate CWR File</h1>
      <p class="text-surface-500 mt-1">
        Export your works to Common Works Registration format
      </p>
    </div>

    <!-- Step indicator -->
    <div class="mb-8">
      <div class="flex items-center">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="flex items-center"
        >
          <div
            :class="[
              'flex items-center justify-center w-10 h-10 rounded-full font-medium transition-colors',
              currentStep > index
                ? 'bg-primary-600 text-white'
                : currentStep === index
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 ring-2 ring-primary-600'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-400',
            ]"
          >
            <CheckIcon v-if="currentStep > index" class="w-5 h-5" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span
            :class="[
              'ml-3 text-sm font-medium',
              currentStep >= index
                ? 'text-surface-900 dark:text-white'
                : 'text-surface-400',
            ]"
          >
            {{ step.label }}
          </span>
          <ChevronRightIcon
            v-if="index < steps.length - 1"
            class="w-5 h-5 mx-4 text-surface-300"
          />
        </div>
      </div>
    </div>

    <!-- Step content -->
    <Card divided>
      <!-- Step 1: Select Works -->
      <div v-if="currentStep === 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-surface-900 dark:text-white">
            Select Works to Export
          </h2>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" @click="selectAll">
              Select All
            </Button>
            <Button variant="ghost" size="sm" @click="deselectAll">
              Deselect All
            </Button>
          </div>
        </div>

        <div class="mb-4">
          <Input
            v-model="workSearch"
            placeholder="Search works..."
            :leading-icon="MagnifyingGlassIcon"
            clearable
          />
        </div>

        <div class="border border-surface-200 dark:border-surface-800 rounded-lg max-h-96 overflow-y-auto">
          <div
            v-for="work in filteredWorks"
            :key="work.id"
            :class="[
              'flex items-center gap-4 px-4 py-3 border-b border-surface-100 dark:border-surface-800 last:border-0',
              'hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer transition-colors',
            ]"
            @click="toggleWorkSelection(work.id)"
          >
            <input
              type="checkbox"
              :checked="selectedWorkIds.has(work.id)"
              class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600"
              @click.stop="toggleWorkSelection(work.id)"
            />
            <div class="flex-1 min-w-0">
              <p class="font-medium text-surface-900 dark:text-white truncate">
                {{ work.title }}
              </p>
              <p class="text-sm text-surface-500">
                {{ work.writers?.map((w: any) => `${w.firstName} ${w.lastName}`).join(', ') || 'No writers' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Badge v-if="work.iswc" variant="success" size="sm">ISWC</Badge>
              <Badge v-else variant="warning" size="sm">No ISWC</Badge>
              <Badge :variant="getStatusVariant(work.status)" size="sm">
                {{ work.status }}
              </Badge>
            </div>
          </div>
        </div>

        <p class="text-sm text-surface-500 mt-4">
          {{ selectedWorkIds.size }} works selected
        </p>
      </div>

      <!-- Step 2: Configure Options -->
      <div v-if="currentStep === 1">
        <h2 class="text-lg font-semibold text-surface-900 dark:text-white mb-6">
          CWR Configuration
        </h2>

        <div class="space-y-6">
          <div class="grid md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                CWR Version
              </label>
              <select v-model="cwrConfig.version" class="input">
                <option value="21">CWR 2.1 (Standard)</option>
                <option value="22">CWR 2.2 (Enhanced)</option>
                <option value="30">CWR 3.0 (Latest)</option>
              </select>
              <p class="text-xs text-surface-500 mt-1">
                Most societies accept CWR 2.1
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                Transaction Type
              </label>
              <select v-model="cwrConfig.transactionType" class="input">
                <option value="NWR">NWR - New Work Registration</option>
                <option value="REV">REV - Revised Registration</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                Receiving Society
              </label>
              <select v-model="cwrConfig.receivingSociety" class="input">
                <option value="ASCAP">ASCAP</option>
                <option value="BMI">BMI</option>
                <option value="SESAC">SESAC</option>
                <option value="PRS">PRS</option>
                <option value="GEMA">GEMA</option>
                <option value="SACEM">SACEM</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                Sender ID
              </label>
              <Input
                v-model="cwrConfig.senderId"
                placeholder="Your publisher code"
              />
            </div>
          </div>

          <div class="border-t border-surface-200 dark:border-surface-800 pt-6">
            <h3 class="text-sm font-semibold text-surface-900 dark:text-white mb-4">
              Include Optional Records
            </h3>
            <div class="space-y-3">
              <label class="flex items-center gap-3">
                <input
                  v-model="cwrConfig.includeRecordings"
                  type="checkbox"
                  class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600"
                />
                <span class="text-sm text-surface-700 dark:text-surface-300">
                  Include recording information (REC records)
                </span>
              </label>
              <label class="flex items-center gap-3">
                <input
                  v-model="cwrConfig.includeAlternateTitles"
                  type="checkbox"
                  class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600"
                />
                <span class="text-sm text-surface-700 dark:text-surface-300">
                  Include alternate titles (ALT records)
                </span>
              </label>
              <label class="flex items-center gap-3">
                <input
                  v-model="cwrConfig.includePerformers"
                  type="checkbox"
                  class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600"
                />
                <span class="text-sm text-surface-700 dark:text-surface-300">
                  Include performing artists (PER records)
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: Validate -->
      <div v-if="currentStep === 2">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-surface-900 dark:text-white">
            Pre-flight Validation
          </h2>
          <Button
            v-if="!validationComplete"
            :loading="validating"
            @click="runValidation"
          >
            Run Validation
          </Button>
          <Badge v-else-if="validationErrors.length === 0" variant="success">
            <CheckCircleIcon class="w-4 h-4 mr-1" />
            All Checks Passed
          </Badge>
        </div>

        <div v-if="validating" class="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span class="ml-3 text-surface-500">Validating works...</span>
        </div>

        <div v-else-if="validationComplete" class="space-y-4">
          <!-- Errors -->
          <div
            v-if="validationErrors.length > 0"
            class="p-4 bg-error-50 dark:bg-error-900/20 rounded-lg"
          >
            <div class="flex items-center gap-2 text-error-700 dark:text-error-400 font-medium mb-2">
              <XCircleIcon class="w-5 h-5" />
              {{ validationErrors.length }} Error{{ validationErrors.length > 1 ? 's' : '' }}
            </div>
            <ul class="space-y-1 text-sm text-error-600 dark:text-error-300">
              <li v-for="(error, i) in validationErrors.slice(0, 5)" :key="i">
                {{ error.message }}
              </li>
              <li v-if="validationErrors.length > 5" class="text-error-500">
                ... and {{ validationErrors.length - 5 }} more
              </li>
            </ul>
          </div>

          <!-- Warnings -->
          <div
            v-if="validationWarnings.length > 0"
            class="p-4 bg-warning-50 dark:bg-warning-900/20 rounded-lg"
          >
            <div class="flex items-center gap-2 text-warning-700 dark:text-warning-400 font-medium mb-2">
              <ExclamationTriangleIcon class="w-5 h-5" />
              {{ validationWarnings.length }} Warning{{ validationWarnings.length > 1 ? 's' : '' }}
            </div>
            <ul class="space-y-1 text-sm text-warning-600 dark:text-warning-300">
              <li v-for="(warning, i) in validationWarnings.slice(0, 5)" :key="i">
                {{ warning.message }}
              </li>
              <li v-if="validationWarnings.length > 5" class="text-warning-500">
                ... and {{ validationWarnings.length - 5 }} more
              </li>
            </ul>
          </div>

          <!-- Info -->
          <div
            v-if="validationInfo.length > 0"
            class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
          >
            <div class="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium mb-2">
              <InformationCircleIcon class="w-5 h-5" />
              {{ validationInfo.length }} Info
            </div>
            <ul class="space-y-1 text-sm text-blue-600 dark:text-blue-300">
              <li v-for="(info, i) in validationInfo.slice(0, 3)" :key="i">
                {{ info.message }}
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="text-center py-12 text-surface-500">
          Click "Run Validation" to check your works before generating
        </div>
      </div>

      <!-- Step 4: Generate -->
      <div v-if="currentStep === 3">
        <div class="text-center py-8">
          <div
            v-if="generating"
            class="flex flex-col items-center"
          >
            <Spinner size="xl" />
            <p class="mt-4 text-lg font-medium text-surface-900 dark:text-white">
              Generating CWR file...
            </p>
            <p class="text-surface-500">
              Processing {{ selectedWorkIds.size }} works
            </p>
          </div>

          <div v-else-if="generatedFile">
            <CheckCircleIcon class="w-16 h-16 mx-auto text-success-500 mb-4" />
            <h2 class="text-xl font-bold text-surface-900 dark:text-white mb-2">
              CWR File Generated Successfully!
            </h2>
            <p class="text-surface-500 mb-6">
              {{ generatedFile.filename }} ({{ formatFileSize(generatedFile.size) }})
            </p>
            <div class="flex items-center justify-center gap-4">
              <Button :icon="ArrowDownTrayIcon" @click="downloadFile">
                Download CWR
              </Button>
              <Button variant="secondary" :icon="EyeIcon" @click="previewFile">
                Preview
              </Button>
              <Button variant="ghost" @click="reset">
                Generate Another
              </Button>
            </div>
          </div>

          <div v-else>
            <DocumentTextIcon class="w-16 h-16 mx-auto text-surface-300 mb-4" />
            <h2 class="text-xl font-bold text-surface-900 dark:text-white mb-2">
              Ready to Generate
            </h2>
            <p class="text-surface-500 mb-6">
              {{ selectedWorkIds.size }} works will be exported to CWR {{ cwrConfig.version }}
            </p>
            <Button size="lg" @click="generateFile">
              Generate CWR File
            </Button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <template #footer>
        <Button
          v-if="currentStep > 0"
          variant="secondary"
          @click="previousStep"
        >
          Back
        </Button>
        <div class="flex-1" />
        <Button
          v-if="currentStep < 3"
          :disabled="!canProceed"
          @click="nextStep"
        >
          Continue
        </Button>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import {
  CheckIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';

interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  workId?: string;
}

const works = useWorksStore();

const steps = [
  { id: 'select', label: 'Select Works' },
  { id: 'configure', label: 'Configure' },
  { id: 'validate', label: 'Validate' },
  { id: 'generate', label: 'Generate' },
];

const currentStep = ref(0);
const workSearch = ref('');
const selectedWorkIds = ref(new Set<string>());

const cwrConfig = reactive({
  version: '21',
  transactionType: 'NWR',
  receivingSociety: 'ASCAP',
  senderId: '',
  includeRecordings: true,
  includeAlternateTitles: true,
  includePerformers: false,
});

const validating = ref(false);
const validationComplete = ref(false);
const validationIssues = ref<ValidationIssue[]>([]);

const generating = ref(false);
const generatedFile = ref<{ filename: string; size: number; url: string } | null>(null);

// Demo works
const allWorks = ref([
  { id: '1', title: 'Midnight Dreams', iswc: 'T-123456789-1', status: 'active', writers: [{ firstName: 'John', lastName: 'Smith' }] },
  { id: '2', title: 'Summer Breeze', iswc: null, status: 'active', writers: [{ firstName: 'Jane', lastName: 'Doe' }] },
  { id: '3', title: 'Electric Pulse', iswc: 'T-987654321-2', status: 'registered', writers: [{ firstName: 'Alice', lastName: 'Johnson' }] },
  { id: '4', title: 'Ocean Waves', iswc: 'T-111222333-4', status: 'active', writers: [{ firstName: 'Bob', lastName: 'Wilson' }] },
  { id: '5', title: 'Mountain High', iswc: null, status: 'draft', writers: [{ firstName: 'Chris', lastName: 'Brown' }] },
]);

const filteredWorks = computed(() => {
  if (!workSearch.value) return allWorks.value;
  const query = workSearch.value.toLowerCase();
  return allWorks.value.filter(
    (w) =>
      w.title.toLowerCase().includes(query) ||
      w.writers?.some((wr: any) =>
        `${wr.firstName} ${wr.lastName}`.toLowerCase().includes(query)
      )
  );
});

const validationErrors = computed(() =>
  validationIssues.value.filter((i) => i.type === 'error')
);

const validationWarnings = computed(() =>
  validationIssues.value.filter((i) => i.type === 'warning')
);

const validationInfo = computed(() =>
  validationIssues.value.filter((i) => i.type === 'info')
);

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 0:
      return selectedWorkIds.value.size > 0;
    case 1:
      return cwrConfig.senderId.length > 0;
    case 2:
      return validationComplete.value && validationErrors.value.length === 0;
    default:
      return true;
  }
});

function getStatusVariant(status: string) {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
    active: 'success',
    registered: 'primary',
    draft: 'neutral',
    disputed: 'error',
  };
  return variants[status] || 'neutral';
}

function toggleWorkSelection(id: string) {
  if (selectedWorkIds.value.has(id)) {
    selectedWorkIds.value.delete(id);
  } else {
    selectedWorkIds.value.add(id);
  }
}

function selectAll() {
  filteredWorks.value.forEach((w) => selectedWorkIds.value.add(w.id));
}

function deselectAll() {
  selectedWorkIds.value.clear();
}

async function runValidation() {
  validating.value = true;
  validationIssues.value = [];

  // Simulate validation
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Demo validation results
  const selectedWorks = allWorks.value.filter((w) => selectedWorkIds.value.has(w.id));

  for (const work of selectedWorks) {
    if (!work.iswc) {
      validationIssues.value.push({
        type: 'warning',
        code: 'MISSING_ISWC',
        message: `Work "${work.title}" has no ISWC - it will be registered as new`,
        workId: work.id,
      });
    }
    if (work.status === 'draft') {
      validationIssues.value.push({
        type: 'error',
        code: 'DRAFT_STATUS',
        message: `Work "${work.title}" is in draft status and cannot be exported`,
        workId: work.id,
      });
    }
  }

  validationIssues.value.push({
    type: 'info',
    code: 'TOTAL_WORKS',
    message: `${selectedWorkIds.value.size} works will be included in the CWR file`,
  });

  validating.value = false;
  validationComplete.value = true;
}

async function generateFile() {
  generating.value = true;

  // Simulate generation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  generatedFile.value = {
    filename: `CWR_${cwrConfig.receivingSociety}_${new Date().toISOString().split('T')[0]}.V21`,
    size: selectedWorkIds.value.size * 2500, // ~2.5KB per work
    url: '#',
  };

  generating.value = false;
}

function downloadFile() {
  // TODO: Implement actual download
  console.log('Downloading file:', generatedFile.value?.filename);
}

function previewFile() {
  navigateTo('/cwr/viewer/preview');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++;
  }
}

function previousStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
}

function reset() {
  currentStep.value = 0;
  selectedWorkIds.value.clear();
  validationComplete.value = false;
  validationIssues.value = [];
  generatedFile.value = null;
}

// Initial fetch
onMounted(() => {
  works.fetchWorks();
});
</script>
