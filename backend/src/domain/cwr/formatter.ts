// ============================================================================
// PubFlow AI - CWR Field Formatter
// Handles fixed-width field formatting for CWR records
// ============================================================================

/**
 * Left-justify a string with padding
 */
export function ljust(value: string | undefined | null, width: number, fillChar = ' '): string {
  const str = (value ?? '').toString();
  if (str.length >= width) {
    return str.slice(0, width);
  }
  return str + fillChar.repeat(width - str.length);
}

/**
 * Right-justify a string with padding
 */
export function rjust(value: string | number | undefined | null, width: number, fillChar = ' '): string {
  const str = (value ?? '').toString();
  if (str.length >= width) {
    return str.slice(-width);
  }
  return fillChar.repeat(width - str.length) + str;
}

/**
 * Right-justify a number with zero padding
 */
export function zfill(value: number | undefined | null, width: number): string {
  return rjust(value ?? 0, width, '0');
}

/**
 * Format a date as YYYYMMDD
 */
export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '00000000';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '00000000';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * Format a time as HHMMSS
 */
export function formatTime(date: Date | string | undefined | null): string {
  if (!date) return '000000';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '000000';

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${hours}${minutes}${seconds}`;
}

/**
 * Format duration in seconds to HHMMSS
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '000000';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(secs).padStart(2, '0')}`;
}

/**
 * Format a share percentage for CWR (5 digits, 2 decimal implied)
 * e.g., 50.00% becomes "05000", 100.00% becomes "10000"
 */
export function formatShare(share: number | undefined | null): string {
  const value = share ?? 0;
  // CWR uses 5 digits with implied 2 decimal places (so 50.00% = 05000)
  const scaled = Math.round(value * 100);
  return String(scaled).padStart(5, '0');
}

/**
 * Format society code (3 chars, left-justified)
 */
export function formatSociety(code: string | undefined | null): string {
  if (!code) return '   ';
  return ljust(code.toUpperCase(), 3);
}

/**
 * Format society code for CWR 3.0 (4 chars)
 */
export function formatSociety4(code: string | undefined | null): string {
  if (!code) return '    ';
  return ljust(code.toUpperCase(), 4);
}

/**
 * Format IPI Name Number (11 digits, right-justified)
 */
export function formatIPI(ipi: string | undefined | null): string {
  if (!ipi) return '           '; // 11 spaces
  return rjust(ipi.replace(/\D/g, ''), 11, '0');
}

/**
 * Format IPI Base Number (13 chars, I-NNNNNNNNN-C format or left-justified)
 */
export function formatIPIBase(ipi: string | undefined | null): string {
  if (!ipi) return '             '; // 13 spaces
  return ljust(ipi, 13);
}

/**
 * Format ISWC (11 chars, T-NNNNNNNNN-C without hyphens)
 */
export function formatISWC(iswc: string | undefined | null): string {
  if (!iswc) return '           '; // 11 spaces
  // Remove hyphens and format
  return ljust(iswc.replace(/-/g, ''), 11);
}

/**
 * Format ISRC (12 chars, no hyphens)
 */
export function formatISRC(isrc: string | undefined | null): string {
  if (!isrc) return '            '; // 12 spaces
  return ljust(isrc.replace(/-/g, ''), 12);
}

/**
 * Normalize string for CWR (uppercase, remove invalid chars)
 */
export function cwrString(value: string | undefined | null): string {
  if (!value) return '';

  return value
    .toUpperCase()
    // Replace common diacritics
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace special characters
    .replace(/[ÀÁÂÃÄÅ]/g, 'A')
    .replace(/[ÈÉÊË]/g, 'E')
    .replace(/[ÌÍÎÏ]/g, 'I')
    .replace(/[ÒÓÔÕÖ]/g, 'O')
    .replace(/[ÙÚÛÜ]/g, 'U')
    .replace(/[ÑÝ]/g, 'N')
    .replace(/[Ç]/g, 'C')
    .replace(/[ß]/g, 'SS')
    .replace(/[Æ]/g, 'AE')
    .replace(/[Œ]/g, 'OE')
    .replace(/[—–]/g, '-')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Remove any remaining non-CWR characters
    .replace(/[^A-Z0-9 .,;:'"()\-\/\\&!?#@*+=%$]/g, '');
}

/**
 * Build a complete CWR record line with CRLF
 */
export function buildRecord(...fields: string[]): string {
  return fields.join('') + '\r\n';
}

/**
 * Spaces helper
 */
export function spaces(count: number): string {
  return ' '.repeat(count);
}

/**
 * Zeros helper
 */
export function zeros(count: number): string {
  return '0'.repeat(count);
}
