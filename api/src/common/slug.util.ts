import { BadRequestException } from '@nestjs/common';

const SLUG_RE = /^[a-z][a-z0-9_]{1,30}$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException(
      'Tenant slug must start with a lowercase letter and contain only lowercase letters, digits, and underscores (2-31 chars total).',
    );
  }
}

export function schemaNameForSlug(slug: string): string {
  assertValidSlug(slug);
  return `tenant_${slug}`;
}
