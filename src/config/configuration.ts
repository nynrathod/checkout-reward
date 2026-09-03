export interface AppConfig {
  port: number;
  databasePath: string;
  couponMilestoneN: number;
  couponPercentOff: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer, got "${raw}"`);
  }
  return value;
}

// Loaded once at boot. Bad config should crash the app immediately, not fail later.
export function loadConfig(): AppConfig {
  const couponMilestoneN = envInt('COUPON_MILESTONE_N', 5);
  const couponPercentOff = envInt('COUPON_PERCENT_OFF', 10);

  if (couponMilestoneN < 1) throw new Error('COUPON_MILESTONE_N must be >= 1');
  if (couponPercentOff < 1 || couponPercentOff > 100) {
    throw new Error('COUPON_PERCENT_OFF must be between 1 and 100');
  }

  return {
    port: envInt('PORT', 3000),
    databasePath: process.env.DATABASE_PATH ?? 'data/checkout.db',
    couponMilestoneN,
    couponPercentOff,
  };
}

export default loadConfig;
