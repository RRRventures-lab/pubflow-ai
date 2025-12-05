<template>
  <div class="min-h-screen bg-surface-50 dark:bg-surface-950">
    <!-- Sidebar -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-out',
        'bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <!-- Logo -->
      <div class="flex items-center gap-3 h-16 px-6 border-b border-surface-200 dark:border-surface-800">
        <div class="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <span class="text-white font-bold text-sm">PF</span>
        </div>
        <span class="font-semibold text-surface-900 dark:text-white">PubFlow AI</span>
      </div>

      <!-- Navigation -->
      <nav class="p-4 space-y-1">
        <NavItem
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          :badge="item.badge"
        />

        <!-- Divider -->
        <div class="my-4 border-t border-surface-200 dark:border-surface-800" />

        <p class="px-3 text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
          AI Tools
        </p>

        <NavItem
          v-for="item in aiNavigationItems"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          :badge="item.badge"
        />
      </nav>

      <!-- Tenant Selector -->
      <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-surface-200 dark:border-surface-800">
        <TenantSelector />
      </div>
    </aside>

    <!-- Mobile sidebar backdrop -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-black/50 lg:hidden"
      @click="sidebarOpen = false"
    />

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top bar -->
      <header class="sticky top-0 z-30 h-16 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm border-b border-surface-200 dark:border-surface-800">
        <div class="flex items-center justify-between h-full px-4 lg:px-6">
          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
            @click="sidebarOpen = true"
          >
            <Bars3Icon class="w-6 h-6 text-surface-600 dark:text-surface-400" />
          </button>

          <!-- Breadcrumb -->
          <div class="hidden lg:flex items-center gap-2 text-sm">
            <NuxtLink to="/" class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300">
              Home
            </NuxtLink>
            <ChevronRightIcon class="w-4 h-4 text-surface-400" />
            <span class="text-surface-900 dark:text-white font-medium">{{ pageTitle }}</span>
          </div>

          <!-- Right side actions -->
          <div class="flex items-center gap-2">
            <!-- Global search -->
            <button
              class="flex items-center gap-2 px-3 py-1.5 text-sm text-surface-500 bg-surface-100 dark:bg-surface-800 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
              @click="openSearch"
            >
              <MagnifyingGlassIcon class="w-4 h-4" />
              <span class="hidden md:inline">Search</span>
              <kbd class="kbd hidden md:inline">⌘K</kbd>
            </button>

            <!-- Notifications -->
            <button class="relative p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">
              <BellIcon class="w-5 h-5 text-surface-600 dark:text-surface-400" />
              <span
                v-if="notificationCount > 0"
                class="absolute top-1 right-1 w-2 h-2 bg-error-500 rounded-full"
              />
            </button>

            <!-- Dark mode toggle -->
            <button
              class="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
              @click="toggleDarkMode"
            >
              <SunIcon v-if="isDark" class="w-5 h-5 text-surface-600 dark:text-surface-400" />
              <MoonIcon v-else class="w-5 h-5 text-surface-600 dark:text-surface-400" />
            </button>

            <!-- User menu -->
            <UserMenu />
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="p-4 lg:p-6">
        <slot />
      </main>
    </div>

    <!-- Global search modal -->
    <SearchModal v-model="searchOpen" />

    <!-- Keyboard shortcuts help -->
    <KeyboardShortcutsModal v-model="shortcutsOpen" />
  </div>
</template>

<script setup lang="ts">
import {
  Bars3Icon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/vue/24/outline';
import {
  HomeIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
} from '@heroicons/vue/24/outline';

const route = useRoute();
const colorMode = useColorMode();

const sidebarOpen = ref(false);
const searchOpen = ref(false);
const shortcutsOpen = ref(false);
const notificationCount = ref(3);

const isDark = computed(() => colorMode.value === 'dark');

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/catalog/works': 'Works Catalog',
    '/catalog/writers': 'Writers',
    '/catalog/recordings': 'Recordings',
    '/cwr/generate': 'Generate CWR',
    '/cwr/history': 'CWR History',
    '/royalties/statements': 'Statements',
    '/royalties/matching': 'Matching Queue',
    '/royalties/distributions': 'Distributions',
    '/ai': 'AI Intelligence',
    '/ai/enrichment': 'AI Enrichment',
    '/ai/conflicts': 'Conflict Detection',
    '/settings': 'Settings',
  };
  return titles[route.path] || 'PubFlow AI';
});

const navigationItems = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/catalog/works', icon: MusicalNoteIcon, label: 'Works', badge: null },
  { to: '/catalog/writers', icon: UserGroupIcon, label: 'Writers' },
  { to: '/cwr/generate', icon: DocumentTextIcon, label: 'CWR Files' },
  { to: '/royalties/statements', icon: CurrencyDollarIcon, label: 'Royalties' },
];

const aiNavigationItems = [
  { to: '/ai', icon: SparklesIcon, label: 'AI Dashboard' },
  { to: '/ai/enrichment', icon: SparklesIcon, label: 'Enrichment', badge: 12 },
  { to: '/ai/conflicts', icon: ExclamationTriangleIcon, label: 'Conflicts', badge: 3 },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
];

function toggleDarkMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark';
}

function openSearch() {
  searchOpen.value = true;
}

// Global keyboard shortcuts
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    // ⌘K or Ctrl+K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchOpen.value = true;
    }
    // ? for shortcuts help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        shortcutsOpen.value = true;
      }
    }
  };

  window.addEventListener('keydown', handleKeydown);
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
});
</script>
