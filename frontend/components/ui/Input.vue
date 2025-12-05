<template>
  <div :class="wrapperClasses">
    <label v-if="label" :for="inputId" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
      {{ label }}
      <span v-if="required" class="text-error-500">*</span>
    </label>

    <div class="relative">
      <!-- Leading icon -->
      <div v-if="$slots.leading || leadingIcon" class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <slot name="leading">
          <component :is="leadingIcon" class="w-5 h-5 text-surface-400" />
        </slot>
      </div>

      <input
        :id="inputId"
        ref="inputRef"
        v-model="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autocomplete="autocomplete"
        :class="inputClasses"
        v-bind="$attrs"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      />

      <!-- Trailing icon or action -->
      <div v-if="$slots.trailing || trailingIcon || clearable" class="absolute inset-y-0 right-0 pr-3 flex items-center">
        <button
          v-if="clearable && modelValue"
          type="button"
          class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
          @click="clear"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
        <slot v-else name="trailing">
          <component :is="trailingIcon" class="w-5 h-5 text-surface-400" />
        </slot>
      </div>
    </div>

    <!-- Help text or error -->
    <p v-if="error" class="mt-1 text-sm text-error-600 dark:text-error-400">
      {{ error }}
    </p>
    <p v-else-if="hint" class="mt-1 text-sm text-surface-500">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/20/solid';
import type { Component } from 'vue';

interface Props {
  modelValue?: string | number;
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
  label?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  clearable?: boolean;
  autocomplete?: string;
  leadingIcon?: Component;
  trailingIcon?: Component;
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  readonly: false,
  required: false,
  clearable: false,
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number | undefined];
  'focus': [event: FocusEvent];
  'blur': [event: FocusEvent];
}>();

const modelValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const inputRef = ref<HTMLInputElement>();
const inputId = useId();

const wrapperClasses = computed(() => [
  props.disabled ? 'opacity-50' : '',
]);

const inputClasses = computed(() => {
  const base = [
    'w-full rounded-lg border bg-white dark:bg-surface-900',
    'text-surface-900 dark:text-surface-100',
    'placeholder:text-surface-400 dark:placeholder:text-surface-500',
    'transition-colors duration-200',
    'focus:outline-none focus:ring-1',
  ];

  const hasError = !!props.error;
  const borderColor = hasError
    ? 'border-error-500 focus:border-error-500 focus:ring-error-500'
    : 'border-surface-300 dark:border-surface-700 focus:border-primary-500 focus:ring-primary-500';

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  const hasLeading = !!props.leadingIcon;
  const hasTrailing = !!props.trailingIcon || props.clearable;

  return [
    ...base,
    borderColor,
    sizes[props.size],
    hasLeading ? 'pl-10' : '',
    hasTrailing ? 'pr-10' : '',
    props.disabled ? 'cursor-not-allowed' : '',
  ];
});

function clear() {
  emit('update:modelValue', '');
  inputRef.value?.focus();
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus, inputRef });
</script>
