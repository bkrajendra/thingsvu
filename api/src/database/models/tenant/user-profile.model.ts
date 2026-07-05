import { DataTypes, Model, type Sequelize } from 'sequelize';

export class UserProfile extends Model {
  declare id: string;
  declare keycloakSub: string;
  declare email: string;
  declare displayName: string | null;
  declare role: 'tenant_admin' | 'tenant_user';
  declare status: 'active' | 'disabled';

  static initModel(sequelize: Sequelize): typeof UserProfile {
    UserProfile.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        keycloakSub: {
          type: DataTypes.STRING,
          field: 'keycloak_sub',
          unique: true,
          allowNull: false,
        },
        email: { type: DataTypes.STRING, allowNull: false },
        displayName: {
          type: DataTypes.STRING,
          field: 'display_name',
          allowNull: true,
        },
        role: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'tenant_user',
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'active',
        },
      },
      {
        sequelize,
        tableName: 'user_profiles',
        underscored: true,
        timestamps: true,
      },
    );
    return UserProfile;
  }
}
