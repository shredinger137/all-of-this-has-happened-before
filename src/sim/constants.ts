// All clock values are absolute minutes after midnight.
export const START_MINUTE = 6 * 60 + 45; // 06:45: time to get one or two things ready, not everything
export const NATURAL_WAKE = 7 * 60; // 07:00
export const DEPARTURE_DEADLINE = 7 * 60 + 45; // 07:45 (provisional, per spec)
export const COMMUTE_MINUTES = 15;
export const SCHOOL_START = 8 * 60; // 08:00
export const SAFETY_CUTOFF = 9 * 60; // 09:00 - the morning ends regardless
export const IDLE_WAIT_MINUTES = 5;
export const START_MOOD = 3;

export function formatClock(minute: number): string {
  const m = Math.round(minute);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
