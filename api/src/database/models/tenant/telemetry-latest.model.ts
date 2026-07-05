import { DataTypes, Model, type Sequelize } from 'sequelize';

export class TelemetryLatest extends Model {
  declare deviceId: string;
  declare key: string;
  declare ts: Date;
  declare valueNum: number | null;
  declare valueStr: string | null;
  declare valueBool: boolean | null;
  declare valueJson: unknown;

  static initModel(sequelize: Sequelize): typeof TelemetryLatest {
    TelemetryLatest.init(
      {
        deviceId: {
          type: DataTypes.UUID,
          field: 'device_id',
          primaryKey: true,
        },
        key: { type: DataTypes.STRING, primaryKey: true },
        ts: { type: DataTypes.DATE, allowNull: false },
        valueNum: {
          type: DataTypes.DOUBLE,
          field: 'value_num',
          allowNull: true,
        },
        valueStr: { type: DataTypes.TEXT, field: 'value_str', allowNull: true },
        valueBool: {
          type: DataTypes.BOOLEAN,
          field: 'value_bool',
          allowNull: true,
        },
        valueJson: {
          type: DataTypes.JSONB,
          field: 'value_json',
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'telemetry_latest',
        underscored: true,
        timestamps: false,
      },
    );
    return TelemetryLatest;
  }
}
