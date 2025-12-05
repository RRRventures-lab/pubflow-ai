// ============================================================================
// PubFlow AI - Works Store
// ============================================================================

import { defineStore } from 'pinia';

export interface Writer {
  id: string;
  ipi: string;
  firstName: string;
  lastName: string;
  role: 'C' | 'A' | 'CA' | 'AR' | 'SA' | 'SR' | 'TR';
  prShare: number;
  mrShare: number;
  srShare: number;
  controlled: boolean;
  society?: string;
}

export interface Publisher {
  id: string;
  ipi: string;
  name: string;
  role: 'E' | 'AM' | 'PA' | 'SE' | 'ES';
  prShare: number;
  mrShare: number;
  srShare: number;
  controlled: boolean;
  society?: string;
}

export interface AlternateTitle {
  id: string;
  title: string;
  type: 'AT' | 'FT' | 'IT' | 'OT' | 'PT' | 'TT';
}

export interface Recording {
  id: string;
  isrc: string;
  title: string;
  duration?: number;
  artist?: string;
  releaseDate?: string;
}

export interface Work {
  id: string;
  title: string;
  iswc?: string;
  internalId: string;
  workType: 'original' | 'modification' | 'arrangement' | 'excerpt';
  language?: string;
  duration?: number;
  status: 'draft' | 'active' | 'registered' | 'disputed';
  writers: Writer[];
  publishers: Publisher[];
  alternateTitles: AlternateTitle[];
  recordings: Recording[];
  territories: string[];
  aiConfidence?: number;
  aiEnriched?: boolean;
  hasConflicts?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkFilters {
  search?: string;
  status?: Work['status'][];
  hasIswc?: boolean;
  aiEnriched?: boolean;
  hasConflicts?: boolean;
  writerId?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface WorksState {
  works: Work[];
  currentWork: Work | null;
  totalCount: number;
  filters: WorkFilters;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  page: number;
  pageSize: number;
  isLoading: boolean;
  selectedIds: string[];
}

export const useWorksStore = defineStore('works', {
  state: (): WorksState => ({
    works: [],
    currentWork: null,
    totalCount: 0,
    filters: {},
    sortKey: 'updatedAt',
    sortDirection: 'desc',
    page: 1,
    pageSize: 50,
    isLoading: false,
    selectedIds: [],
  }),

  getters: {
    hasSelection: (state): boolean => state.selectedIds.length > 0,

    selectedWorks: (state): Work[] => {
      return state.works.filter((w) => state.selectedIds.includes(w.id));
    },

    activeFiltersCount: (state): number => {
      return Object.values(state.filters).filter(
        (v) => v !== undefined && v !== null && v !== ''
      ).length;
    },

    worksWithConflicts: (state): Work[] => {
      return state.works.filter((w) => w.hasConflicts);
    },

    worksNeedingIswc: (state): Work[] => {
      return state.works.filter((w) => !w.iswc && w.status === 'active');
    },
  },

  actions: {
    async fetchWorks() {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();
      this.isLoading = true;

      try {
        const params = new URLSearchParams();
        params.set('page', String(this.page));
        params.set('pageSize', String(this.pageSize));
        params.set('sortKey', this.sortKey);
        params.set('sortDirection', this.sortDirection);

        // Add filters
        if (this.filters.search) params.set('search', this.filters.search);
        if (this.filters.status?.length) params.set('status', this.filters.status.join(','));
        if (this.filters.hasIswc !== undefined) params.set('hasIswc', String(this.filters.hasIswc));
        if (this.filters.aiEnriched !== undefined) params.set('aiEnriched', String(this.filters.aiEnriched));
        if (this.filters.hasConflicts !== undefined) params.set('hasConflicts', String(this.filters.hasConflicts));
        if (this.filters.writerId) params.set('writerId', this.filters.writerId);
        if (this.filters.createdAfter) params.set('createdAfter', this.filters.createdAfter);
        if (this.filters.createdBefore) params.set('createdBefore', this.filters.createdBefore);

        const response = await $fetch<{
          data: Work[];
          total: number;
          page: number;
          pageSize: number;
        }>(`${config.public.apiBase}/works?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'X-Tenant-ID': tenant.tenantId,
          },
        });

        this.works = response.data;
        this.totalCount = response.total;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchWork(id: string) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      const work = await $fetch<Work>(`${config.public.apiBase}/works/${id}`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
      });

      this.currentWork = work;

      // Update in list if present
      const index = this.works.findIndex((w) => w.id === id);
      if (index !== -1) {
        this.works[index] = work;
      }

      return work;
    },

    async createWork(data: Partial<Work>) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      const work = await $fetch<Work>(`${config.public.apiBase}/works`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
        body: data,
      });

      this.works.unshift(work);
      this.totalCount++;
      this.currentWork = work;

      return work;
    },

    async updateWork(id: string, data: Partial<Work>) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      const work = await $fetch<Work>(`${config.public.apiBase}/works/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
        body: data,
      });

      // Update in list
      const index = this.works.findIndex((w) => w.id === id);
      if (index !== -1) {
        this.works[index] = work;
      }

      if (this.currentWork?.id === id) {
        this.currentWork = work;
      }

      return work;
    },

    async deleteWork(id: string) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      await $fetch(`${config.public.apiBase}/works/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
      });

      this.works = this.works.filter((w) => w.id !== id);
      this.totalCount--;

      if (this.currentWork?.id === id) {
        this.currentWork = null;
      }
    },

    async bulkDelete(ids: string[]) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      await $fetch(`${config.public.apiBase}/works/bulk`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
        body: { ids },
      });

      this.works = this.works.filter((w) => !ids.includes(w.id));
      this.totalCount -= ids.length;
      this.selectedIds = [];
    },

    async bulkUpdateStatus(ids: string[], status: Work['status']) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      const updated = await $fetch<Work[]>(`${config.public.apiBase}/works/bulk/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
        body: { ids, status },
      });

      // Update in list
      for (const work of updated) {
        const index = this.works.findIndex((w) => w.id === work.id);
        if (index !== -1) {
          this.works[index] = work;
        }
      }

      this.selectedIds = [];
    },

    setFilters(filters: WorkFilters) {
      this.filters = filters;
      this.page = 1;
    },

    setSort(key: string, direction: 'asc' | 'desc') {
      this.sortKey = key;
      this.sortDirection = direction;
      this.page = 1;
    },

    setPage(page: number) {
      this.page = page;
    },

    toggleSelection(id: string) {
      const index = this.selectedIds.indexOf(id);
      if (index === -1) {
        this.selectedIds.push(id);
      } else {
        this.selectedIds.splice(index, 1);
      }
    },

    selectAll() {
      this.selectedIds = this.works.map((w) => w.id);
    },

    clearSelection() {
      this.selectedIds = [];
    },

    reset() {
      this.works = [];
      this.currentWork = null;
      this.totalCount = 0;
      this.filters = {};
      this.page = 1;
      this.selectedIds = [];
    },
  },
});
