// ============================================================================
// PubFlow AI - Validation Utilities
// Ported from: ~/Desktop/cisac-repos/django-music-publisher/music_publisher/validators.py
// And: ~/Desktop/cisac-repos/python-10-digit-ipi-name/10digitipiname.py
// ============================================================================

import type { ValidationResult } from '../types/index.js';

// --------------------------------------------------------------------------
// IPI Name Number Validation (Modulo 101)
// Reference: CISAC IPI System - 11 digit format with modulo 101 checksum
// --------------------------------------------------------------------------

/**
 * Validate an IPI Name Number
 * Format: NNNNNNNNNCC (11 digits)
 * Checksum: Last 2 digits = 101 - (first 9 digits mod 101), or 00 if result is 101
 */
export function validateIPI(ipi: string | null | undefined): ValidationResult {
  if (!ipi) {
    return { isValid: true, normalizedValue: undefined }; // IPI is optional
  }

  // Normalize: remove spaces, hyphens
  const normalized = ipi.replace(/[\s\-]/g, '');

  // Must be 11 digits
  if (!/^\d{11}$/.test(normalized)) {
    return {
      isValid: false,
      errors: ['IPI Name Number must be exactly 11 digits'],
    };
  }

  // Calculate checksum
  const baseNumber = parseInt(normalized.slice(0, 9), 10);
  const providedChecksum = parseInt(normalized.slice(9), 10);

  // Modulo 101 checksum
  const remainder = baseNumber % 101;
  const expectedChecksum = remainder === 0 ? 0 : 101 - remainder;

  if (providedChecksum !== expectedChecksum) {
    return {
      isValid: false,
      errors: [`Invalid IPI checksum. Expected ${expectedChecksum.toString().padStart(2, '0')}, got ${providedChecksum.toString().padStart(2, '0')}`],
    };
  }

  return { isValid: true, normalizedValue: normalized };
}

/**
 * Generate IPI Name Number checksum
 */
export function generateIPIChecksum(baseDigits: string): string {
  if (!/^\d{9}$/.test(baseDigits)) {
    throw new Error('IPI base must be exactly 9 digits');
  }

  const baseNumber = parseInt(baseDigits, 10);
  const remainder = baseNumber % 101;
  const checksum = remainder === 0 ? 0 : 101 - remainder;

  return baseDigits + checksum.toString().padStart(2, '0');
}

// --------------------------------------------------------------------------
// IPI Base Number Validation
// Format: I-NNNNNNNNN-C (weighted modulo 10 with weight 2)
// --------------------------------------------------------------------------

/**
 * Validate an IPI Base Number
 * Format: I-NNNNNNNNN-C or INNNNNNNNNC (13 chars with prefix/suffix, or 11 digits)
 */
export function validateIPIBase(ipiBase: string | null | undefined): ValidationResult {
  if (!ipiBase) {
    return { isValid: true, normalizedValue: undefined };
  }

  // Normalize: extract digits
  let normalized = ipiBase.toUpperCase().replace(/[\s\-]/g, '');

  // Handle I-prefix format
  if (normalized.startsWith('I')) {
    normalized = normalized.slice(1);
  }

  // Must be 10 digits now (9 base + 1 checksum)
  if (!/^\d{10}$/.test(normalized)) {
    return {
      isValid: false,
      errors: ['IPI Base Number must be 10 digits (or I-NNNNNNNNN-C format)'],
    };
  }

  // Weighted checksum (weight = 2)
  const baseDigits = normalized.slice(0, 9);
  const providedChecksum = parseInt(normalized.slice(9), 10);

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(baseDigits[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 2);
  }

  const expectedChecksum = (10 - (sum % 10)) % 10;

  if (providedChecksum !== expectedChecksum) {
    return {
      isValid: false,
      errors: [`Invalid IPI Base checksum. Expected ${expectedChecksum}, got ${providedChecksum}`],
    };
  }

  // Return in standard format
  return {
    isValid: true,
    normalizedValue: `I-${baseDigits}-${providedChecksum}`,
  };
}

// --------------------------------------------------------------------------
// ISWC Validation (Weighted Modulo 10)
// Format: T-NNNNNNNNN-C (T prefix, 9 digits, 1 check digit)
// --------------------------------------------------------------------------

/**
 * Validate an ISWC (International Standard Work Code)
 * Format: T-NNNNNNNNN-C
 * Checksum: Weighted sum of digits, weights = 1,2,1,2,1,2,1,2,1
 */
export function validateISWC(iswc: string | null | undefined): ValidationResult {
  if (!iswc) {
    return { isValid: true, normalizedValue: undefined };
  }

  // Normalize: uppercase, remove non-alphanumeric except hyphens
  let normalized = iswc.toUpperCase().replace(/[^A-Z0-9\-]/g, '');

  // Parse different formats
  let prefix = '';
  let digits = '';
  let checksum = '';

  // Format: T-NNNNNNNNN-C or T.NNNNNNNNN.C or TNNNNNNNNNC
  const fullMatch = normalized.match(/^T[\-\.]?(\d{9})[\-\.]?(\d)$/);
  if (fullMatch) {
    prefix = 'T';
    digits = fullMatch[1];
    checksum = fullMatch[2];
  } else {
    return {
      isValid: false,
      errors: ['ISWC must be in format T-NNNNNNNNN-C'],
    };
  }

  // Calculate weighted checksum
  // Weights: T=1, then alternating 1,2,1,2,1,2,1,2,1 for digits
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1];
  let sum = 1; // T = 1

  for (let i = 0; i < 9; i++) {
    const digit = parseInt(digits[i], 10);
    const weighted = digit * weights[i];
    // For weight 2, if result >= 10, add digits (e.g., 14 -> 1+4 = 5)
    sum += weighted >= 10 ? Math.floor(weighted / 10) + (weighted % 10) : weighted;
  }

  const expectedChecksum = (10 - (sum % 10)) % 10;
  const providedChecksum = parseInt(checksum, 10);

  if (providedChecksum !== expectedChecksum) {
    return {
      isValid: false,
      errors: [`Invalid ISWC checksum. Expected ${expectedChecksum}, got ${providedChecksum}`],
    };
  }

  return {
    isValid: true,
    normalizedValue: `T-${digits}-${checksum}`,
  };
}

/**
 * Generate ISWC checksum for given 9 digits
 */
export function generateISWCChecksum(digits: string): string {
  if (!/^\d{9}$/.test(digits)) {
    throw new Error('ISWC digits must be exactly 9 digits');
  }

  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1];
  let sum = 1; // T = 1

  for (let i = 0; i < 9; i++) {
    const digit = parseInt(digits[i], 10);
    const weighted = digit * weights[i];
    sum += weighted >= 10 ? Math.floor(weighted / 10) + (weighted % 10) : weighted;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return `T-${digits}-${checksum}`;
}

// --------------------------------------------------------------------------
// ISRC Validation
// Format: CC-XXX-YY-NNNNN (Country, Registrant, Year, Designation)
// --------------------------------------------------------------------------

/**
 * Validate an ISRC (International Standard Recording Code)
 * Format: CC-XXX-YY-NNNNN (12 characters total)
 */
export function validateISRC(isrc: string | null | undefined): ValidationResult {
  if (!isrc) {
    return { isValid: true, normalizedValue: undefined };
  }

  // Normalize: uppercase, remove hyphens and spaces
  const normalized = isrc.toUpperCase().replace(/[\s\-]/g, '');

  // Must be 12 characters
  if (normalized.length !== 12) {
    return {
      isValid: false,
      errors: ['ISRC must be 12 characters'],
    };
  }

  // Format: CCXXXYYNNNN (CC=country, XXX=registrant, YY=year, NNNNN=designation)
  const pattern = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
  if (!pattern.test(normalized)) {
    return {
      isValid: false,
      errors: ['ISRC must be in format CC-XXX-YY-NNNNN (Country-Registrant-Year-Designation)'],
    };
  }

  // Format nicely
  const country = normalized.slice(0, 2);
  const registrant = normalized.slice(2, 5);
  const year = normalized.slice(5, 7);
  const designation = normalized.slice(7, 12);

  return {
    isValid: true,
    normalizedValue: `${country}-${registrant}-${year}-${designation}`,
  };
}

// --------------------------------------------------------------------------
// EAN-13 Validation (Barcode)
// --------------------------------------------------------------------------

/**
 * Validate an EAN-13 barcode
 * Checksum: Odd positions * 1, even positions * 3, sum mod 10 = 0
 */
export function validateEAN13(ean: string | null | undefined): ValidationResult {
  if (!ean) {
    return { isValid: true, normalizedValue: undefined };
  }

  const normalized = ean.replace(/[\s\-]/g, '');

  if (!/^\d{13}$/.test(normalized)) {
    return {
      isValid: false,
      errors: ['EAN-13 must be exactly 13 digits'],
    };
  }

  // Calculate checksum
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(normalized[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const expectedChecksum = (10 - (sum % 10)) % 10;
  const providedChecksum = parseInt(normalized[12], 10);

  if (providedChecksum !== expectedChecksum) {
    return {
      isValid: false,
      errors: [`Invalid EAN-13 checksum. Expected ${expectedChecksum}, got ${providedChecksum}`],
    };
  }

  return { isValid: true, normalizedValue: normalized };
}

// --------------------------------------------------------------------------
// CISAC Society Code Validation
// --------------------------------------------------------------------------

const VALID_SOCIETY_CODES = new Set([
  'ASCAP', 'BMI', 'SESAC', 'GMR', 'SOCAN', // North America
  'PRS', 'MCPS', 'PPL', // UK
  'SACEM', 'SDRM', // France
  'GEMA', // Germany
  'SGAE', // Spain
  'SIAE', // Italy
  'JASRAC', // Japan
  'APRA', 'AMCOS', 'PPCA', // Australia
  'COMPASS', // Singapore
  'MUST', // Taiwan
  'KOMCA', // Korea
  // Add more as needed
]);

/**
 * Validate a CISAC society code
 */
export function validateSocietyCode(code: string | null | undefined): ValidationResult {
  if (!code) {
    return { isValid: true, normalizedValue: undefined };
  }

  const normalized = code.toUpperCase().trim();

  // Society codes are typically 2-6 characters
  if (!/^[A-Z]{2,6}$/.test(normalized)) {
    return {
      isValid: false,
      errors: ['Society code must be 2-6 uppercase letters'],
      warnings: VALID_SOCIETY_CODES.has(normalized) ? undefined : ['Society code not in known list'],
    };
  }

  return {
    isValid: true,
    normalizedValue: normalized,
    warnings: VALID_SOCIETY_CODES.has(normalized) ? undefined : ['Society code not in known list - please verify'],
  };
}

// --------------------------------------------------------------------------
// Share Percentage Validation
// --------------------------------------------------------------------------

/**
 * Validate a share percentage (0-100 with 2 decimal places max)
 */
export function validateShare(share: number | null | undefined): ValidationResult {
  if (share === null || share === undefined) {
    return { isValid: true };
  }

  if (typeof share !== 'number' || isNaN(share)) {
    return {
      isValid: false,
      errors: ['Share must be a valid number'],
    };
  }

  if (share < 0 || share > 100) {
    return {
      isValid: false,
      errors: ['Share must be between 0 and 100'],
    };
  }

  // Check decimal places (max 2)
  const decimalPlaces = (share.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return {
      isValid: false,
      errors: ['Share can have maximum 2 decimal places'],
    };
  }

  return { isValid: true, normalizedValue: share.toFixed(2) };
}

/**
 * Validate that shares in a work total 100% (or are correctly split)
 */
export function validateSharesTotal(shares: number[], expectedTotal = 100): ValidationResult {
  const total = shares.reduce((sum, s) => sum + s, 0);
  const tolerance = 0.01; // Allow for floating point errors

  if (Math.abs(total - expectedTotal) > tolerance) {
    return {
      isValid: false,
      errors: [`Shares total ${total.toFixed(2)}% but should equal ${expectedTotal}%`],
    };
  }

  return { isValid: true };
}

// --------------------------------------------------------------------------
// CWR-Safe String Validation
// --------------------------------------------------------------------------

const CWR_SAFE_CHARS = /^[A-Z0-9 .,;:'"()\-\/\\&!?#@*+=%$]*$/;
const CWR_INVALID_CHARS = /[^A-Z0-9 .,;:'"()\-\/\\&!?#@*+=%$]/g;

/**
 * Validate and normalize a string for CWR compatibility
 * CWR only supports a limited character set
 */
export function validateCWRString(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number
): ValidationResult {
  if (!value) {
    return { isValid: true, normalizedValue: '' };
  }

  // Uppercase for CWR
  let normalized = value.toUpperCase();

  // Replace common substitutions
  normalized = normalized
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
    .replace(/[""]/g, '"');

  // Check for remaining invalid characters
  const invalidChars = normalized.match(CWR_INVALID_CHARS);
  if (invalidChars) {
    const uniqueInvalid = [...new Set(invalidChars)];
    return {
      isValid: false,
      errors: [`${fieldName} contains invalid CWR characters: ${uniqueInvalid.join(', ')}`],
      normalizedValue: normalized.replace(CWR_INVALID_CHARS, ''),
    };
  }

  // Check length
  if (normalized.length > maxLength) {
    return {
      isValid: false,
      errors: [`${fieldName} exceeds maximum length of ${maxLength} characters`],
      normalizedValue: normalized.slice(0, maxLength),
      warnings: ['Value was truncated'],
    };
  }

  return { isValid: true, normalizedValue: normalized };
}

// --------------------------------------------------------------------------
// Title Normalization for Matching
// --------------------------------------------------------------------------

/**
 * Normalize a title for matching purposes
 * - Uppercase
 * - Remove articles (THE, A, AN)
 * - Remove punctuation
 * - Collapse whitespace
 */
export function normalizeTitle(title: string): string {
  let normalized = title.toUpperCase();

  // Remove leading articles
  normalized = normalized.replace(/^(THE |A |AN )/i, '');

  // Remove punctuation except apostrophes
  normalized = normalized.replace(/[^\w\s']/g, ' ');

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Generate phonetic encoding for fuzzy matching
 * Simple Double Metaphone-inspired encoding
 */
export function phoneticEncode(value: string): string {
  let result = value.toUpperCase();

  // Common phonetic substitutions
  result = result
    .replace(/GH/g, 'G')
    .replace(/PH/g, 'F')
    .replace(/KN/g, 'N')
    .replace(/WR/g, 'R')
    .replace(/CK/g, 'K')
    .replace(/CE|CI|CY/g, 'S')
    .replace(/C/g, 'K')
    .replace(/Q/g, 'K')
    .replace(/X/g, 'KS')
    .replace(/[AEIOU]/g, '') // Remove vowels (except first)
    .replace(/(.)\1+/g, '$1'); // Remove consecutive duplicates

  return result;
}

// --------------------------------------------------------------------------
// Batch Validation
// --------------------------------------------------------------------------

export interface FieldValidation {
  field: string;
  value: unknown;
  validator: (value: unknown) => ValidationResult;
}

/**
 * Validate multiple fields at once
 */
export function validateFields(
  validations: FieldValidation[]
): { isValid: boolean; results: Record<string, ValidationResult> } {
  const results: Record<string, ValidationResult> = {};
  let isValid = true;

  for (const { field, value, validator } of validations) {
    const result = validator(value);
    results[field] = result;
    if (!result.isValid) {
      isValid = false;
    }
  }

  return { isValid, results };
}
