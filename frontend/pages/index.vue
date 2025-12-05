<template>
  <div class="space-y-6">
    <!-- Welcome header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-white">
          Dashboard
        </h1>
        <p class="text-surface-500 mt-1">
          Welcome back, {{ auth.user?.name?.split(' ')[0] || 'there' }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="secondary" :icon="ArrowPathIcon" @click="refresh">
          Refresh
        </Button>
        <Button :icon="PlusIcon" @click="navigateTo('/catalog/works/new')">
          New Work
        </Button>
      </div>
    </div>

    <!-- Stats cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Total Works"
        :value="tenant.stats?.worksTotal || 0"
        :trend="tenant.stats?.worksThisMonth"
        trend-label="this month"
        :icon="MusicalNoteIcon"
        icon-color="bg-primary-500"
      />
      <StatsCard
        title="Writers"
        :value="tenant.stats?.writersTotal || 0"
        :icon="UserGroupIcon"
        icon-color="bg-accent-500"
      />
      <StatsCard
        title="Pending Review"
        :value="tenant.stats?.pendingReview || 0"
        :icon="ClockIcon"
        icon-color="bg-warning-500"
        :alert="(tenant.stats?.pendingReview || 0) > 50"
      />
      <StatsCard
        title="AI Accuracy"
        :value="`${tenant.stats?.matchingAccuracy || 95}%`"
        :icon="SparklesIcon"
        icon-color="bg-success-500"
      />
    </div>

    <!-- Main content grid -->
    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Recent works -->
      <Card title="Recent Works" class="lg:col-span-2" divided>
        <template #headerAction>
          <NuxtLink
            to="/catalog/works"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View all
          </NuxtLink>
        </template>

        <div class="divide-y divide-surface-100 dark:divide-surface-800">
          <div
            v-for="work in recentWorks"
            :key="work.id"
            class="py-3 flex items-center gap-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 -mx-6 px-6 cursor-pointer transition-colors"
            @click="navigateTo(`/catalog/works/${work.id}`)"
          >
            <div class="flex-1 min-w-0">
              <p class="font-medium text-surface-900 dark:text-white truncate">
                {{ work.title }}
              </p>
              <p class="text-sm text-surface-500 truncate">
                {{ work.writers.map((w) => `${w.firstName} ${w.lastName}`).join(', ') || 'No writers' }}
              </p>
            </div>
            <Badge :variant="getStatusVariant(work.status)">
              {{ work.status }}
            </Badge>
            <ChevronRightIcon class="w-5 h-5 text-surface-400" />
          </div>

          <div v-if="recentWorks.length === 0" class="py-8 text-center text-surface-500">
            No recent works
          </div>
        </div>
      </Card>

      <!-- Quick actions -->
      <div class="space-y-6">
        <!-- AI Insights -->
        <Card title="AI Insights" divided>
          <div class="space-y-4">
            <div
              v-if="tenant.stats?.aiEnrichmentsProposed"
              class="flex items-center gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20"
            >
              <SparklesIcon class="w-5 h-5 text-primary-600" />
              <div class="flex-1">
                <p class="text-sm font-medium text-surface-900 dark:text-white">
                  {{ tenant.stats.aiEnrichmentsProposed }} enrichment proposals
                </p>
                <p class="text-xs text-surface-500">
                  AI found new metadata for your works
                </p>
              </div>
              <Button size="sm" variant="ghost" @click="navigateTo('/ai/enrichment')">
                Review
              </Button>
            </div>

            <div
              v-if="tenant.stats?.pendingReview"
              class="flex items-center gap-3 p-3 rounded-lg bg-warning-50 dark:bg-warning-900/20"
            >
              <ExclamationTriangleIcon class="w-5 h-5 text-warning-600" />
              <div class="flex-1">
                <p class="text-sm font-medium text-surface-900 dark:text-white">
                  {{ tenant.stats.pendingReview }} matches pending
                </p>
                <p class="text-xs text-surface-500">
                  Royalty matches need your review
                </p>
              </div>
              <Button size="sm" variant="ghost" @click="navigateTo('/royalties/matching')">
                Review
              </Button>
            </div>
          </div>
        </Card>

        <!-- Quick actions -->
        <Card title="Quick Actions" divided>
          <div class="space-y-2">
            <button
              v-for="action in quickActions"
              :key="action.label"
              class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-left"
              @click="action.action"
            >
              <div
                :class="[
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  action.iconBg,
                ]"
              >
                <component :is="action.icon" class="w-5 h-5 text-white" />
              </div>
              <div>
                <p class="text-sm font-medium text-surface-900 dark:text-white">
                  {{ action.label }}
                </p>
                <p class="text-xs text-surface-500">{{ action.description }}</p>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>

    <!-- Activity chart -->
    <Card title="Registration Activity" divided>
      <template #headerAction>
        <select
          v-model="chartPeriod"
          class="text-sm border border-surface-300 dark:border-surface-700 rounded-lg px-3 py-1.5 bg-white dark:bg-surface-900"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </template>

      <div class="h-64">
        <Line v-if="chartData" :data="chartData" :options="chartOptions" />
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowPathIcon,
  PlusIcon,
  ChevronRightIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  ClockIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  CloudArrowUpIcon,
  DocumentPlusIcon,
} from '@heroicons/vue/24/outline';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const auth = useAuthStore();
const tenant = useTenantStore();
const works = useWorksStore();

const chartPeriod = ref('30d');

// Demo recent works
const recentWorks = ref([
  {
    id: '1',
    title: 'Midnight Dreams',
    writers: [{ firstName: 'John', lastName: 'Smith' }],
    status: 'active',
  },
  {
    id: '2',
    title: 'Summer Breeze',
    writers: [{ firstName: 'Jane', lastName: 'Doe' }, { firstName: 'Bob', lastName: 'Wilson' }],
    status: 'registered',
  },
  {
    id: '3',
    title: 'Electric Pulse',
    writers: [{ firstName: 'Alice', lastName: 'Johnson' }],
    status: 'draft',
  },
  {
    id: '4',
    title: 'Ocean Waves',
    writers: [{ firstName: 'Chris', lastName: 'Brown' }],
    status: 'disputed',
  },
]);

const quickActions = [
  {
    icon: DocumentPlusIcon,
    iconBg: 'bg-primary-500',
    label: 'New Work',
    description: 'Register a new musical work',
    action: () => navigateTo('/catalog/works/new'),
  },
  {
    icon: DocumentTextIcon,
    iconBg: 'bg-success-500',
    label: 'Generate CWR',
    description: 'Export works to CWR format',
    action: () => navigateTo('/cwr/generate'),
  },
  {
    icon: CloudArrowUpIcon,
    iconBg: 'bg-accent-500',
    label: 'Upload Statement',
    description: 'Import royalty statement',
    action: () => navigateTo('/royalties/statements'),
  },
];

// Chart data
const chartData = computed(() => {
  const labels = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  // Demo data
  const data = Array.from({ length: 30 }, () => Math.floor(Math.random() * 50) + 10);

  return {
    labels,
    datasets: [
      {
        label: 'Works Registered',
        data,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
    },
    y: {
      beginAtZero: true,
    },
  },
};

function getStatusVariant(status: string) {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
    active: 'success',
    registered: 'primary',
    draft: 'neutral',
    disputed: 'error',
  };
  return variants[status] || 'neutral';
}

async function refresh() {
  await tenant.fetchStats();
  await works.fetchWorks();
}

// Initial fetch
onMounted(async () => {
  await tenant.fetchStats();
});
</script>
