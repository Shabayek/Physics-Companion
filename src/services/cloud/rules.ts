// Client mirror of the cloud-save limits in supabase/migrations/*_cloud_save.sql (contract-tested).
export const CLOUD_RULES = {
  /** Largest save the server accepts (bytes of JSON). */
  MAX_SAVE_BYTES: 262_144,
  /** Minimum seconds between two writes of the same save. */
  MIN_SAVE_INTERVAL_S: 2,
} as const;

export function saveSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
