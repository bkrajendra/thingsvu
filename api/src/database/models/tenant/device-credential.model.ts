import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceCredential extends Model {
  declare id: string;
  declare deviceId: string;
  declare credentialType: 'access_token' | 'mqtt_basic';
  declare tokenHash: string | null;
  declare mqttUsername: string | null;
  declare mqttPasswordHash: string | null;

  static initModel(sequelize: Sequelize): typeof DeviceCredential {
    DeviceCredential.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        deviceId: {
          type: DataTypes.UUID,
          field: 'device_id',
          unique: true,
          allowNull: false,
        },
        credentialType: {
          type: DataTypes.STRING,
          field: 'credential_type',
          allowNull: false,
        },
        tokenHash: {
          type: DataTypes.STRING,
          field: 'token_hash',
          unique: true,
          allowNull: true,
        },
        mqttUsername: {
          type: DataTypes.STRING,
          field: 'mqtt_username',
          allowNull: true,
        },
        mqttPasswordHash: {
          type: DataTypes.STRING,
          field: 'mqtt_password_hash',
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'device_credentials',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return DeviceCredential;
  }
}
