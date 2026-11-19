export type WeatherMode = 'clear' | 'mist' | 'rain' | 'storm';
export type FloraDensity = 'sparse' | 'balanced' | 'lush';
export type CameraPreset = 'overview' | 'canopy' | 'pond' | 'macro';

export interface FloraSpecimenInfo {
  id: string;
  commonName: string;
  latinName: string;
  family: string;
  microclimate: string;
  hydration: string;
  elevationCm: number;
  notes: string;
}

export interface TerrariumEnvironmentSnapshot {
  seed: number;
  timeOfDay: number; // 0..24
  timeLabel: string;
  weather: WeatherMode;
  humidity: number;
  temperatureC: number;
  ventOpen: number; // 0..1
  growthStage: number; // 0.35..1.15
  density: FloraDensity;
}

// Terrarium spatial constants (units roughly in decimeters, resting at y=0)
export const TERRARIUM_RADIUS_OUTER = 2.18;
export const TERRARIUM_RADIUS_INNER = 1.98;
export const PLINTH_TOP_Y = 0.34;
export const SOIL_BASE_Y = 0.74;
export const WATER_LEVEL_Y = 0.765;
export const GLASS_WALL_TOP_Y = 2.66;
export const ROOF_APEX_Y = 3.68;

// Pond center in local XZ coordinates
export const POND_CENTER_X = 0.68;
export const POND_CENTER_Z = 0.56;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic terrain elevation at (x, z) inside the Wardian case.
 * Ensures every plant, stone, and moss cushion sits flush on the substrate.
 */
export function groundHeightAt(x: number, z: number, seed = 402): number {
  const phase = (seed % 97) * 0.13;
  // Main organic rolling terrace rising toward (-X, -Z)
  const terrace =
    0.16 * Math.exp(-((x + 0.58) * (x + 0.58) + (z + 0.48) * (z + 0.48)) / 0.95);
  // Secondary moss ridge on (+X, -Z)
  const ridge =
    0.11 * Math.exp(-((x - 0.55) * (x - 0.55) + (z + 0.62) * (z + 0.62)) / 0.75);
  // Gentle micro-undulations
  const micro =
    0.032 * Math.sin(x * 2.7 + phase) * Math.cos(z * 2.4 - phase) +
    0.018 * Math.sin((x + z) * 4.5 + phase * 1.7);

  // Carved basin for the recessed micro-pond
  const dx = x - POND_CENTER_X;
  const dz = z - POND_CENTER_Z;
  const pondDistSq = dx * dx * 1.15 + dz * dz * 1.45;
  const pondDip = 0.175 * Math.exp(-pondDistSq / 0.24);

  // Slight bevel near the octagonal glass wall so substrate hugs the frame
  const r = Math.hypot(x, z);
  const edgeTaper = r > 1.65 ? (r - 1.65) * 0.08 : 0;

  return SOIL_BASE_Y + 0.06 + terrace + ridge + micro - pondDip - edgeTaper;
}

export function formatHourToTime(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const hrs = Math.floor(normalized);
  const mins = Math.floor((normalized - hrs) * 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function computeEnvironmentMetrics(
  timeOfDay: number,
  weather: WeatherMode,
  ventOpen: number
): { humidity: number; temperatureC: number } {
  // Diurnal temperature curve peaking around 15:00
  const sunWave = Math.sin(((timeOfDay - 8) / 24) * Math.PI * 2);
  let baseTemp = 21.8 + sunWave * 3.1;
  let baseHumidity = 74 - sunWave * 6;

  if (weather === 'mist') {
    baseTemp -= 1.2;
    baseHumidity += 13;
  } else if (weather === 'rain') {
    baseTemp -= 2.1;
    baseHumidity += 17;
  } else if (weather === 'storm') {
    baseTemp -= 3.0;
    baseHumidity += 20;
  }

  // Opening the brass roof vent lowers internal humidity and stabilizes heat
  baseHumidity -= ventOpen * 9;
  baseTemp -= ventOpen * 0.9;

  return {
    humidity: Math.round(Math.min(98, Math.max(48, baseHumidity))),
    temperatureC: Math.round(baseTemp * 10) / 10,
  };
}
