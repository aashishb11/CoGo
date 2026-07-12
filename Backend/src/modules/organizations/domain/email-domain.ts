import { BadRequestException } from '@nestjs/common';

// Intentionally strict: rejects anything without exactly one "@" followed by at
// least one dot — covers the most common invalid formats without pulling in a
// full email-validation library.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Extracts and normalises the domain part of an email address.
 *
 * "Student@Estudiantat.UPC.edu" → "estudiantat.upc.edu"
 *
 * Throws INVALID_EMAIL_FORMAT (400) when the input is not a valid email.
 */
export function extractEmailDomain(email: string): string {
  const normalised = email.trim().toLowerCase();

  if (!EMAIL_RE.test(normalised)) {
    throw new BadRequestException({
      code: 'INVALID_EMAIL_FORMAT',
      message: 'The provided email address is not valid.',
    });
  }

  return normalised.split('@')[1];
}
