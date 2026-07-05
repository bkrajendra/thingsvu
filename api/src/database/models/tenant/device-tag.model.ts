import { DataTypes, Model, type Sequelize } from 'sequelize';

export class DeviceTag extends Model {
  declare id: string;
  declare name: string;

  static initModel(sequelize: Sequelize): typeof DeviceTag {
    DeviceTag.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: { type: DataTypes.STRING, unique: true, allowNull: false },
      },
      {
        sequelize,
        tableName: 'device_tags',
        underscored: true,
        timestamps: false,
      },
    );
    return DeviceTag;
  }
}
