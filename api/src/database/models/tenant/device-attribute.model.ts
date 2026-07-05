import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceAttribute extends Model {
  declare deviceId: string;
  declare scope: 'client' | 'server' | 'shared';
  declare key: string;
  declare value: unknown;

  static initModel(sequelize: Sequelize): typeof DeviceAttribute {
    DeviceAttribute.init(
      {
        deviceId: {
          type: DataTypes.UUID,
          field: 'device_id',
          primaryKey: true,
        },
        scope: { type: DataTypes.STRING, primaryKey: true },
        key: { type: DataTypes.STRING, primaryKey: true },
        value: { type: DataTypes.JSONB, allowNull: false },
      },
      {
        sequelize,
        tableName: 'device_attributes',
        underscored: true,
        timestamps: true,
        createdAt: false,
      },
    );
    return DeviceAttribute;
  }
}
