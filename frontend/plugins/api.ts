import type { FetchOptions, FetchResponse } from 'ofetch';

interface ApiRequestOptions extends Omit<FetchOptions<'json'>, 'body'> {
  body?: Record<string, unknown> | FormData;
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const authToken = useCookie('auth_token');

  const api = async <T = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> => {
    const baseURL = config.public.apiBase as string;

    // Build headers
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth token if available
    if (authToken.value) {
      headers['Authorization'] = `Bearer ${authToken.value}`;
    }

    // Add content-type for JSON requests (unless FormData)
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await $fetch<T>(endpoint, {
        baseURL,
        headers,
        ...options,
        body: options.body,
      });

      return response;
    } catch (error: unknown) {
      // Handle 401 Unauthorized - clear token and redirect to login
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const fetchError = error as { statusCode: number; statusMessage?: string; data?: unknown };
        if (fetchError.statusCode === 401) {
          authToken.value = null;
          // Only redirect on client side
          if (import.meta.client) {
            navigateTo('/auth/login');
          }
        }
      }
      throw error;
    }
  };

  return {
    provide: {
      api,
    },
  };
});

// Type augmentation for useNuxtApp
declare module '#app' {
  interface NuxtApp {
    $api: <T = unknown>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $api: <T = unknown>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
  }
}
