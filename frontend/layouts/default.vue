<template>
  <div class="min-h-screen bg-black">
    <!-- Sidebar -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-fluid',
        'bg-gradient-to-b from-white/[0.08] via-white/[0.04] to-transparent',
        'backdrop-blur-2xl',
        'border-r border-white/10',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <!-- Logo -->
      <div class="flex items-center gap-3 h-16 px-6 border-b border-white/10">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-white/30 via-white/20 to-white/10 flex items-center justify-center shadow-chrome-md border border-white/20">
          <span class="text-white font-bold text-lg">P</span>
        </div>
        <span class="font-semibold text-white text-lg">PubFlow</span>
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
        <div class="my-4 border-t border-white/10" />

        <p class="px-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
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
      <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-gradient-to-t from-black/50 to-transparent">
        <TenantSelector />
      </div>
    </aside>

    <!-- Mobile sidebar backdrop -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
      @click="sidebarOpen = false"
    />

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top bar -->
      <header class="sticky top-0 z-30 h-16 bg-black/60 backdrop-blur-2xl border-b border-white/10">
        <div class="flex items-center justify-between h-full px-4 lg:px-6">
          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors"
            @click="sidebarOpen = true"
          >
            <Bars3Icon class="w-6 h-6 text-zinc-400" />
          </button>

          <!-- Breadcrumb -->
          <div class="hidden lg:flex items-center gap-2 text-sm">
            <NuxtLink to="/" class="text-zinc-500 hover:text-white transition-colors">
              Home
            </NuxtLink>
            <ChevronRightIcon class="w-4 h-4 text-zinc-600" />
            <span class="text-white font-medium">{{ pageTitle }}</span>
          </div>

          <!-- Right side actions -->
          <div class="flex items-center gap-2">
            <!-- Global search -->
            <button
              class="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 bg-white/5 rounded-full hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-300"
              @click="openSearch"
            >
              <MagnifyingGlassIcon class="w-4 h-4" />
              <span class="hidden md:inline">Search</span>
              <kbd class="hidden md:inline ml-2 px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-zinc-500 border border-white/10">
                ⌘K
              </kbd>
            </button>

            <!-- Notifications -->
            <button class="relative p-2.5 rounded-full hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
              <BellIcon class="w-5 h-5 text-zinc-400" />
              <span
                v-if="notificationCount > 0"
                class="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full ring-2 ring-black shadow-glow-blue"
              />
            </button>

            <!-- Dark mode toggle -->
            <button
              class="p-2.5 rounded-full hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
              @click="toggleDarkMode"
            >
              <SunIcon v-if="isDark" class="w-5 h-5 text-zinc-400" />
              <MoonIcon v-else class="w-5 h-5 text-zinc-400" />
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
  CircleStackIcon,
} from '@heroicons/vue/24/outline';

const route = useRoute();
const colorMode = useColorMode();

const sidebarOpen = ref(false);
const searchOpen = ref(false);
const shortcutsOpen = ref(false);
const notificationCount = ref(3);

const isDark = computed(() => colorMode.preference === 'dark');

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
    '/data': 'Music Data Hub',
    '/data/tracks': 'Track Details',
    '/settings': 'Settings',
  };
  return titles[route.path] || 'PubFlow AI';
});

const navigationItems = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/catalog/works', icon: MusicalNoteIcon, label: 'Works', badge: null },
  { to: '/catalog/writers', icon: UserGroupIcon, label: 'Writers' },
  { to: '/data', icon: CircleStackIcon, label: 'Data Hub', badge: 'New' },
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
