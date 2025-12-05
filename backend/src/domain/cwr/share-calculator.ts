// ============================================================================
// PubFlow AI - Share Calculator Service
// Calculates PR/MR/SR shares for CWR generation
// Based on: ~/Desktop/cisac-repos/django-music-publisher/music_publisher/models.py lines 1723-1750
// ============================================================================

import type { CWRWriterData, CWRPublisherData, WriterRole } from './types.js';

// ============================================================================
// Share Calculation Types
// ============================================================================

export interface ShareInput {
  writerId: string;
  writerCode: string;
  firstName: string;
  lastName: string;
  role: WriterRole;
  share: number;              // Overall share (0-100)
  isControlled: boolean;
  ipiNameNumber?: string;
  ipiBaseNumber?: string;
  prSociety?: string;
  mrSociety?: string;
  srSociety?: string;
  publisherCode?: string;     // Link to controlling publisher
  manuscriptShare?: number;   // Publisher's share of writer's share
}

export interface PublisherInput {
  publisherId: string;
  publisherCode: string;
  name: string;
  ipiNameNumber?: string;
  ipiBaseNumber?: string;
  prSociety?: string;
  mrSociety?: string;
  srSociety?: string;
  saan?: string;
}

export interface ShareCalculationResult {
  writers: CWRWriterData[];
  publishers: CWRPublisherData[];
  totalPrShare: number;
  totalMrShare: number;
  totalSrShare: number;
  controlledPrShare: number;
  controlledMrShare: number;
  controlledSrShare: number;
  warnings: string[];
}

// ============================================================================
// Default Share Splits
// Standard industry splits: Publisher typically gets 50% of each right
// ============================================================================

const DEFAULT_PUBLISHER_SHARE = 50;  // Publisher share of controlled works
const DEFAULT_WRITER_SPLIT = 50;     // Writer keeps 50% when controlled

// Performance (PR): Writer usually keeps 50%, Publisher gets 50%
// Mechanical (MR): Same split
// Synchronization (SR): Same split

// ============================================================================
// Share Calculator
// ============================================================================

export class ShareCalculator {
  private warnings: string[] = [];

  /**
   * Calculate shares for CWR generation
   *
   * The share calculation follows these rules:
   * 1. Total shares must equal 100%
   * 2. For controlled writers:
   *    - Writer's PR/MR/SR is their share × writer split (e.g., 50%)
   *    - Publisher's PR/MR/SR is their share × publisher split (e.g., 50%)
   * 3. For uncontrolled writers:
   *    - Writer keeps full share (100% of their percentage)
   *    - Publisher share goes to "other publisher" (OPU)
   */
  calculate(
    writers: ShareInput[],
    publishers: PublisherInput[]
  ): ShareCalculationResult {
    this.warnings = [];

    // Validate total shares
    const totalShare = writers.reduce((sum, w) => sum + w.share, 0);
    if (Math.abs(totalShare - 100) > 0.01) {
      this.warnings.push(`Writer shares total ${totalShare.toFixed(2)}%, expected 100%`);
    }

    const cwrWriters: CWRWriterData[] = [];
    const cwrPublishers: Map<string, CWRPublisherData> = new Map();

    let totalPrShare = 0;
    let totalMrShare = 0;
    let totalSrShare = 0;
    let controlledPrShare = 0;
    let controlledMrShare = 0;
    let controlledSrShare = 0;

    // Process each writer
    for (const writer of writers) {
      const writerShares = this.calculateWriterShares(writer);

      cwrWriters.push({
        code: writer.writerCode,
        firstName: writer.firstName,
        lastName: writer.lastName,
        ipiNameNumber: writer.ipiNameNumber,
        ipiBaseNumber: writer.ipiBaseNumber,
        role: writer.role,
        prSociety: writer.prSociety,
        mrSociety: writer.mrSociety,
        srSociety: writer.srSociety,
        prShare: writerShares.writerPr,
        mrShare: writerShares.writerMr,
        srShare: writerShares.writerSr,
        isControlled: writer.isControlled,
        publisherCode: writer.publisherCode,
      });

      totalPrShare += writerShares.writerPr;
      totalMrShare += writerShares.writerMr;
      totalSrShare += writerShares.writerSr;

      // Handle publisher shares for controlled writers
      if (writer.isControlled && writer.publisherCode) {
        const pubInput = publishers.find(p => p.publisherCode === writer.publisherCode);

        if (pubInput) {
          // Add or accumulate publisher shares
          const existingPub = cwrPublishers.get(writer.publisherCode);

          if (existingPub) {
            existingPub.prShare += writerShares.publisherPr;
            existingPub.mrShare += writerShares.publisherMr;
            existingPub.srShare += writerShares.publisherSr;
          } else {
            cwrPublishers.set(writer.publisherCode, {
              code: pubInput.publisherCode,
              name: pubInput.name,
              ipiNameNumber: pubInput.ipiNameNumber,
              ipiBaseNumber: pubInput.ipiBaseNumber,
              role: 'E',
              prSociety: pubInput.prSociety,
              mrSociety: pubInput.mrSociety,
              srSociety: pubInput.srSociety,
              prShare: writerShares.publisherPr,
              mrShare: writerShares.publisherMr,
              srShare: writerShares.publisherSr,
              saan: pubInput.saan,
              chainSequence: cwrPublishers.size + 1,
            });
          }

          controlledPrShare += writerShares.writerPr + writerShares.publisherPr;
          controlledMrShare += writerShares.writerMr + writerShares.publisherMr;
          controlledSrShare += writerShares.writerSr + writerShares.publisherSr;

          totalPrShare += writerShares.publisherPr;
          totalMrShare += writerShares.publisherMr;
          totalSrShare += writerShares.publisherSr;
        } else {
          this.warnings.push(
            `Writer ${writer.writerCode} linked to unknown publisher ${writer.publisherCode}`
          );
        }
      }
    }

    // Validate final totals
    if (Math.abs(totalPrShare - 100) > 0.1) {
      this.warnings.push(`Total PR shares = ${totalPrShare.toFixed(2)}%, expected 100%`);
    }
    if (Math.abs(totalMrShare - 100) > 0.1) {
      this.warnings.push(`Total MR shares = ${totalMrShare.toFixed(2)}%, expected 100%`);
    }
    if (Math.abs(totalSrShare - 100) > 0.1) {
      this.warnings.push(`Total SR shares = ${totalSrShare.toFixed(2)}%, expected 100%`);
    }

    return {
      writers: cwrWriters,
      publishers: Array.from(cwrPublishers.values()),
      totalPrShare,
      totalMrShare,
      totalSrShare,
      controlledPrShare,
      controlledMrShare,
      controlledSrShare,
      warnings: this.warnings,
    };
  }

  /**
   * Calculate individual writer's PR/MR/SR shares
   *
   * For controlled writers:
   *   Writer gets: share × (100 - manuscriptShare) / 100
   *   Publisher gets: share × manuscriptShare / 100
   *
   * For uncontrolled writers:
   *   Writer gets: full share
   *   Publisher gets: 0 (goes to OPU record)
   */
  private calculateWriterShares(writer: ShareInput): {
    writerPr: number;
    writerMr: number;
    writerSr: number;
    publisherPr: number;
    publisherMr: number;
    publisherSr: number;
  } {
    const manuscriptShare = writer.manuscriptShare ?? DEFAULT_PUBLISHER_SHARE;
    const writerSplit = (100 - manuscriptShare) / 100;
    const publisherSplit = manuscriptShare / 100;

    if (writer.isControlled) {
      // Controlled: split between writer and publisher
      return {
        writerPr: this.round(writer.share * writerSplit),
        writerMr: this.round(writer.share * writerSplit),
        writerSr: this.round(writer.share * writerSplit),
        publisherPr: this.round(writer.share * publisherSplit),
        publisherMr: this.round(writer.share * publisherSplit),
        publisherSr: this.round(writer.share * publisherSplit),
      };
    }

    // Uncontrolled: writer keeps full share
    return {
      writerPr: writer.share,
      writerMr: writer.share,
      writerSr: writer.share,
      publisherPr: 0,
      publisherMr: 0,
      publisherSr: 0,
    };
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

// ============================================================================
// Quick Share Validation
// ============================================================================

export function validateShares(shares: number[], expectedTotal = 100): {
  isValid: boolean;
  total: number;
  error?: string;
} {
  const total = shares.reduce((sum, s) => sum + s, 0);
  const isValid = Math.abs(total - expectedTotal) <= 0.01;

  return {
    isValid,
    total,
    error: isValid ? undefined : `Shares total ${total.toFixed(2)}%, expected ${expectedTotal}%`,
  };
}

// ============================================================================
// Calculate Ownership Summary
// ============================================================================

export function calculateOwnership(
  writers: CWRWriterData[],
  publishers: CWRPublisherData[]
): {
  prOwnership: number;
  mrOwnership: number;
  srOwnership: number;
} {
  // Ownership = sum of all controlled shares

  const controlledWriterPr = writers
    .filter(w => w.isControlled)
    .reduce((sum, w) => sum + w.prShare, 0);

  const controlledWriterMr = writers
    .filter(w => w.isControlled)
    .reduce((sum, w) => sum + w.mrShare, 0);

  const controlledWriterSr = writers
    .filter(w => w.isControlled)
    .reduce((sum, w) => sum + w.srShare, 0);

  const publisherPr = publishers.reduce((sum, p) => sum + p.prShare, 0);
  const publisherMr = publishers.reduce((sum, p) => sum + p.mrShare, 0);
  const publisherSr = publishers.reduce((sum, p) => sum + p.srShare, 0);

  return {
    prOwnership: controlledWriterPr + publisherPr,
    mrOwnership: controlledWriterMr + publisherMr,
    srOwnership: controlledWriterSr + publisherSr,
  };
}

// Export singleton instance
export const shareCalculator = new ShareCalculator();
