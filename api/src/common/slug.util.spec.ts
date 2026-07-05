import { BadRequestException } from '@nestjs/common';
import { assertValidSlug } from './slug.util';

describe('assertValidSlug', () => {
  it('accepts a valid slug', () => {
    expect(() => assertValidSlug('acme')).not.toThrow();
    expect(() => assertValidSlug('acme_corp2')).not.toThrow();
  });

  it('rejects a slug starting with a digit', () => {
    expect(() => assertValidSlug('2acme')).toThrow(BadRequestException);
  });

  it('rejects uppercase and special characters', () => {
    expect(() => assertValidSlug('Acme-Inc')).toThrow(BadRequestException);
  });

  it('rejects a slug shorter than 2 characters', () => {
    expect(() => assertValidSlug('a')).toThrow(BadRequestException);
  });
});
