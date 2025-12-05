<template>
  <div class="flex items-center justify-between py-1">
    <span class="text-sm text-surface-600 dark:text-surface-400">
      {{ description }}
    </span>
    <div class="flex items-center gap-1">
      <kbd v-for="key in keys" :key="key" class="kbd">
        {{ key }}
      </kbd>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  keys: string[];
  description: string;
}

defineProps<Props>();
</script>
