// ============================================================================
// PubFlow AI - Auth Store
// ============================================================================

import { defineStore } from 'pinia';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'editor' | 'viewer';
  permissions: string[];
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
  }),

  getters: {
    initials: (state): string => {
      if (!state.user?.name) return '?';
      return state.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    },

    isAdmin: (state): boolean => state.user?.role === 'admin',
    isEditor: (state): boolean => ['admin', 'editor'].includes(state.user?.role || ''),

    hasPermission: (state) => (permission: string): boolean => {
      return state.user?.permissions?.includes(permission) || state.user?.role === 'admin';
    },
  },

  actions: {
    async initialize() {
      this.isLoading = true;
      try {
        const token = localStorage.getItem('auth_token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (token) {
          this.token = token;
          this.refreshToken = refreshToken;
          await this.fetchUser();
        }
      } catch (error) {
        this.logout();
      } finally {
        this.isLoading = false;
      }
    },

    async login(email: string, password: string) {
      const config = useRuntimeConfig();

      const response = await $fetch<{
        user: User;
        token: string;
        refreshToken: string;
      }>(`${config.public.apiBase}/auth/login`, {
        method: 'POST',
        body: { email, password },
      });

      this.user = response.user;
      this.token = response.token;
      this.refreshToken = response.refreshToken;
      this.isAuthenticated = true;

      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('refresh_token', response.refreshToken);
    },

    async fetchUser() {
      const config = useRuntimeConfig();

      const user = await $fetch<User>(`${config.public.apiBase}/auth/me`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      this.user = user;
      this.isAuthenticated = true;
    },

    async refreshAccessToken() {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }

      const config = useRuntimeConfig();

      const response = await $fetch<{
        token: string;
        refreshToken: string;
      }>(`${config.public.apiBase}/auth/refresh`, {
        method: 'POST',
        body: { refreshToken: this.refreshToken },
      });

      this.token = response.token;
      this.refreshToken = response.refreshToken;

      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('refresh_token', response.refreshToken);
    },

    logout() {
      this.user = null;
      this.token = null;
      this.refreshToken = null;
      this.isAuthenticated = false;

      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');

      navigateTo('/login');
    },
  },
});
