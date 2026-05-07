export type PointsSource = "gacha_play" | "gacha_referral";

export interface UserPoints {
  user_id: string;
  total_points: number;
  updated_at: Date;
}

export interface UserPointsLedgerEntry {
  id: number;
  user_id: string;
  points: number;
  source: PointsSource;
  source_roll_id: number | null;
  source_referee_id: string | null;
  created_at: Date;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string | null;
  image: string | null;
  total_points: number;
}
