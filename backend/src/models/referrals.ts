import { z } from "zod";

export interface Referral {
    user_id: string;
    referred_by: string | null;
    referral_code: string;
    created_at: Date;
    updated_at: Date;
}

export class ReferralModel implements Referral {
    user_id: string;
    referred_by: string | null;
    referral_code: string;
    created_at: Date;
    updated_at: Date;
    constructor(data: Referral) {
        this.user_id = data.user_id;
        this.referred_by = data.referred_by;
        this.referral_code = data.referral_code;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }
}

// Zod Schema
export const ReferralCodeSchema = z.object({
    code: z.string().regex(/^[a-zA-Z0-9]+$/).min(6).max(6)
});