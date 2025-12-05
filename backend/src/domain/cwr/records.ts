// ============================================================================
// PubFlow AI - CWR Record Builders
// Individual record type builders for CWR 2.1/2.2/3.0
// Based on: ~/Desktop/cisac-repos/django-music-publisher/music_publisher/cwr_templates.py
// ============================================================================

import {
  ljust, rjust, zfill, formatDate, formatTime, formatDuration,
  formatShare, formatSociety, formatSociety4, formatIPI, formatIPIBase,
  formatISWC, formatISRC, cwrString, buildRecord, spaces, zeros
} from './formatter.js';
import type {
  CWRVersion, TransactionType, RecordType, CWRWorkData,
  CWRWriterData, CWRPublisherData, CWRAlternateTitle,
  CWRRecordingData, CWRPerformerData, CWRGenerationContext
} from './types.js';

// ============================================================================
// Header Record (HDR)
// ============================================================================

export function buildHDR(ctx: CWRGenerationContext): string {
  const date = formatDate(ctx.creationDate);
  const time = formatTime(ctx.creationDate);

  if (ctx.version === '21') {
    // CWR 2.1: HDRPB + 9-digit IPI slice
    const ipiSlice = ctx.submitterIPI.slice(-9);
    return buildRecord(
      'HDRPB',
      rjust(ipiSlice, 9),
      ljust(cwrString(ctx.submitterName), 45),
      '01.10',
      date,
      time,
      date,
      spaces(15)
    );
  }

  if (ctx.version === '22') {
    // CWR 2.2: Same as 2.1 but with version and software fields
    const ipiSlice = ctx.submitterIPI.slice(-9);
    return buildRecord(
      'HDRPB',
      rjust(ipiSlice, 9),
      ljust(cwrString(ctx.submitterName), 45),
      '01.10',
      date,
      time,
      date,
      spaces(15),
      '2.2002',
      ljust('PUBFLOW AI', 30),
      ljust('1.0.0', 30)
    );
  }

  // CWR 3.0/3.1
  const versionStr = ctx.version === '31' ? '3.1000' : '3.0000';
  return buildRecord(
    'HDRPB',
    ljust(ctx.submitterCode, 4),
    ljust(cwrString(ctx.submitterName), 45),
    spaces(11),
    date,
    time,
    date,
    spaces(15),
    versionStr,
    ljust('PUBFLOW AI', 30),
    ljust('1.0.0', 30),
    ljust(ctx.filename, 27)
  );
}

// ============================================================================
// Group Header Record (GRH)
// ============================================================================

export function buildGRH(ctx: CWRGenerationContext): string {
  if (ctx.version === '21') {
    return buildRecord(
      'GRH',
      ljust(ctx.transactionType, 3),
      '0000102.10',
      zeros(10),
      spaces(2)
    );
  }

  if (ctx.version === '22') {
    return buildRecord(
      'GRH',
      ljust(ctx.transactionType, 3),
      '0000102.20',
      zeros(10),
      spaces(2)
    );
  }

  // CWR 3.0/3.1
  const versionStr = ctx.version === '31' ? '03.10' : '03.00';
  return buildRecord(
    'GRH',
    ljust(ctx.transactionType, 3),
    '00001',
    versionStr,
    zeros(10)
  );
}

// ============================================================================
// Work Registration Record (NWR/REV/WRK)
// ============================================================================

export function buildWRK(
  ctx: CWRGenerationContext,
  work: CWRWorkData,
  transactionSeq: number,
  recordType: 'NWR' | 'REV' = 'NWR'
): string {
  const recType = ctx.version.startsWith('3') ? 'WRK' : recordType;

  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      recType,
      rjust(transactionSeq, 8),
      zeros(8), // Record sequence always 0 for transaction header
      ljust(cwrString(work.title), 60),
      spaces(2), // Language code
      ljust(work.workCode, 14),
      formatISWC(work.iswc),
      zeros(8), // Date of publication
      spaces(12), // Music arrangement, lyric adaptation, composite type
      'UNC', // Version type - UNC for unspecified
      formatDuration(work.duration),
      work.recordedIndicator || 'U',
      spaces(6), // Text/music relationship
      work.versionType || 'ORI',
      spaces(2),
      spaces(40), // Contact fields
      'N', // Grand rights indicator
      zeros(11), // Composite component count
      spaces(51),
      'N' // Priority flag
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'WRK',
    rjust(transactionSeq, 8),
    zeros(8),
    ljust(cwrString(work.title), 60),
    spaces(2),
    ljust(work.workCode, 14),
    formatISWC(work.iswc),
    zeros(8),
    spaces(12),
    'UNC',
    formatDuration(work.duration),
    work.recordedIndicator || 'U',
    spaces(6),
    work.versionType || 'ORI',
    'N', // Grand rights
    zeros(11),
    spaces(51),
    'N'
  );
}

// ============================================================================
// Publisher Record (SPU - Publisher Controlled)
// ============================================================================

export function buildSPU(
  ctx: CWRGenerationContext,
  pub: CWRPublisherData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'SPU',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      rjust(pub.chainSequence, 2),
      ljust(pub.code, 9),
      ljust(cwrString(pub.name), 45),
      ' ',
      ljust(pub.role || 'E', 2),
      zeros(9),
      formatIPI(pub.ipiNameNumber),
      spaces(14),
      formatSociety(pub.prSociety),
      formatShare(pub.prShare),
      formatSociety(pub.mrSociety),
      formatShare(pub.mrShare),
      formatSociety(pub.srSociety),
      formatShare(pub.srShare),
      ' N ',
      formatIPIBase(pub.ipiBaseNumber),
      spaces(14),
      ljust(pub.saan || '', 14),
      spaces(2),
      ' ' // USA License indicator
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'SPU',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    '01', // Chain sequence
    ljust(pub.code, 9),
    ljust(cwrString(pub.name), 45),
    'N',
    ljust(pub.role || 'E', 2),
    zeros(9),
    formatIPI(pub.ipiNameNumber),
    formatIPIBase(pub.ipiBaseNumber),
    ' '
  );
}

// ============================================================================
// Publisher Territory Record (SPT)
// ============================================================================

export function buildSPT(
  ctx: CWRGenerationContext,
  pub: CWRPublisherData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'SPT',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(pub.code, 9),
      spaces(6),
      formatShare(pub.prShare),
      formatShare(pub.mrShare),
      formatShare(pub.srShare),
      'I', // Include/Exclude indicator
      '2136', // World territory
      'N', // Shares change
      '001' // Sequence
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'SPT',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    '001', // Sequence
    ljust(pub.code, 9),
    formatShare(pub.prShare),
    formatShare(pub.mrShare),
    formatShare(pub.srShare),
    'I',
    '2136',
    formatSociety4(pub.prSociety),
    formatSociety4(pub.mrSociety),
    formatSociety4(pub.srSociety),
    spaces(32),
    '0000' // Post-term collection status
  );
}

// ============================================================================
// Writer Record (SWR - Writer Controlled)
// ============================================================================

export function buildSWR(
  ctx: CWRGenerationContext,
  writer: CWRWriterData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'SWR',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(writer.code, 9),
      ljust(cwrString(writer.lastName), 45),
      ljust(cwrString(writer.firstName), 30),
      ' ',
      ljust(writer.role, 2),
      zeros(9),
      formatIPI(writer.ipiNameNumber),
      formatSociety(writer.prSociety),
      formatShare(writer.prShare),
      formatSociety(writer.mrSociety),
      formatShare(writer.mrShare),
      formatSociety(writer.srSociety),
      formatShare(writer.srShare),
      ' N  ',
      formatIPIBase(writer.ipiBaseNumber),
      spaces(13)
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'SWR',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    ljust(writer.code, 9),
    ljust(cwrString(writer.lastName), 45),
    ljust(cwrString(writer.firstName), 30),
    'N', // Writer unknown indicator
    ljust(writer.role, 2),
    formatIPI(writer.ipiNameNumber),
    formatIPIBase(writer.ipiBaseNumber),
    ' N  '
  );
}

// ============================================================================
// Writer Territory Record (SWT)
// ============================================================================

export function buildSWT(
  ctx: CWRGenerationContext,
  writer: CWRWriterData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'SWT',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(writer.code, 9),
      formatShare(writer.prShare),
      formatShare(writer.mrShare),
      formatShare(writer.srShare),
      'I',
      '2136',
      'N',
      '001'
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'SWT',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    '001',
    ljust(writer.code, 9),
    formatShare(writer.prShare),
    formatShare(writer.mrShare),
    formatShare(writer.srShare),
    'I',
    '2136',
    formatSociety4(writer.prSociety),
    formatSociety4(writer.mrSociety),
    formatSociety4(writer.srSociety),
    spaces(32),
    '0000'
  );
}

// ============================================================================
// Publisher for Writer Record (PWR)
// ============================================================================

export function buildPWR(
  ctx: CWRGenerationContext,
  writer: CWRWriterData,
  pub: CWRPublisherData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21') {
    return buildRecord(
      'PWR',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(pub.code, 9),
      ljust(cwrString(pub.name), 45),
      spaces(14),
      ljust(pub.saan || '', 14),
      ljust(writer.code, 9)
    );
  }

  if (ctx.version === '22') {
    return buildRecord(
      'PWR',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(pub.code, 9),
      ljust(cwrString(pub.name), 45),
      spaces(14),
      ljust(pub.saan || '', 14),
      ljust(writer.code, 9),
      '01' // Publisher sequence
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'PWR',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    rjust(pub.chainSequence, 2),
    ljust(pub.code, 9),
    ljust(writer.code, 9),
    spaces(14),
    formatSociety4(pub.prSociety),
    ljust(pub.saan || '', 14),
    '  ' // Agreement type
  );
}

// ============================================================================
// Other Publisher Record (OPU - Other publisher, uncontrolled)
// ============================================================================

export function buildOPU(
  ctx: CWRGenerationContext,
  transactionSeq: number,
  recordSeq: number,
  sequence: number,
  prShare: number,
  mrShare: number,
  srShare: number
): string {
  return buildRecord(
    'OPU',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    rjust(sequence, 2),
    spaces(54),
    'YE ', // Publisher unknown, controlled
    zeros(11),
    zeros(9),
    spaces(14),
    '   ',
    formatShare(prShare),
    '   ',
    formatShare(mrShare),
    '   ',
    formatShare(srShare),
    ' N',
    spaces(45)
  );
}

// ============================================================================
// Other Writer Record (OWR - Other writer, uncontrolled)
// ============================================================================

export function buildOWR(
  ctx: CWRGenerationContext,
  writer: CWRWriterData,
  transactionSeq: number,
  recordSeq: number
): string {
  return buildRecord(
    'OWR',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    ljust(writer.code, 9),
    ljust(cwrString(writer.lastName), 45),
    ljust(cwrString(writer.firstName), 30),
    ' ', // Writer unknown indicator
    ljust(writer.role, 2),
    zeros(9),
    formatIPI(writer.ipiNameNumber),
    formatSociety(writer.prSociety),
    formatShare(writer.prShare),
    formatSociety(writer.mrSociety),
    formatShare(writer.mrShare),
    formatSociety(writer.srSociety),
    formatShare(writer.srShare),
    '    ',
    formatIPIBase(writer.ipiBaseNumber),
    spaces(13)
  );
}

// ============================================================================
// Alternate Title Record (ALT)
// ============================================================================

export function buildALT(
  ctx: CWRGenerationContext,
  altTitle: CWRAlternateTitle,
  transactionSeq: number,
  recordSeq: number
): string {
  return buildRecord(
    'ALT',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    ljust(cwrString(altTitle.title), 60),
    ljust(altTitle.type || 'AT', 2),
    ljust(altTitle.language || '', 2)
  );
}

// ============================================================================
// Performing Artist Record (PER)
// ============================================================================

export function buildPER(
  ctx: CWRGenerationContext,
  performer: CWRPerformerData,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'PER',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      ljust(cwrString(performer.lastName), 45),
      ljust(cwrString(performer.firstName || ''), 30),
      spaces(24)
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'PER',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    ljust(cwrString(performer.lastName), 45),
    ljust(cwrString(performer.firstName || ''), 30),
    formatIPI(performer.ipiNameNumber),
    ljust(performer.isni || '', 16),
    spaces(5)
  );
}

// ============================================================================
// Recording Detail Record (REC)
// ============================================================================

export function buildREC(
  ctx: CWRGenerationContext,
  recording: CWRRecordingData,
  workCode: string,
  transactionSeq: number,
  recordSeq: number
): string {
  if (ctx.version === '21') {
    return buildRecord(
      'REC',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      formatDate(recording.releaseDate) || '00000000',
      spaces(60),
      formatDuration(recording.duration) || '000000',
      spaces(5),
      spaces(151),
      formatISRC(recording.isrc),
      spaces(5)
    );
  }

  if (ctx.version === '22') {
    return buildRecord(
      'REC',
      rjust(transactionSeq, 8),
      rjust(recordSeq, 8),
      formatDate(recording.releaseDate) || '00000000',
      spaces(60),
      formatDuration(recording.duration) || '000000',
      spaces(5),
      spaces(151),
      formatISRC(recording.isrc),
      spaces(5),
      ljust(cwrString(recording.title || ''), 60),
      ljust(cwrString(recording.versionTitle || ''), 60),
      ljust(cwrString(recording.displayArtist || ''), 60),
      ljust(cwrString(recording.recordLabel || ''), 60),
      spaces(20), // ISRC validity
      ljust(workCode, 14)
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'REC',
    rjust(transactionSeq, 8),
    rjust(recordSeq, 8),
    formatDate(recording.releaseDate) || '00000000',
    formatDuration(recording.duration) || '000000',
    formatISRC(recording.isrc),
    ljust(cwrString(recording.title || ''), 60),
    ljust(cwrString(recording.versionTitle || ''), 60),
    ljust(cwrString(recording.displayArtist || ''), 60),
    spaces(11),
    spaces(16), // ISNI
    ljust(cwrString(recording.recordLabel || ''), 60),
    spaces(20),
    ljust(workCode, 14)
  );
}

// ============================================================================
// Group Trailer Record (GRT)
// ============================================================================

export function buildGRT(
  ctx: CWRGenerationContext,
  transactionCount: number,
  recordCount: number
): string {
  if (ctx.version === '21' || ctx.version === '22') {
    return buildRecord(
      'GRT',
      '00001',
      rjust(transactionCount, 8),
      rjust(recordCount, 8),
      '   ',
      zeros(10)
    );
  }

  // CWR 3.0/3.1
  return buildRecord(
    'GRT',
    '00001',
    rjust(transactionCount, 8),
    rjust(recordCount, 8)
  );
}

// ============================================================================
// Transmission Trailer Record (TRL)
// ============================================================================

export function buildTRL(
  ctx: CWRGenerationContext,
  transactionCount: number,
  recordCount: number
): string {
  return 'TRL' + '00001' + rjust(transactionCount, 8) + rjust(recordCount, 8);
  // Note: TRL does not end with CRLF
}
