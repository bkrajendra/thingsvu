import { DataTypes, Model, type Sequelize } from 'sequelize';

export class ControlPlatformAdmin extends Model {
  declare id: string;
  declare keycloakSub: string;
  declare email: string;
  declare readonly createdAt: Date;

  static initModel(sequelize: Sequelize): typeof ControlPlatformAdmin {
    ControlPlatformAdmin.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        keycloakSub: { type: DataTypes.STRING, field: 'keycloak_sub', unique: true, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
      },
      {
        sequelize,
        schema: 'control',
        tableName: 'platform_admins',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      },
    );
    return ControlPlatformAdmin;
  }
}
