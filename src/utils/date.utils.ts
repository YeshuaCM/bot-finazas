// =============================================================================
// Timezone utilities - Bogotá (Colombia) timezone
// =============================================================================
//
// Colombia uses UTC-5 with no DST.
// Uses Intl.DateTimeFormat for reliable timezone conversion regardless
// of the server's system timezone.

const BOGOTA_TIMEZONE = 'America/Bogota';

function getDateParts(date: Date): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parts.find(p => p.type === 'year')!.value,
    month: parts.find(p => p.type === 'month')!.value,
    day: parts.find(p => p.type === 'day')!.value,
  };
}

function getTimeParts(date: Date): { hour: string; minute: string; second: string } {
  const formatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  return {
    hour: parts.find(p => p.type === 'hour')!.value,
    minute: parts.find(p => p.type === 'minute')!.value,
    second: parts.find(p => p.type === 'second')!.value || '00',
  };
}

/**
 * Get current date in Bogotá timezone (America/Bogota)
 */
export function getBogotaDate(): Date {
  const { year, month, day } = getDateParts(new Date());
  return new Date(`${year}-${month}-${day}T00:00:00`);
}

/**
 * Get date string in YYYY-MM-DD format for Bogotá timezone
 */
export function getBogotaDateString(): string {
  const { year, month, day } = getDateParts(new Date());
  return `${year}-${month}-${day}`;
}

/**
 * Get datetime string in ISO format for Bogotá timezone
 * Used for created_at timestamps
 */
export function getBogotaISOString(): string {
  const { year, month, day } = getDateParts(new Date());
  const { hour, minute, second } = getTimeParts(new Date());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`;
}

/**
 * Get time string in HH:MM format for Bogotá timezone
 */
export function getBogotaTimeString(): string {
  const { hour, minute } = getTimeParts(new Date());
  return `${hour}:${minute}`;
}
