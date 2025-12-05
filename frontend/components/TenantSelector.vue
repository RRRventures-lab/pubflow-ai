<template>
  <Listbox v-model="selectedTenant">
    <div class="relative">
      <ListboxButton
        class="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <div class="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900 flex items-center justify-center">
          <span class="text-accent-700 dark:text-accent-300 text-sm font-medium">
            {{ selectedTenant?.name?.charAt(0) || 'T' }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-surface-900 dark:text-white truncate">
            {{ selectedTenant?.name || 'Select Tenant' }}
          </p>
          <p class="text-xs text-surface-500 truncate">
            {{ selectedTenant?.worksCount?.toLocaleString() || 0 }} works
          </p>
        </div>
        <ChevronUpDownIcon class="w-5 h-5 text-surface-400 shrink-0" />
      </ListboxButton>

      <transition
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <ListboxOptions
          class="absolute bottom-full left-0 right-0 mb-2 py-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-60 overflow-auto focus:outline-none"
        >
          <ListboxOption
            v-for="tenant in tenants"
            :key="tenant.id"
            v-slot="{ active, selected }"
            :value="tenant"
            as="template"
          >
            <li
              :class="[
                'flex items-center gap-3 px-3 py-2 cursor-pointer',
                active ? 'bg-surface-100 dark:bg-surface-700' : '',
              ]"
            >
              <div class="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900 flex items-center justify-center">
                <span class="text-accent-700 dark:text-accent-300 text-sm font-medium">
                  {{ tenant.name.charAt(0) }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-surface-900 dark:text-white truncate">
                  {{ tenant.name }}
                </p>
                <p class="text-xs text-surface-500">
                  {{ tenant.worksCount.toLocaleString() }} works
                </p>
              </div>
              <CheckIcon v-if="selected" class="w-5 h-5 text-primary-600" />
            </li>
          </ListboxOption>
        </ListboxOptions>
      </transition>
    </div>
  </Listbox>
</template>

<script setup lang="ts">
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from '@headlessui/vue';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/vue/20/solid';

interface Tenant {
  id: string;
  name: string;
  worksCount: number;
}

// This would come from a Pinia store in production
const tenants = ref<Tenant[]>([
  { id: '1', name: 'Universal Music Publishing', worksCount: 125000 },
  { id: '2', name: 'Sony Music Publishing', worksCount: 98500 },
  { id: '3', name: 'Warner Chappell Music', worksCount: 87200 },
  { id: '4', name: 'Kobalt Music', worksCount: 45000 },
]);

const selectedTenant = ref<Tenant>(tenants.value[0]);

// Watch for tenant changes and update global state
watch(selectedTenant, (tenant) => {
  // Would dispatch to Pinia store
  console.log('Switched to tenant:', tenant.name);
});
</script>
