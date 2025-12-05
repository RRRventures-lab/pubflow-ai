// ============================================================================
// PubFlow AI - Matching Queue Store
// ============================================================================

import { defineStore } from 'pinia';

export interface MatchCandidate {
  workId: string;
  workTitle: string;
  iswc?: string;
  writers: string[];
  score: number;
  matchType: 'exact' | 'fuzzy' | 'ai';
  explanation?: string;
}

export interface ReviewItem {
  id: string;
  statementId: string;
  rowNumber: number;
  originalTitle: string;
  originalWriter?: string;
  originalPerformer?: string;
  source: string;
  amount: number;
  currency: string;
  candidates: MatchCandidate[];
  selectedCandidateId?: string;
  status: 'pending' | 'matched' | 'rejected' | 'skipped' | 'new_work';
  confidence: number;
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface MatchingQueueState {
  items: ReviewItem[];
  currentItem: ReviewItem | null;
  currentIndex: number;
  totalCount: number;
  pendingCount: number;
  filters: {
    status?: ReviewItem['status'][];
    source?: string;
    minConfidence?: number;
    maxConfidence?: number;
    assignedTo?: string;
    statementId?: string;
  };
  isLoading: boolean;
  autoAdvance: boolean;
}

export const useMatchingStore = defineStore('matching', {
  state: (): MatchingQueueState => ({
    items: [],
    currentItem: null,
    currentIndex: 0,
    totalCount: 0,
    pendingCount: 0,
    filters: {
      status: ['pending'],
    },
    isLoading: false,
    autoAdvance: true,
  }),

  getters: {
    hasItems: (state): boolean => state.items.length > 0,

    progress: (state): number => {
      if (state.totalCount === 0) return 0;
      const resolved = state.totalCount - state.pendingCount;
      return Math.round((resolved / state.totalCount) * 100);
    },

    currentPosition: (state): string => {
      if (!state.currentItem) return '0 / 0';
      return `${state.currentIndex + 1} / ${state.items.length}`;
    },

    topCandidate: (state): MatchCandidate | null => {
      return state.currentItem?.candidates[0] || null;
    },

    itemsByConfidence: (state) => {
      const high = state.items.filter((i) => i.confidence >= 0.8);
      const medium = state.items.filter((i) => i.confidence >= 0.5 && i.confidence < 0.8);
      const low = state.items.filter((i) => i.confidence < 0.5);
      return { high, medium, low };
    },
  },

  actions: {
    async fetchQueue() {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();
      this.isLoading = true;

      try {
        const params = new URLSearchParams();
        if (this.filters.status?.length) {
          params.set('status', this.filters.status.join(','));
        }
        if (this.filters.source) params.set('source', this.filters.source);
        if (this.filters.minConfidence !== undefined) {
          params.set('minConfidence', String(this.filters.minConfidence));
        }
        if (this.filters.maxConfidence !== undefined) {
          params.set('maxConfidence', String(this.filters.maxConfidence));
        }
        if (this.filters.assignedTo) params.set('assignedTo', this.filters.assignedTo);
        if (this.filters.statementId) params.set('statementId', this.filters.statementId);

        const response = await $fetch<{
          items: ReviewItem[];
          total: number;
          pending: number;
        }>(`${config.public.apiBase}/royalties/review-queue?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'X-Tenant-ID': tenant.tenantId,
          },
        });

        this.items = response.items;
        this.totalCount = response.total;
        this.pendingCount = response.pending;

        // Set current item
        if (this.items.length > 0) {
          this.currentIndex = 0;
          this.currentItem = this.items[0];
        } else {
          this.currentItem = null;
        }
      } finally {
        this.isLoading = false;
      }
    },

    async resolveItem(
      itemId: string,
      resolution: {
        status: ReviewItem['status'];
        selectedCandidateId?: string;
        newWorkData?: Record<string, any>;
      }
    ) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      const updated = await $fetch<ReviewItem>(
        `${config.public.apiBase}/royalties/review-queue/${itemId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'X-Tenant-ID': tenant.tenantId,
          },
          body: resolution,
        }
      );

      // Update item in list
      const index = this.items.findIndex((i) => i.id === itemId);
      if (index !== -1) {
        this.items[index] = updated;
      }

      // Update counts
      if (resolution.status !== 'pending') {
        this.pendingCount--;
      }

      // Auto-advance to next item
      if (this.autoAdvance) {
        this.nextItem();
      }
    },

    async acceptMatch(candidateId?: string) {
      if (!this.currentItem) return;

      const selectedId = candidateId || this.currentItem.candidates[0]?.workId;
      if (!selectedId) return;

      await this.resolveItem(this.currentItem.id, {
        status: 'matched',
        selectedCandidateId: selectedId,
      });
    },

    async rejectMatch() {
      if (!this.currentItem) return;

      await this.resolveItem(this.currentItem.id, {
        status: 'rejected',
      });
    },

    async skipItem() {
      if (!this.currentItem) return;

      await this.resolveItem(this.currentItem.id, {
        status: 'skipped',
      });
    },

    async createNewWork(workData: Record<string, any>) {
      if (!this.currentItem) return;

      await this.resolveItem(this.currentItem.id, {
        status: 'new_work',
        newWorkData: workData,
      });
    },

    async bulkAccept(itemIds: string[]) {
      const tenant = useTenantStore();
      const auth = useAuthStore();
      if (!tenant.tenantId) return;

      const config = useRuntimeConfig();

      await $fetch(`${config.public.apiBase}/royalties/review-queue/bulk-accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenant.tenantId,
        },
        body: { itemIds },
      });

      // Remove accepted items from local list
      this.items = this.items.filter((i) => !itemIds.includes(i.id));
      this.pendingCount -= itemIds.length;

      // Reset current item if needed
      if (this.items.length > 0) {
        this.currentIndex = Math.min(this.currentIndex, this.items.length - 1);
        this.currentItem = this.items[this.currentIndex];
      } else {
        this.currentItem = null;
      }
    },

    nextItem() {
      if (this.currentIndex < this.items.length - 1) {
        this.currentIndex++;
        this.currentItem = this.items[this.currentIndex];
      }
    },

    previousItem() {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.currentItem = this.items[this.currentIndex];
      }
    },

    goToItem(index: number) {
      if (index >= 0 && index < this.items.length) {
        this.currentIndex = index;
        this.currentItem = this.items[index];
      }
    },

    setFilters(filters: MatchingQueueState['filters']) {
      this.filters = filters;
    },

    toggleAutoAdvance() {
      this.autoAdvance = !this.autoAdvance;
    },

    reset() {
      this.items = [];
      this.currentItem = null;
      this.currentIndex = 0;
      this.totalCount = 0;
      this.pendingCount = 0;
      this.filters = { status: ['pending'] };
    },
  },
});
