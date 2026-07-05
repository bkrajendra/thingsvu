import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceProfile extends Model {
  declare id: string;
  declare name: string;
  declare transport: 'mqtt' | 'http' | 'default';
  declare provisionType: 'access_token' | 'mqtt_basic';
  declare telemetryKeys: unknown[];
  declare defaultAttributes: Record<string, unknown>;

  static initModel(sequelize: Sequelize): typeof DeviceProfile {
    DeviceProfile.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: { type: DataTypes.STRING, allowNull: false },
        transport: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'http',
        },
        provisionType: {
          type: DataTypes.STRING,
          field: 'provision_type',
          allowNull: false,
          defaultValue: 'access_token',
        },
        telemetryKeys: {
          type: DataTypes.JSONB,
          field: 'telemetry_keys',
          allowNull: false,
          defaultValue: [],
        },
        defaultAttributes: {
          type: DataTypes.JSONB,
          field: 'default_attributes',
          allowNull: false,
          defaultValue: {},
        },
      },
      {
        sequelize,
        tableName: 'device_profiles',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    );
    return DeviceProfile;
  }
}
