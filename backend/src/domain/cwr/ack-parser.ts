// ============================================================================
// PubFlow AI - CWR Acknowledgement Parser
// Parses ACK files returned by societies after CWR submission
// ============================================================================

import { logger } from '../../infrastructure/logging/logger.js';

// ============================================================================
// ACK Types
// ============================================================================

export type AckStatus =
  | 'CO'   // Conflict - work conflicts with existing registration
  | 'DU'   // Duplicate - work already registered
  | 'RA'   // Registration Accepted
  | 'AS'   // Agreement Starts
  | 'AC'   // Agreement Claim
  | 'SR'   // Society Registration
  | 'CR'   // Claim Rejected
  | 'RJ'   // Rejected
  | 'NP';  // Not in Portfolio

export interface ACKRecord {
  recordType: string;
  transactionSequence: number;
  recordSequence: number;
  originalTransactionType: string;
  originalTransactionSequence: number;
  creationTitle?: string;
  workCode?: string;
  iswc?: string;
  status: AckStatus;
  societyWorkId?: string;
  processingDate?: string;
  errorMessage?: string;
  messageLevel?: string;
  validationNumber?: string;
}

export interface ACKParseResult {
  filename: string;
  version: string;
  receiverCode: string;
  senderCode: string;
  processingDate: string;
  records: ACKRecord[];
  accepted: number;
  rejected: number;
  conflicts: number;
  duplicates: number;
  errors: string[];
}

// ============================================================================
// ACK Parser
// ============================================================================

export class ACKParser {
  private lines: string[] = [];
  private currentLine = 0;
  private records: ACKRecord[] = [];
  private errors: string[] = [];

  /**
   * Parse an ACK file content
   */
  parse(content: string, filename: string): ACKParseResult {
    this.reset();
    this.lines = content.split(/\r?\n/).filter(line => line.length > 0);

    if (this.lines.length < 3) {
      throw new Error('Invalid ACK file: too few lines');
    }

    // Parse header
    const header = this.parseHeader(this.lines[0]);

    // Parse body records
    for (let i = 1; i < this.lines.length - 1; i++) {
      try {
        const record = this.parseRecord(this.lines[i]);
        if (record) {
          this.records.push(record);
        }
      } catch (error) {
        this.errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }
    }

    // Calculate statistics
    const accepted = this.records.filter(r => r.status === 'RA' || r.status === 'SR').length;
    const rejected = this.records.filter(r => r.status === 'RJ' || r.status === 'CR').length;
    const conflicts = this.records.filter(r => r.status === 'CO').length;
    const duplicates = this.records.filter(r => r.status === 'DU').length;

    return {
      filename,
      version: header.version,
      receiverCode: header.receiverCode,
      senderCode: header.senderCode,
      processingDate: header.processingDate,
      records: this.records,
      accepted,
      rejected,
      conflicts,
      duplicates,
      errors: this.errors,
    };
  }

  private reset(): void {
    this.lines = [];
    this.currentLine = 0;
    this.records = [];
    this.errors = [];
  }

  /**
   * Parse ACK header (HDR record)
   */
  private parseHeader(line: string): {
    version: string;
    receiverCode: string;
    senderCode: string;
    processingDate: string;
  } {
    if (!line.startsWith('HDR')) {
      throw new Error('Invalid ACK file: missing HDR record');
    }

    // HDR format varies by version, but basic fields are:
    // HDR + sender type (2) + sender code (varies) + receiver name + version info + dates

    // Try to extract basic info
    const senderCode = line.slice(5, 14).trim();
    const processingDate = line.slice(60, 68) || '';

    // Detect version from line content
    let version = '2.1';
    if (line.includes('2.20')) version = '2.2';
    if (line.includes('3.00')) version = '3.0';
    if (line.includes('3.10')) version = '3.1';

    return {
      version,
      receiverCode: '', // Will be from context
      senderCode,
      processingDate,
    };
  }

  /**
   * Parse a body record
   */
  private parseRecord(line: string): ACKRecord | null {
    const recordType = line.slice(0, 3);

    // Only process ACK-specific records
    if (recordType === 'ACK') {
      return this.parseACKRecord(line);
    }

    if (recordType === 'MSG') {
      return this.parseMSGRecord(line);
    }

    // Skip other record types (GRH, GRT, TRL, etc.)
    if (['GRH', 'GRT', 'TRL', 'HDR'].includes(recordType)) {
      return null;
    }

    // Unknown record type
    logger.debug('Unknown ACK record type', { recordType, line: line.slice(0, 50) });
    return null;
  }

  /**
   * Parse ACK (Acknowledgement) record
   * This is the main acknowledgement record that indicates status
   */
  private parseACKRecord(line: string): ACKRecord {
    // ACK record format (CWR 2.1/2.2):
    // ACK + Transaction Seq (8) + Record Seq (8) + Original Tx Type (3) + Original Tx Seq (8)
    // + Creation Title (60) + Submitter Work ID (14) + ISWC (11) + Status (2)
    // + Society Work ID (varies) + Date + Error Message...

    const transactionSequence = parseInt(line.slice(3, 11), 10) || 0;
    const recordSequence = parseInt(line.slice(11, 19), 10) || 0;
    const originalTransactionType = line.slice(19, 22).trim();
    const originalTransactionSequence = parseInt(line.slice(22, 30), 10) || 0;
    const creationTitle = line.slice(30, 90).trim();
    const workCode = line.slice(90, 104).trim();
    const iswc = line.slice(104, 115).trim() || undefined;

    // Status is at position 115-117
    const statusRaw = line.slice(115, 117).trim();
    const status = this.parseStatus(statusRaw);

    // Society work ID follows (14 chars typically)
    const societyWorkId = line.slice(117, 131).trim() || undefined;

    // Processing date (8 chars, YYYYMMDD)
    const processingDate = line.slice(131, 139).trim() || undefined;

    return {
      recordType: 'ACK',
      transactionSequence,
      recordSequence,
      originalTransactionType,
      originalTransactionSequence,
      creationTitle,
      workCode,
      iswc: iswc && iswc !== 'T0000000000' ? this.formatISWC(iswc) : undefined,
      status,
      societyWorkId,
      processingDate,
    };
  }

  /**
   * Parse MSG (Message) record
   * Contains error/warning messages for the transaction
   */
  private parseMSGRecord(line: string): ACKRecord {
    // MSG record format:
    // MSG + Transaction Seq (8) + Record Seq (8) + Message Type (1) + Original Record Seq (8)
    // + Record Type (3) + Message Level (1) + Validation Number (varies) + Message Text...

    const transactionSequence = parseInt(line.slice(3, 11), 10) || 0;
    const recordSequence = parseInt(line.slice(11, 19), 10) || 0;
    const messageType = line.slice(19, 20);
    const originalRecordSequence = parseInt(line.slice(20, 28), 10) || 0;
    const originalRecordType = line.slice(28, 31).trim();
    const messageLevel = line.slice(31, 32); // E=Error, F=Field, T=Transaction
    const validationNumber = line.slice(32, 40).trim();
    const messageText = line.slice(40).trim();

    return {
      recordType: 'MSG',
      transactionSequence,
      recordSequence,
      originalTransactionType: originalRecordType,
      originalTransactionSequence: originalRecordSequence,
      status: messageLevel === 'E' ? 'RJ' : 'RA', // Error = rejection
      errorMessage: messageText,
      messageLevel,
      validationNumber,
    };
  }

  /**
   * Parse status code
   */
  private parseStatus(raw: string): AckStatus {
    const statusMap: Record<string, AckStatus> = {
      'CO': 'CO',
      'DU': 'DU',
      'RA': 'RA',
      'AS': 'AS',
      'AC': 'AC',
      'SR': 'SR',
      'CR': 'CR',
      'RJ': 'RJ',
      'NP': 'NP',
    };

    return statusMap[raw.toUpperCase()] || 'RJ';
  }

  /**
   * Format ISWC with hyphens
   */
  private formatISWC(iswc: string): string {
    if (!iswc || iswc.length < 11) return iswc;

    // T-NNNNNNNNN-C format
    const cleaned = iswc.replace(/[^A-Z0-9]/gi, '');
    if (cleaned.length === 11 && cleaned.startsWith('T')) {
      return `T-${cleaned.slice(1, 10)}-${cleaned.slice(10)}`;
    }
    return iswc;
  }

  /**
   * Get human-readable status description
   */
  static getStatusDescription(status: AckStatus): string {
    const descriptions: Record<AckStatus, string> = {
      'CO': 'Conflict - Work conflicts with existing registration',
      'DU': 'Duplicate - Work already registered',
      'RA': 'Registration Accepted',
      'AS': 'Agreement Starts',
      'AC': 'Agreement Claim',
      'SR': 'Society Registration Complete',
      'CR': 'Claim Rejected',
      'RJ': 'Rejected',
      'NP': 'Not in Portfolio',
    };
    return descriptions[status] || 'Unknown Status';
  }

  /**
   * Check if status is successful
   */
  static isSuccessStatus(status: AckStatus): boolean {
    return ['RA', 'AS', 'AC', 'SR'].includes(status);
  }

  /**
   * Check if status requires attention
   */
  static requiresAttention(status: AckStatus): boolean {
    return ['CO', 'DU', 'CR', 'RJ', 'NP'].includes(status);
  }
}

// Export singleton
export const ackParser = new ACKParser();
