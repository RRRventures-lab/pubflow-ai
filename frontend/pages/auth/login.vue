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
        <p class="text-zinc-400 mt-2">Sign in to your account</p>
      </div>

      <!-- Login form -->
      <Card variant="glass">
        <form @submit.prevent="handleSubmit" class="space-y-6">
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
                autocomplete="current-password"
                :disabled="isLoading"
                class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200 pr-12"
                placeholder="Enter your password"
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
            Sign in
          </Button>

          <!-- Register link -->
          <p class="text-center text-sm text-zinc-400">
            Don't have an account?
            <NuxtLink to="/auth/register" class="text-primary-400 hover:text-primary-300 font-medium">
              Create one
            </NuxtLink>
          </p>
        </form>
      </Card>

      <!-- Footer -->
      <p class="text-center text-xs text-zinc-600 mt-6">
        AI-powered music publishing administration
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
const { login, isLoading, error } = useAuth();

const form = reactive({
  email: '',
  password: '',
});

const showPassword = ref(false);

const handleSubmit = async () => {
  const success = await login({
    email: form.email,
    password: form.password,
  });

  if (success) {
    router.push('/');
  }
};
</script>
