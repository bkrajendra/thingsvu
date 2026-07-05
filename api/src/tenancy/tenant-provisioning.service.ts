import { ConflictException, Injectable } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/sequelize';
import { Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { assertValidSlug, schemaNameForSlug } from '../common/slug.util';
import { ControlTenant } from '../database/models/control/tenant.model';
import { tenantMigrations } from '../database/migrations/tenant/0001-init';

export interface ProvisionTenantInput {
  slug: string;
  name: string;
}

export interface ProvisionedTenant {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  status: string;
}

@Injectable()
export class TenantProvisioningService {
  constructor(
    @Inject(getConnectionToken()) private readonly sequelize: Sequelize,
  ) {}

  async provision(input: ProvisionTenantInput): Promise<ProvisionedTenant> {
    assertValidSlug(input.slug);
    const schemaName = schemaNameForSlug(input.slug);

    const existing = await ControlTenant.findOne({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException(`Tenant slug "${input.slug}" already exists`);
    }

    return this.sequelize.transaction(async (transaction) => {
      const tenant = await ControlTenant.create(
        {
          slug: input.slug,
          name: input.name,
          schemaName,
          status: 'provisioning',
        },
        { transaction },
      );

      await this.sequelize.query(`CREATE SCHEMA "${schemaName}"`, {
        transaction,
      });

      for (const migration of tenantMigrations) {
        await this.sequelize.query(migration.up(schemaName), { transaction });
      }
      await this.sequelize.query(
        `CREATE TABLE IF NOT EXISTS "${schemaName}".schema_migrations (
          name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now()
        )`,
        { transaction },
      );
      for (const migration of tenantMigrations) {
        await this.sequelize.query(
          `INSERT INTO "${schemaName}".schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
          { bind: [migration.name], transaction },
        );
      }

      tenant.status = 'active';
      await tenant.save({ transaction });

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        schemaName: tenant.schemaName,
        status: tenant.status,
      };
    });
  }
}
