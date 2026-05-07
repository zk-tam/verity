import { Counter, Gauge, register } from "prom-client";

export const APP_PREFIX = "tcg_backend_";

export const totalRollVolumeGauge = new Gauge({
  name: `${APP_PREFIX}total_roll_volume`,
  help: "Total roll volume",
});

export const totalRollCounter = new Counter({
  name: `${APP_PREFIX}total_roll_counter`,
  help: "Total roll counter",
});

export { register };
