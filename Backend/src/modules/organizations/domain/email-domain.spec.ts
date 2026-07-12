import { BadRequestException } from '@nestjs/common';
import { extractEmailDomain } from './email-domain';

describe('extractEmailDomain', () => {
  it('returns the lowercase domain from a standard email', () => {
    expect(extractEmailDomain('user@example.com')).toBe('example.com');
  });

  it('normalises uppercase letters in the local part and domain', () => {
    expect(extractEmailDomain('Student@Estudiantat.UPC.edu')).toBe(
      'estudiantat.upc.edu',
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(extractEmailDomain('  user@example.com  ')).toBe('example.com');
  });

  it('handles subdomains', () => {
    expect(extractEmailDomain('user@mail.sub.example.co.uk')).toBe(
      'mail.sub.example.co.uk',
    );
  });

  it('throws INVALID_EMAIL_FORMAT for an email with no @', () => {
    expect(() => extractEmailDomain('notanemail')).toThrow(BadRequestException);
    expect(() => extractEmailDomain('notanemail')).toThrow(
      'The provided email address is not valid.',
    );
  });

  it('throws INVALID_EMAIL_FORMAT for an email with no domain part after @', () => {
    expect(() => extractEmailDomain('user@')).toThrow(BadRequestException);
  });

  it('throws INVALID_EMAIL_FORMAT for an empty string', () => {
    expect(() => extractEmailDomain('')).toThrow(BadRequestException);
  });

  it('throws INVALID_EMAIL_FORMAT for a domain with no TLD dot', () => {
    expect(() => extractEmailDomain('user@nodomain')).toThrow(
      BadRequestException,
    );
  });

  it('throws INVALID_EMAIL_FORMAT for multiple @ signs', () => {
    expect(() => extractEmailDomain('a@b@c.com')).toThrow(BadRequestException);
  });
});
