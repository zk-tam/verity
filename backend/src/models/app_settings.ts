export type AppSettingsKeyTypes = 'MAINTENANCE_MODE';

export interface AppSettings {
    id: number;
    setting_key: string;
    setting_value: string;
    updated_at: Date;
}

export class AppSettingsModel implements AppSettings {
    id: number;
    setting_key: string;
    setting_value: string;
    updated_at: Date;

    constructor(data: AppSettings) {
        this.id = data.id;
        this.setting_key = data.setting_key;
        this.setting_value = data.setting_value;
        this.updated_at = new Date(data.updated_at);
    }
}
