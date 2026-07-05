import { DataTypes, Model, type Sequelize } from 'sequelize';

export class Device extends Model {
  declare id: string;
  declare name: string;
  declare deviceProfileId: string | null;
  declare label: string | null;
  declare status: 'active' | 'inactive';
  declare lastSeenAt: Date | null;
  declare firmwareVersion: string | null;

  static initModel(sequelize: Sequelize): typeof Device {
    Device.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: { type: DataTypes.STRING, allowNull: false },
        deviceProfileId: {
          type: DataTypes.UUID,
          field: 'device_profile_id',
          allowNull: true,
        },
        label: { type: DataTypes.STRING, allowNull: true },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'active',
        },
        lastSeenAt: {
          type: DataTypes.DATE,
          field: 'last_seen_at',
          allowNull: true,
        },
        firmwareVersion: {
          type: DataTypes.STRING,
          field: 'firmware_version',
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'devices',
        underscored: true,
        timestamps: true,
      },
    );
    return Device;
  }
}
