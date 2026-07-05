import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceTagMap extends Model {
  declare deviceId: string;
  declare tagId: string;

  static initModel(sequelize: Sequelize): typeof DeviceTagMap {
    DeviceTagMap.init(
      {
        deviceId: {
          type: DataTypes.UUID,
          field: 'device_id',
          primaryKey: true,
        },
        tagId: { type: DataTypes.UUID, field: 'tag_id', primaryKey: true },
      },
      {
        sequelize,
        tableName: 'device_tag_map',
        underscored: true,
        timestamps: false,
      },
    );
    return DeviceTagMap;
  }
}
