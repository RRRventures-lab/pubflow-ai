// ============================================================================
// PubFlow AI - Tenant Store
// ============================================================================

import { defineStore } from 'pinia';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  worksCount: number;
  writersCount: number;
  recordingsCount: number;
  settings: TenantSettings;
  subscription: TenantSubscription;
  createdAt: string;
}

export interface TenantSettings {
  defaultSociety: string;
  defaultTerritory: string;
  cwrVersion: '21' | '22' | '30' | '31';
  autoEnrichment: boolean;
  matchingThreshold: number;
  reviewThreshold: number;
}

export interface TenantSubscription {
  plan: 'starter' | 'professional' | 'enterprise';
  worksLimit: number;
  apiCallsLimit: number;
  aiCreditsLimit: number;
  expiresAt: string;
}

export interface TenantStats {
  worksTotal: number;
  worksThisMonth: number;
  writersTotal: number;
  recordingsTotal: number;
  cwrFilesGenerated: number;
  matchingAccuracy: number;
  pendingReview: number;
  aiEnrichmentsProposed: number;
}

export interface TenantState {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  stats: TenantStats | null;
  isLoading: boolean;
}

export const useTenantStore = defineStore('tenant', {
  state: (): TenantState => ({
    currentTenant: null,
    tenants: [],
    stats: null,
    isLoading: false,
  }),

  getters: {
    tenantId: (state): string | null => state.currentTenant?.id || null,

    canCreateWorks: (state): boolean => {
      if (!state.currentTenant || !state.stats) return false;
      return state.stats.worksTotal < state.currentTenant.subscription.worksLimit;
    },

    worksRemaining: (state): number => {
      if (!state.currentTenant || !state.stats) return 0;
      return state.currentTenant.subscription.worksLimit - state.stats.worksTotal;
    },

    isProfessional: (state): boolean => {
      return ['professional', 'enterprise'].includes(
        state.currentTenant?.subscription.plan || ''
      );
    },

    isEnterprise: (state): boolean => {
      return state.currentTenant?.subscription.plan === 'enterprise';
    },
  },

  actions: {
    async fetchTenants() {
      const config = useRuntimeConfig();
      const auth = useAuthStore();

      this.isLoading = true;
      try {
        const tenants = await $fetch<Tenant[]>(`${config.public.apiBase}/tenants`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });

        this.tenants = tenants;

        // Auto-select first tenant if none selected
        if (!this.currentTenant && tenants.length > 0) {
          await this.selectTenant(tenants[0].id);
        }
      } finally {
        this.isLoading = false;
      }
    },

    async selectTenant(tenantId: string) {
      const tenant = this.tenants.find((t) => t.id === tenantId);
      if (!tenant) return;

      this.currentTenant = tenant;
      localStorage.setItem('current_tenant', tenantId);

      // Fetch fresh stats for the selected tenant
      await this.fetchStats();
    },

    async fetchStats() {
      if (!this.currentTenant) return;

      const config = useRuntimeConfig();
      const auth = useAuthStore();

      const stats = await $fetch<TenantStats>(
        `${config.public.apiBase}/tenants/${this.currentTenant.id}/stats`,
        {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );

      this.stats = stats;
    },

    async updateSettings(settings: Partial<TenantSettings>) {
      if (!this.currentTenant) return;

      const config = useRuntimeConfig();
      const auth = useAuthStore();

      const updated = await $fetch<Tenant>(
        `${config.public.apiBase}/tenants/${this.currentTenant.id}/settings`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
          body: settings,
        }
      );

      this.currentTenant = updated;

      // Update in tenants list
      const index = this.tenants.findIndex((t) => t.id === updated.id);
      if (index !== -1) {
        this.tenants[index] = updated;
      }
    },

    initialize() {
      // Load saved tenant preference
      const savedTenantId = localStorage.getItem('current_tenant');
      if (savedTenantId && this.tenants.length > 0) {
        const tenant = this.tenants.find((t) => t.id === savedTenantId);
        if (tenant) {
          this.currentTenant = tenant;
        }
      }
    },
  },
});
