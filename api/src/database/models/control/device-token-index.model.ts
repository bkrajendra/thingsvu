import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlDeviceTokenIndex extends Model {
  declare tokenHash: string;
  declare tenantId: string;
  declare deviceId: string;
  declare credentialType: 'access_token' | 'mqtt_basic';
  declare readonly createdAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlDeviceTokenIndex {
    ControlDeviceTokenIndex.init(
      {
        tokenHash: {
          type: DataTypes.STRING,
          field: 'token_hash',
          primaryKey: true,
        },
        tenantId: {
          type: DataTypes.UUID,
          field: 'tenant_id',
          allowNull: false,
        },
        deviceId: {
          type: DataTypes.UUID,
          field: 'device_id',
          allowNull: false,
        },
        credentialType: {
          type: DataTypes.STRING,
          field: 'credential_type',
          allowNull: false,
        },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'device_token_index',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return ControlDeviceTokenIndex;
  }
}
