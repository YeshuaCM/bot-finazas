// =============================================================================
// Timezone utilities - Bogotá (Colombia) timezone
// =============================================================================

/**
 * Get current date in Bogotá timezone (America/Bogota)
 * Colombia uses UTC-5 (no DST)
 */
export function getBogotaDate(): Date {
  // Get current UTC time
  const now = new Date();
  
  // Colombia is UTC-5
  const offsetMinutes = -5 * 60;
  
  // Create date with offset applied
  const localTime = new Date(now.getTime() + (offsetMinutes - now.getTimezoneOffset()) * 60000);
  
  return localTime;
}

/**
 * Get date string in YYYY-MM-DD format for Bogotá timezone
 */
export function getBogotaDateString(): string {
  const date = getBogotaDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get datetime string in ISO format for Bogotá timezone
 * Used for created_at timestamps
 */
export function getBogotaISOString(): string {
  return getBogotaDate().toISOString();
}

/**
 * Get time string in HH:MM format for Bogotá timezone
 */
export function getBogotaTimeString(): string {
  const date = getBogotaDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}