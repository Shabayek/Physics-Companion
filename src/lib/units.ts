export const UNITS = {
  length: ['m', 'km', 'cm', 'mm'],
  mass: ['kg', 'g', 'mg'],
  time: ['s', 'min', 'h'],
  speed: ['m/s', 'km/h'],
  force: ['N'],
  energy: ['J', 'kJ'],
  power: ['W', 'kW'],
  pressure: ['Pa', 'kPa'],
  temperature: ['K', '°C'],
  charge: ['C'],
  voltage: ['V'],
  current: ['A'],
  resistance: ['Ω'],
} as const;

export function celsiusToKelvin(c: number): number {
  return c + 273.15;
}
export function kelvinToCelsius(k: number): number {
  return k - 273.15;
}
export function msToKmh(ms: number): number {
  return ms * 3.6;
}
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}
