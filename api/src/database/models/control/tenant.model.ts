import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlTenant extends Model {
  declare id: string;
  declare slug: string;
  declare name: string;
  declare schemaName: string;
  declare status: 'provisioning' | 'active' | 'suspended';
  declare keycloakGroupId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlTenant {
    ControlTenant.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        slug: { type: DataTypes.STRING, unique: true, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        schemaName: {
          type: DataTypes.STRING,
          field: 'schema_name',
          unique: true,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'provisioning',
        },
        keycloakGroupId: {
          type: DataTypes.STRING,
          field: 'keycloak_group_id',
          allowNull: true,
        },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'tenants',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return ControlTenant;
  }
}
