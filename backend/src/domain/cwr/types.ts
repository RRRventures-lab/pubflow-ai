// ============================================================================
// PubFlow AI - CWR Domain Types
// Based on CISAC CWR 2.1/2.2/3.0 specifications
// ============================================================================

export type CWRVersion = '21' | '22' | '30' | '31';

export type TransactionType = 'NWR' | 'REV' | 'ISW' | 'EXC' | 'ACK';

export type RecordType =
  | 'HDR' | 'GRH' | 'GRT' | 'TRL'
  | 'NWR' | 'REV' | 'WRK' | 'ISW' | 'EXC'
  | 'SPU' | 'SPT' | 'SWR' | 'SWT' | 'PWR'
  | 'OPU' | 'OPT' | 'OWR' | 'OWT'
  | 'ALT' | 'PER' | 'REC' | 'ORN' | 'XRF'
  | 'OWK' | 'VER' | 'ISR' | 'WRI' | 'MAN';

export type WriterRole = 'C' | 'A' | 'CA' | 'AR' | 'AD' | 'TR' | 'SA' | 'SR';
export type PublisherRole = 'E' | 'AM' | 'SE' | 'PA' | 'ES';
export type TitleType = 'AT' | 'TE' | 'FT' | 'IT' | 'OT' | 'TT' | 'PT' | 'RT' | 'ET' | 'OL' | 'AL';

// Work data for CWR generation
export interface CWRWorkData {
  id: string;
  title: string;
  workCode: string;
  iswc?: string;
  duration?: number;
  versionType: 'ORI' | 'MOD';
  recordedIndicator: 'Y' | 'N' | 'U';
  originalTitle?: string;
  alternateTitles: CWRAlternateTitle[];
  writers: CWRWriterData[];
  publishers: CWRPublisherData[];
  recordings: CWRRecordingData[];
  performers: CWRPerformerData[];
}

export interface CWRWriterData {
  code: string;
  firstName: string;
  lastName: string;
  ipiNameNumber?: string;
  ipiBaseNumber?: string;
  role: WriterRole;
  prSociety?: string;
  mrSociety?: string;
  srSociety?: string;
  prShare: number;
  mrShare: number;
  srShare: number;
  isControlled: boolean;
  publisherCode?: string;
}

export interface CWRPublisherData {
  code: string;
  name: string;
  ipiNameNumber?: string;
  ipiBaseNumber?: string;
  role: PublisherRole;
  prSociety?: string;
  mrSociety?: string;
  srSociety?: string;
  prShare: number;
  mrShare: number;
  srShare: number;
  saan?: string;
  chainSequence: number;
}

export interface CWRAlternateTitle {
  title: string;
  type: TitleType;
  language?: string;
}

export interface CWRRecordingData {
  isrc?: string;
  title?: string;
  versionTitle?: string;
  releaseDate?: string;
  duration?: number;
  recordLabel?: string;
  displayArtist?: string;
}

export interface CWRPerformerData {
  firstName?: string;
  lastName: string;
  ipiNameNumber?: string;
  isni?: string;
}

// Generation context
export interface CWRGenerationContext {
  version: CWRVersion;
  submitterCode: string;
  submitterName: string;
  submitterIPI: string;
  receiverCode: string;
  transactionType: TransactionType;
  creationDate: Date;
  filename: string;
}

// Generated CWR file
export interface CWRGenerationResult {
  filename: string;
  content: string;
  version: CWRVersion;
  transactionCount: number;
  recordCount: number;
  works: string[];
  errors: string[];
  warnings: string[];
}
