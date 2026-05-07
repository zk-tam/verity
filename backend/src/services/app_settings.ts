import { BaseService } from "./base";
import { AppSettingsKeyTypes, AppSettings } from "../models/app_settings";
import { Pool, PoolClient } from "pg";

export class AppSettingsService extends BaseService {
    constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
        super({ pool, client });
    }

    public async getSetting(key: AppSettingsKeyTypes): Promise<string | null> {
        const result = await this.query<{ setting_value: string }>(
            `SELECT setting_value FROM app_settings WHERE setting_key = $1`,
            [key]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0].setting_value;
    }

    public async setSetting(key: AppSettingsKeyTypes, value: string): Promise<AppSettings | null> {
        const result = await this.query<AppSettings>(
            `INSERT INTO app_settings (setting_key, setting_value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (setting_key) DO UPDATE SET
                setting_value = $2,
                updated_at = NOW()
            RETURNING *
            `,
            [key, value]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    public async isMaintenanceMode(): Promise<boolean> {
        const value = await this.getSetting('MAINTENANCE_MODE');
        return value === 'true';
    }
}
