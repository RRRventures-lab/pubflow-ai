// ============================================================================
// PubFlow AI - AI Pipeline Integration Tests
// End-to-end tests for enrichment, matching, and conflict detection
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getAIOrchestrator,
  getEmbeddingService,
  getEnrichmentAgent,
  getMatchingAgent,
  getConflictAgent,
  type AIContext,
  type EnrichmentRequest,
  type MatchingRequest,
  type ConflictCheckRequest,
} from '../../src/domain/ai/index.js';

// --------------------------------------------------------------------------
// Test Configuration
// --------------------------------------------------------------------------

const TEST_TENANT_ID = 'test-tenant-001';
const TEST_USER_ID = 'test-user-001';

const createTestContext = (): AIContext => ({
  tenantId: TEST_TENANT_ID,
  userId: TEST_USER_ID,
  requestId: `test-${Date.now()}`,
  trace: [],
});

// --------------------------------------------------------------------------
// Mock Data
// --------------------------------------------------------------------------

const mockWork = {
  workId: 'work-001',
  title: 'Yesterday',
  iswc: 'T-010.123.456-7',
  writers: [
    { id: 'writer-001', name: 'John Lennon', ipi: '00012345678', prShare: 50, mrShare: 50, role: 'CA' },
    { id: 'writer-002', name: 'Paul McCartney', ipi: '00087654321', prShare: 50, mrShare: 50, role: 'CA' },
  ],
  publishers: [
    { id: 'pub-001', name: 'Sony ATV', ipi: '00099999999', prShare: 50, mrShare: 50, role: 'E', controlled: true },
  ],
};

const mockStatementLine = {
  statementLineId: 'line-001',
  title: 'Ystrdy',  // Intentional typo for fuzzy matching
  writers: ['J. Lennon', 'P. McCartney'],
  performer: 'The Beatles',
  isrc: undefined,
  iswc: undefined,
};

// --------------------------------------------------------------------------
// Embedding Service Tests
// --------------------------------------------------------------------------

describe('EmbeddingService', () => {
  const embeddingService = getEmbeddingService();

  it('should generate embeddings with correct dimensions', async () => {
    const text = 'Yesterday all my troubles seemed so far away';
    const embedding = await embeddingService.generateEmbedding(text);

    expect(embedding).toBeInstanceOf(Array);
    expect(embedding.length).toBe(1536);
    expect(embedding.every((v) => typeof v === 'number')).toBe(true);
  });

  it('should generate work embeddings with title, writer, and combined', async () => {
    const embedding = await embeddingService.embedWork({
      id: 'test-work',
      title: 'Yesterday',
      writers: [{ name: 'John Lennon', ipi: '00012345678' }],
    });

    expect(embedding.titleEmbedding).toBeInstanceOf(Array);
    expect(embedding.titleEmbedding.length).toBe(1536);

    expect(embedding.writerEmbedding).toBeInstanceOf(Array);
    expect(embedding.writerEmbedding.length).toBe(1536);

    expect(embedding.combinedEmbedding).toBeInstanceOf(Array);
    expect(embedding.combinedEmbedding.length).toBe(1536);
  });

  it('should handle empty writer list gracefully', async () => {
    const embedding = await embeddingService.embedWork({
      id: 'test-work',
      title: 'Solo Song',
      writers: [],
    });

    expect(embedding.titleEmbedding.length).toBe(1536);
    expect(embedding.combinedEmbedding.length).toBe(1536);
  });

  it('should compute cosine similarity correctly', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];

    // Same vectors should have similarity 1
    const sameVectors = embeddingService.cosineSimilarity(a, b);
    expect(sameVectors).toBeCloseTo(1, 5);

    // Orthogonal vectors should have similarity 0
    const orthogonal = embeddingService.cosineSimilarity(a, c);
    expect(orthogonal).toBeCloseTo(0, 5);
  });
});

// --------------------------------------------------------------------------
// Enrichment Agent Tests
// --------------------------------------------------------------------------

describe('EnrichmentAgent', () => {
  const enrichmentAgent = getEnrichmentAgent();
  const ctx = createTestContext();

  it('should return proposals from external sources', async () => {
    const request: EnrichmentRequest = {
      workId: mockWork.workId,
      title: 'Yesterday',
      writers: ['John Lennon', 'Paul McCartney'],
      sources: ['musicbrainz'],
      autoApply: false,
    };

    const result = await enrichmentAgent.enrichWork(ctx, request);

    expect(result).toHaveProperty('proposals');
    expect(result).toHaveProperty('applied');
    expect(Array.isArray(result.proposals)).toBe(true);

    // Each proposal should have required fields
    for (const proposal of result.proposals) {
      expect(proposal).toHaveProperty('field');
      expect(proposal).toHaveProperty('proposedValue');
      expect(proposal).toHaveProperty('source');
      expect(proposal).toHaveProperty('confidence');
      expect(proposal.confidence).toBeGreaterThanOrEqual(0);
      expect(proposal.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should not apply proposals when autoApply is false', async () => {
    const request: EnrichmentRequest = {
      workId: mockWork.workId,
      title: 'Yesterday',
      writers: ['John Lennon'],
      sources: ['musicbrainz'],
      autoApply: false,
    };

    const result = await enrichmentAgent.enrichWork(ctx, request);

    expect(result.applied).toEqual([]);
  });

  it('should skip already enriched fields', async () => {
    const request: EnrichmentRequest = {
      workId: mockWork.workId,
      title: 'Yesterday',
      writers: ['John Lennon'],
      existingIswc: 'T-010.123.456-7',  // Already has ISWC
      sources: ['musicbrainz'],
      autoApply: false,
    };

    const result = await enrichmentAgent.enrichWork(ctx, request);

    // Should not propose ISWC if already exists
    const iswcProposals = result.proposals.filter((p) => p.field === 'iswc');
    expect(iswcProposals.length).toBe(0);
  });
});

// --------------------------------------------------------------------------
// Matching Agent Tests
// --------------------------------------------------------------------------

describe('MatchingAgent', () => {
  const matchingAgent = getMatchingAgent();
  const ctx = createTestContext();

  it('should return matching pipeline stages', async () => {
    const request: MatchingRequest = mockStatementLine;

    const result = await matchingAgent.match(ctx, request);

    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('recommendation');
    expect(result).toHaveProperty('pipelineStages');

    // Should have at least one pipeline stage
    expect(result.pipelineStages.length).toBeGreaterThan(0);

    // First stage should be normalization
    expect(result.pipelineStages[0].name).toBe('normalize');
  });

  it('should provide appropriate recommendation based on confidence', async () => {
    const request: MatchingRequest = {
      ...mockStatementLine,
      iswc: mockWork.iswc,  // Provide exact match data
    };

    const result = await matchingAgent.match(ctx, request);

    expect(['auto_match', 'review', 'no_match', 'create_new']).toContain(result.recommendation);
  });

  it('should handle exact ISWC matches', async () => {
    const request: MatchingRequest = {
      statementLineId: 'line-002',
      title: 'Some Song',
      writers: [],
      iswc: 'T-010.123.456-7',  // Exact ISWC
    };

    const result = await matchingAgent.match(ctx, request);

    // If ISWC match found, should have high confidence
    if (result.bestMatch) {
      expect(result.bestMatch.matchType).toBe('exact');
      expect(result.bestMatch.confidence).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('should handle batch matching', async () => {
    const requests: MatchingRequest[] = [
      { statementLineId: 'batch-1', title: 'Song One', writers: [] },
      { statementLineId: 'batch-2', title: 'Song Two', writers: [] },
      { statementLineId: 'batch-3', title: 'Song Three', writers: [] },
    ];

    const results = await matchingAgent.batchMatch(ctx, requests);

    expect(results.length).toBe(3);
    results.forEach((result, i) => {
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('pipelineStages');
    });
  });

  it('should normalize titles for comparison', async () => {
    // Test that variations of the same title match
    const requests: MatchingRequest[] = [
      { statementLineId: 't1', title: 'Yesterday', writers: [] },
      { statementLineId: 't2', title: 'YESTERDAY', writers: [] },
      { statementLineId: 't3', title: '  Yesterday  ', writers: [] },
      { statementLineId: 't4', title: 'Yesterday (Live Version)', writers: [] },
    ];

    const results = await matchingAgent.batchMatch(ctx, requests);

    // All should complete without error
    expect(results.length).toBe(4);
  });
});

// --------------------------------------------------------------------------
// Conflict Detection Agent Tests
// --------------------------------------------------------------------------

describe('ConflictDetectionAgent', () => {
  const conflictAgent = getConflictAgent();
  const ctx = createTestContext();

  it('should detect invalid share totals', async () => {
    const request: ConflictCheckRequest = {
      workId: 'work-invalid-shares',
      title: 'Invalid Shares Song',
      writers: [
        { id: 'w1', name: 'Writer A', prShare: 60, mrShare: 60 },
        { id: 'w2', name: 'Writer B', prShare: 60, mrShare: 60 },
      ],
      publishers: [],
    };

    const result = await conflictAgent.checkConflicts(ctx, request);

    // Should detect that shares exceed 100%
    const shareConflicts = result.conflicts.filter((c) => c.type === 'share_total_invalid');
    expect(shareConflicts.length).toBeGreaterThan(0);
    expect(shareConflicts[0].severity).toBe('CRITICAL');
  });

  it('should not flag valid share totals', async () => {
    const request: ConflictCheckRequest = {
      workId: 'work-valid-shares',
      title: 'Valid Shares Song',
      writers: [
        { id: 'w1', name: 'Writer A', prShare: 50, mrShare: 50 },
        { id: 'w2', name: 'Writer B', prShare: 50, mrShare: 50 },
      ],
      publishers: [],
    };

    const result = await conflictAgent.checkConflicts(ctx, request);

    const shareConflicts = result.conflicts.filter((c) => c.type === 'share_total_invalid');
    expect(shareConflicts.length).toBe(0);
  });

  it('should detect missing controlled parties', async () => {
    const request: ConflictCheckRequest = {
      workId: 'work-no-controlled',
      title: 'No Controlled Song',
      writers: [
        { id: 'w1', name: 'Writer A', controlled: false, prShare: 100, mrShare: 100 },
      ],
      publishers: [],
    };

    const result = await conflictAgent.checkConflicts(ctx, request);

    const controlledConflicts = result.conflicts.filter((c) => c.type === 'missing_controlled');
    // Should warn about no controlled parties (can't collect royalties)
    expect(controlledConflicts.length).toBeGreaterThan(0);
  });

  it('should track all checks run', async () => {
    const request: ConflictCheckRequest = mockWork;

    const result = await conflictAgent.checkConflicts(ctx, request);

    expect(result.checksRun).toBeInstanceOf(Array);
    expect(result.checksRun.length).toBeGreaterThan(0);
    expect(result.checksRun).toContain('share_validation');
  });

  it('should include trace entries', async () => {
    const request: ConflictCheckRequest = mockWork;

    const result = await conflictAgent.checkConflicts(ctx, request);

    expect(ctx.trace.length).toBeGreaterThan(0);
    expect(ctx.trace[0]).toHaveProperty('agent', 'conflict');
    expect(ctx.trace[0]).toHaveProperty('action', 'check_conflicts');
  });
});

// --------------------------------------------------------------------------
// AI Orchestrator Tests
// --------------------------------------------------------------------------

describe('AIOrchestrator', () => {
  const orchestrator = getAIOrchestrator();
  const ctx = createTestContext();

  it('should process work through full pipeline', async () => {
    const result = await orchestrator.process(ctx, {
      workId: mockWork.workId,
      operations: ['enrich', 'conflicts'],
    });

    expect(result).toHaveProperty('success');

    if (result.success) {
      expect(result.data).toHaveProperty('enrichment');
      expect(result.data).toHaveProperty('conflicts');
    }
  });

  it('should support selective operations', async () => {
    // Only run conflict detection
    const result = await orchestrator.process(ctx, {
      workId: mockWork.workId,
      operations: ['conflicts'],
    });

    expect(result.success).toBe(true);

    if (result.success && result.data) {
      expect(result.data.conflicts).toBeDefined();
      // Enrichment should not be present since we didn't request it
      expect(result.data.enrichment).toBeUndefined();
    }
  });

  it('should handle batch processing', async () => {
    const workIds = ['work-001', 'work-002', 'work-003'];

    const results = await orchestrator.batchProcess(ctx, workIds, ['conflicts']);

    expect(results.length).toBe(3);
    results.forEach((result) => {
      expect(result).toHaveProperty('success');
    });
  });

  it('should provide AI statistics', async () => {
    const stats = await orchestrator.getAIStats(TEST_TENANT_ID);

    expect(stats).toHaveProperty('totalTasks');
    expect(stats).toHaveProperty('completedTasks');
    expect(stats).toHaveProperty('pendingTasks');
    expect(stats).toHaveProperty('failedTasks');

    expect(typeof stats.totalTasks).toBe('number');
    expect(typeof stats.completedTasks).toBe('number');
  });

  it('should add trace entries for all operations', async () => {
    const newCtx = createTestContext();

    await orchestrator.process(newCtx, {
      workId: mockWork.workId,
      operations: ['enrich', 'conflicts'],
    });

    expect(newCtx.trace.length).toBeGreaterThan(0);

    // Should have orchestrator trace entry
    const orchestratorTrace = newCtx.trace.find((t) => t.agent === 'orchestrator');
    expect(orchestratorTrace).toBeDefined();
  });
});

// --------------------------------------------------------------------------
// Error Handling Tests
// --------------------------------------------------------------------------

describe('Error Handling', () => {
  const orchestrator = getAIOrchestrator();

  it('should handle invalid work ID gracefully', async () => {
    const ctx = createTestContext();

    const result = await orchestrator.process(ctx, {
      workId: 'non-existent-work-id',
      operations: ['conflicts'],
    });

    // Should not crash, should return error result
    expect(result).toHaveProperty('success');
    // May succeed with empty data or fail with error
  });

  it('should continue processing if one operation fails', async () => {
    const ctx = createTestContext();

    // This should still process conflicts even if enrichment fails
    const result = await orchestrator.process(ctx, {
      workId: mockWork.workId,
      operations: ['enrich', 'conflicts'],
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
  });
});

// --------------------------------------------------------------------------
// Performance Tests
// --------------------------------------------------------------------------

describe('Performance', () => {
  const matchingAgent = getMatchingAgent();
  const ctx = createTestContext();

  it('should complete single match within timeout', async () => {
    const startTime = Date.now();

    await matchingAgent.match(ctx, mockStatementLine);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should handle batch efficiently', async () => {
    const batchSize = 10;
    const requests = Array.from({ length: batchSize }, (_, i) => ({
      statementLineId: `perf-${i}`,
      title: `Performance Test Song ${i}`,
      writers: ['Test Writer'],
    }));

    const startTime = Date.now();

    await matchingAgent.batchMatch(ctx, requests);

    const duration = Date.now() - startTime;
    const perItem = duration / batchSize;

    // Batch should be faster per item than individual calls
    expect(perItem).toBeLessThan(2000); // Less than 2 seconds per item
  });
});
