<template>
  <div class="min-h-screen flex items-center justify-center bg-black p-4">
    <!-- Background gradient effects -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl" />
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl" />
    </div>

    <div class="relative w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-white/30 via-white/20 to-white/10 shadow-chrome-md border border-white/20 mb-4">
          <span class="text-white font-bold text-2xl">P</span>
        </div>
        <h1 class="text-3xl font-bold text-white">PubFlow AI</h1>
        <p class="text-zinc-400 mt-2">Create your account</p>
      </div>

      <!-- Register form -->
      <Card variant="glass">
        <form @submit.prevent="handleSubmit" class="space-y-5">
          <!-- First & Last Name Row -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label for="firstName" class="block text-sm font-medium text-zinc-300">
                First name
              </label>
              <input
                id="firstName"
                v-model="form.firstName"
                type="text"
                required
                autocomplete="given-name"
                :disabled="isLoading"
                class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
                placeholder="John"
              />
            </div>
            <div class="space-y-2">
              <label for="lastName" class="block text-sm font-medium text-zinc-300">
                Last name
              </label>
              <input
                id="lastName"
                v-model="form.lastName"
                type="text"
                required
                autocomplete="family-name"
                :disabled="isLoading"
                class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
                placeholder="Doe"
              />
            </div>
          </div>

          <!-- Organization -->
          <div class="space-y-2">
            <label for="tenantName" class="block text-sm font-medium text-zinc-300">
              Organization name
            </label>
            <input
              id="tenantName"
              v-model="form.tenantName"
              type="text"
              required
              :disabled="isLoading"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
              placeholder="Your Publishing Company"
            />
          </div>

          <!-- Organization Slug -->
          <div class="space-y-2">
            <label for="tenantSlug" class="block text-sm font-medium text-zinc-300">
              URL slug
            </label>
            <input
              id="tenantSlug"
              v-model="form.tenantSlug"
              type="text"
              required
              :disabled="isLoading"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
              placeholder="your-company"
            />
            <p class="text-xs text-zinc-500">Lowercase letters, numbers, and hyphens only</p>
          </div>

          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="block text-sm font-medium text-zinc-300">
              Email address
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
              :disabled="isLoading"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
              placeholder="you@example.com"
            />
          </div>

          <!-- Password -->
          <div class="space-y-2">
            <label for="password" class="block text-sm font-medium text-zinc-300">
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="new-password"
                minlength="8"
                :disabled="isLoading"
                class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200 pr-12"
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white transition-colors"
                @click="showPassword = !showPassword"
              >
                <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                <EyeSlashIcon v-else class="w-5 h-5" />
              </button>
            </div>
            <p class="text-xs text-zinc-500">Must be at least 8 characters</p>
          </div>

          <!-- Confirm Password -->
          <div class="space-y-2">
            <label for="confirmPassword" class="block text-sm font-medium text-zinc-300">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="new-password"
              :disabled="isLoading"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
              placeholder="Confirm your password"
            />
          </div>

          <!-- Validation errors -->
          <div v-if="validationError" class="p-3 bg-warning-500/10 border border-warning-500/30 rounded-xl">
            <p class="text-sm text-warning-400">{{ validationError }}</p>
          </div>

          <!-- Error message -->
          <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p class="text-sm text-red-400">{{ error }}</p>
          </div>

          <!-- Submit button -->
          <Button
            type="submit"
            variant="chrome"
            :loading="isLoading"
            full-width
            size="lg"
          >
            Create account
          </Button>

          <!-- Login link -->
          <p class="text-center text-sm text-zinc-400">
            Already have an account?
            <NuxtLink to="/auth/login" class="text-primary-400 hover:text-primary-300 font-medium">
              Sign in
            </NuxtLink>
          </p>
        </form>
      </Card>

      <!-- Footer -->
      <p class="text-center text-xs text-zinc-600 mt-6">
        By creating an account, you agree to our Terms of Service
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';

definePageMeta({
  layout: false,
});

const router = useRouter();
const { register, isLoading, error } = useAuth();

const form = reactive({
  firstName: '',
  lastName: '',
  tenantName: '',
  tenantSlug: '',
  email: '',
  password: '',
  confirmPassword: '',
});

const showPassword = ref(false);
const validationError = ref<string | null>(null);

// Generate slug from tenant name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// Auto-generate slug when tenant name changes
watch(() => form.tenantName, (newName) => {
  if (!form.tenantSlug || form.tenantSlug === generateSlug(form.tenantName)) {
    form.tenantSlug = generateSlug(newName);
  }
});

const handleSubmit = async () => {
  validationError.value = null;

  // Validate passwords match
  if (form.password !== form.confirmPassword) {
    validationError.value = 'Passwords do not match';
    return;
  }

  // Validate password length
  if (form.password.length < 8) {
    validationError.value = 'Password must be at least 8 characters';
    return;
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(form.tenantSlug)) {
    validationError.value = 'URL slug can only contain lowercase letters, numbers, and hyphens';
    return;
  }

  const success = await register({
    firstName: form.firstName,
    lastName: form.lastName,
    tenantName: form.tenantName,
    tenantSlug: form.tenantSlug,
    email: form.email,
    password: form.password,
  });

  if (success) {
    router.push('/');
  }
};
</script>
