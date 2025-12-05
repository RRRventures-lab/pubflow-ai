<template>
  <Menu as="div" class="relative">
    <MenuButton class="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
      <img
        v-if="user.avatar"
        :src="user.avatar"
        :alt="user.name"
        class="w-8 h-8 rounded-full"
      />
      <div
        v-else
        class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center"
      >
        <span class="text-primary-700 dark:text-primary-300 text-sm font-medium">
          {{ user.initials }}
        </span>
      </div>
    </MenuButton>

    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <MenuItems
        class="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg focus:outline-none py-1"
      >
        <!-- User info -->
        <div class="px-4 py-3 border-b border-surface-200 dark:border-surface-700">
          <p class="text-sm font-medium text-surface-900 dark:text-white">
            {{ user.name }}
          </p>
          <p class="text-xs text-surface-500 truncate">
            {{ user.email }}
          </p>
        </div>

        <div class="py-1">
          <MenuItem v-slot="{ active }">
            <NuxtLink
              to="/profile"
              :class="[
                'flex items-center gap-2 px-4 py-2 text-sm',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
                'text-surface-700 dark:text-surface-300',
              ]"
            >
              <UserIcon class="w-4 h-4" />
              Your Profile
            </NuxtLink>
          </MenuItem>

          <MenuItem v-slot="{ active }">
            <NuxtLink
              to="/settings"
              :class="[
                'flex items-center gap-2 px-4 py-2 text-sm',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
                'text-surface-700 dark:text-surface-300',
              ]"
            >
              <Cog6ToothIcon class="w-4 h-4" />
              Settings
            </NuxtLink>
          </MenuItem>

          <MenuItem v-slot="{ active }">
            <NuxtLink
              to="/api-keys"
              :class="[
                'flex items-center gap-2 px-4 py-2 text-sm',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
                'text-surface-700 dark:text-surface-300',
              ]"
            >
              <KeyIcon class="w-4 h-4" />
              API Keys
            </NuxtLink>
          </MenuItem>
        </div>

        <div class="border-t border-surface-200 dark:border-surface-700 py-1">
          <MenuItem v-slot="{ active }">
            <button
              :class="[
                'w-full flex items-center gap-2 px-4 py-2 text-sm',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
                'text-error-600 dark:text-error-400',
              ]"
              @click="logout"
            >
              <ArrowRightOnRectangleIcon class="w-4 h-4" />
              Sign out
            </button>
          </MenuItem>
        </div>
      </MenuItems>
    </transition>
  </Menu>
</template>

<script setup lang="ts">
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue';
import {
  UserIcon,
  Cog6ToothIcon,
  KeyIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/vue/24/outline';

// This would come from auth store
const user = ref({
  name: 'Gabriel Rothschild',
  email: 'gabriel@pubflow.ai',
  avatar: null,
  initials: 'GR',
});

function logout() {
  // Would call auth store logout
  navigateTo('/login');
}
</script>
