// ============================================================================
// PubFlow AI - Statement Parser Service
// Parses royalty statements from CSV, Excel, and EDI formats
// ============================================================================

import { parse as parseCSV } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { logger } from '../../infrastructure/logging/logger.js';
import type {
  StatementFormat,
  StatementRow,
  ColumnMapping,
  ColumnTransform,
  StatementSource,
} from './types.js';

// ============================================================================
// Parser Result
// ============================================================================

export interface ParseResult {
  rows: StatementRow[];
  headers: string[];
  format: StatementFormat;
  detectedSource?: StatementSource;
  warnings: string[];
  errors: string[];
  metadata: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
    columns: string[];
  };
}

// ============================================================================
// Statement Parser
// ============================================================================

export class StatementParser {
  private warnings: string[] = [];
  private errors: string[] = [];

  /**
   * Parse statement file content
   */
  async parse(
    content: Buffer | string,
    filename: string,
    options?: {
      format?: StatementFormat;
      columnMappings?: ColumnMapping[];
      skipRows?: number;
      maxRows?: number;
    }
  ): Promise<ParseResult> {
    this.warnings = [];
    this.errors = [];

    // Detect format from filename or content
    const format = options?.format || this.detectFormat(filename, content);

    logger.info('Parsing statement', { filename, format });

    let rawRows: Record<string, any>[];
    let headers: string[];

    try {
      switch (format) {
        case 'csv':
          ({ rows: rawRows, headers } = this.parseCSV(content));
          break;
        case 'excel':
          ({ rows: rawRows, headers } = this.parseExcel(content));
          break;
        case 'edi':
          ({ rows: rawRows, headers } = this.parseEDI(content));
          break;
        case 'json':
          ({ rows: rawRows, headers } = this.parseJSON(content));
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      this.errors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return {
        rows: [],
        headers: [],
        format,
        warnings: this.warnings,
        errors: this.errors,
        metadata: {
          totalRows: 0,
          validRows: 0,
          skippedRows: 0,
          columns: [],
        },
      };
    }

    // Apply skip rows
    if (options?.skipRows && options.skipRows > 0) {
      rawRows = rawRows.slice(options.skipRows);
    }

    // Apply max rows
    if (options?.maxRows && options.maxRows > 0) {
      rawRows = rawRows.slice(0, options.maxRows);
    }

    // Detect source from content
    const detectedSource = this.detectSource(headers, rawRows);

    // Transform rows
    const rows = this.transformRows(rawRows, options?.columnMappings);

    logger.info('Statement parsed', {
      filename,
      format,
      detectedSource,
      totalRows: rawRows.length,
      validRows: rows.length,
    });

    return {
      rows,
      headers,
      format,
      detectedSource,
      warnings: this.warnings,
      errors: this.errors,
      metadata: {
        totalRows: rawRows.length,
        validRows: rows.length,
        skippedRows: rawRows.length - rows.length,
        columns: headers,
      },
    };
  }

  /**
   * Detect file format
   */
  private detectFormat(filename: string, content: Buffer | string): StatementFormat {
    const ext = filename.toLowerCase().split('.').pop();

    switch (ext) {
      case 'csv':
      case 'txt':
      case 'tsv':
        return 'csv';
      case 'xlsx':
      case 'xls':
      case 'xlsb':
        return 'excel';
      case 'edi':
      case 'x12':
        return 'edi';
      case 'json':
        return 'json';
      default:
        // Try to detect from content
        if (typeof content === 'string') {
          if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            return 'json';
          }
          if (content.includes('ISA*') || content.includes('UNB+')) {
            return 'edi';
          }
        }
        return 'csv'; // Default
    }
  }

  /**
   * Parse CSV content
   */
  private parseCSV(content: Buffer | string): { rows: Record<string, any>[]; headers: string[] } {
    const text = typeof content === 'string' ? content : content.toString('utf-8');

    // Detect delimiter
    const firstLine = text.split('\n')[0];
    const delimiter = this.detectDelimiter(firstLine);

    const records = parseCSV(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      relax_column_count: true,
      trim: true,
    });

    const headers = records.length > 0 ? Object.keys(records[0]) : [];

    return { rows: records, headers };
  }

  /**
   * Detect CSV delimiter
   */
  private detectDelimiter(line: string): string {
    const delimiters = [',', '\t', ';', '|'];
    let maxCount = 0;
    let bestDelimiter = ',';

    for (const d of delimiters) {
      const count = (line.match(new RegExp(`\\${d}`, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = d;
      }
    }

    return bestDelimiter;
  }

  /**
   * Parse Excel content
   */
  private parseExcel(content: Buffer | string): { rows: Record<string, any>[]; headers: string[] } {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'base64') : content;

    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const records = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
      raw: false, // Get formatted strings
    });

    const headers = records.length > 0 ? Object.keys(records[0]) : [];

    return { rows: records, headers };
  }

  /**
   * Parse EDI content (basic support)
   */
  private parseEDI(content: Buffer | string): { rows: Record<string, any>[]; headers: string[] } {
    const text = typeof content === 'string' ? content : content.toString('utf-8');

    // Basic EDI parsing - extract relevant segments
    // This is simplified; production would use a proper EDI parser
    const rows: Record<string, any>[] = [];
    const segments = text.split(/~|\n/).filter(s => s.trim());

    let currentRow: Record<string, any> = {};

    for (const segment of segments) {
      const elements = segment.split('*');
      const segmentId = elements[0];

      // Example: Parse CUR (Currency) segment
      if (segmentId === 'CUR') {
        currentRow.currency = elements[2];
      }

      // Example: Parse AMT (Amount) segment
      if (segmentId === 'AMT') {
        currentRow.amount = parseFloat(elements[2]) || 0;
      }

      // Example: Parse N1 (Name) segment
      if (segmentId === 'N1') {
        if (elements[1] === 'WR') {
          currentRow.writerName = elements[2];
        } else if (elements[1] === 'PB') {
          currentRow.publisherName = elements[2];
        }
      }

      // Example: Parse REF (Reference) segment
      if (segmentId === 'REF') {
        if (elements[1] === 'WK') {
          currentRow.workCode = elements[2];
        } else if (elements[1] === 'IS') {
          currentRow.iswc = elements[2];
        }
      }

      // Start new row on certain segments
      if (segmentId === 'LX' && Object.keys(currentRow).length > 0) {
        rows.push(currentRow);
        currentRow = {};
      }
    }

    // Don't forget last row
    if (Object.keys(currentRow).length > 0) {
      rows.push(currentRow);
    }

    this.warnings.push('EDI parsing is basic - verify results');

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, headers };
  }

  /**
   * Parse JSON content
   */
  private parseJSON(content: Buffer | string): { rows: Record<string, any>[]; headers: string[] } {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    const data = JSON.parse(text);

    // Handle array or object with data array
    let rows: Record<string, any>[];
    if (Array.isArray(data)) {
      rows = data;
    } else if (data.rows && Array.isArray(data.rows)) {
      rows = data.rows;
    } else if (data.data && Array.isArray(data.data)) {
      rows = data.data;
    } else {
      rows = [data];
    }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, headers };
  }

  /**
   * Detect statement source from content
   */
  private detectSource(headers: string[], rows: Record<string, any>[]): StatementSource | undefined {
    const headerStr = headers.join(' ').toLowerCase();
    const sampleData = rows.slice(0, 10).map(r => JSON.stringify(r).toLowerCase()).join(' ');

    // ASCAP patterns
    if (headerStr.includes('ascap') || sampleData.includes('ascap')) {
      return 'ASCAP';
    }

    // BMI patterns
    if (headerStr.includes('bmi') || sampleData.includes('broadcast music')) {
      return 'BMI';
    }

    // Spotify patterns
    if (headerStr.includes('spotify') || headerStr.includes('stream count') ||
        sampleData.includes('spotify')) {
      return 'SPOTIFY';
    }

    // Apple Music patterns
    if (headerStr.includes('apple') || sampleData.includes('apple music')) {
      return 'APPLE';
    }

    // YouTube patterns
    if (headerStr.includes('youtube') || headerStr.includes('content id') ||
        sampleData.includes('youtube')) {
      return 'YOUTUBE';
    }

    // PRS patterns
    if (headerStr.includes('prs') || sampleData.includes('prs for music')) {
      return 'PRS';
    }

    // GEMA patterns
    if (headerStr.includes('gema') || sampleData.includes('gema')) {
      return 'GEMA';
    }

    return undefined;
  }

  /**
   * Transform raw rows to StatementRow format
   */
  private transformRows(
    rawRows: Record<string, any>[],
    mappings?: ColumnMapping[]
  ): StatementRow[] {
    const rows: StatementRow[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      try {
        const raw = rawRows[i];
        const row = this.transformRow(raw, i + 1, mappings);

        // Skip rows without amount
        if (row.amount === 0 && !raw.amount) {
          continue;
        }

        rows.push(row);
      } catch (error) {
        this.warnings.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Transform error'}`);
      }
    }

    return rows;
  }

  /**
   * Transform a single row
   */
  private transformRow(
    raw: Record<string, any>,
    rowNumber: number,
    mappings?: ColumnMapping[]
  ): StatementRow {
    const row: StatementRow = {
      rowNumber,
      rawData: raw,
      amount: 0,
      matchStatus: 'pending',
    };

    if (mappings && mappings.length > 0) {
      // Apply explicit mappings
      for (const mapping of mappings) {
        if (mapping.targetField && raw[mapping.sourceColumn] !== undefined) {
          const value = this.applyTransform(raw[mapping.sourceColumn], mapping.transform);
          (row as any)[mapping.targetField] = value;
        }
      }
    } else {
      // Auto-map common column names
      this.autoMapColumns(raw, row);
    }

    return row;
  }

  /**
   * Auto-map common column names
   */
  private autoMapColumns(raw: Record<string, any>, row: StatementRow): void {
    const columnMap: Record<string, keyof StatementRow> = {
      // Title variations
      'title': 'workTitle',
      'work_title': 'workTitle',
      'song_title': 'workTitle',
      'song': 'workTitle',
      'work': 'workTitle',
      'track': 'workTitle',
      'track_title': 'workTitle',

      // Writer variations
      'writer': 'writerName',
      'writer_name': 'writerName',
      'composer': 'writerName',
      'author': 'writerName',
      'songwriter': 'writerName',

      // ISWC variations
      'iswc': 'iswc',
      'iswc_code': 'iswc',
      'work_id': 'iswc',

      // ISRC variations
      'isrc': 'isrc',
      'isrc_code': 'isrc',
      'recording_id': 'isrc',

      // Work code variations
      'work_code': 'workCode',
      'publisher_work_id': 'workCode',
      'society_work_id': 'workCode',
      'internal_id': 'workCode',

      // Performer variations
      'performer': 'performerName',
      'artist': 'performerName',
      'performing_artist': 'performerName',

      // Amount variations
      'amount': 'amount',
      'royalty': 'amount',
      'royalty_amount': 'amount',
      'earnings': 'amount',
      'payment': 'amount',
      'net_amount': 'amount',
      'gross_amount': 'amount',

      // Usage count variations
      'plays': 'usageCount',
      'streams': 'usageCount',
      'usage_count': 'usageCount',
      'units': 'usageCount',

      // Territory variations
      'territory': 'territory',
      'country': 'territory',
      'region': 'territory',

      // Currency variations
      'currency': 'currency',
      'currency_code': 'currency',
    };

    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '_');

      // Check direct mapping
      if (columnMap[normalizedKey]) {
        const targetField = columnMap[normalizedKey];
        (row as any)[targetField] = this.autoTransform(value, targetField);
      }

      // Also check partial matches
      for (const [pattern, targetField] of Object.entries(columnMap)) {
        if (normalizedKey.includes(pattern) && !(row as any)[targetField]) {
          (row as any)[targetField] = this.autoTransform(value, targetField);
        }
      }
    }
  }

  /**
   * Auto-transform value based on target field
   */
  private autoTransform(value: any, field: keyof StatementRow): any {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    switch (field) {
      case 'amount':
      case 'usageCount':
        return this.parseNumber(value);

      case 'iswc':
        return this.normalizeISWC(String(value));

      case 'isrc':
        return this.normalizeISRC(String(value));

      case 'periodStart':
      case 'periodEnd':
        return this.parseDate(value);

      default:
        return String(value).trim();
    }
  }

  /**
   * Apply column transform
   */
  private applyTransform(value: any, transform?: ColumnTransform): any {
    if (value === null || value === undefined) {
      return undefined;
    }

    switch (transform) {
      case 'uppercase':
        return String(value).toUpperCase();

      case 'lowercase':
        return String(value).toLowerCase();

      case 'trim':
        return String(value).trim();

      case 'parseNumber':
        return this.parseNumber(value);

      case 'parseDate':
        return this.parseDate(value);

      case 'splitName': {
        const name = String(value);
        if (name.includes(',')) {
          const [last, first] = name.split(',').map(s => s.trim());
          return { lastName: last, firstName: first };
        }
        return name;
      }

      case 'normalizeISWC':
        return this.normalizeISWC(String(value));

      case 'normalizeISRC':
        return this.normalizeISRC(String(value));

      default:
        return value;
    }
  }

  /**
   * Parse number from various formats
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }

    const str = String(value)
      .replace(/[^0-9.-]/g, '')  // Remove non-numeric except . and -
      .replace(/,/g, '');         // Remove thousands separator

    return parseFloat(str) || 0;
  }

  /**
   * Parse date from various formats
   */
  private parseDate(value: any): Date | undefined {
    if (value instanceof Date) {
      return value;
    }

    const str = String(value);

    // Try ISO format
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try common formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/,           // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/,         // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/,           // DD-MM-YYYY
      /^(\d{4})(\d{2})(\d{2})$/,             // YYYYMMDD
    ];

    for (const format of formats) {
      const match = str.match(format);
      if (match) {
        // Parse based on format
        // Simplified - production would handle each format properly
        return new Date(str);
      }
    }

    return undefined;
  }

  /**
   * Normalize ISWC format
   */
  private normalizeISWC(value: string): string | undefined {
    const cleaned = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    if (cleaned.length === 11 && cleaned.startsWith('T')) {
      return `T-${cleaned.slice(1, 10)}-${cleaned.slice(10)}`;
    }

    if (cleaned.length >= 10) {
      return cleaned;
    }

    return undefined;
  }

  /**
   * Normalize ISRC format
   */
  private normalizeISRC(value: string): string | undefined {
    const cleaned = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    if (cleaned.length === 12) {
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5, 7)}-${cleaned.slice(7)}`;
    }

    if (cleaned.length >= 12) {
      return cleaned.slice(0, 12);
    }

    return undefined;
  }
}

// Export singleton
export const statementParser = new StatementParser();
