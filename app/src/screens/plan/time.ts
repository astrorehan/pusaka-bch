// Countdown and date helpers for the plan page. Times are unix seconds.

export interface Countdown {
  /** big number in the ring */
  value: string;
  /** unit under it: "days left" */
  unit: string;
  /** smaller remainder: "and 4 hours" */
  rest: string;
  /** one phrase for sentences and screen readers: "23 days" */
  phrase: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function countdown(secondsLeft: number): Countdown {
  const s = Math.max(0, Math.floor(secondsLeft));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days >= 1) {
    return { value: String(days), unit: `${days === 1 ? 'day' : 'days'} left`, rest: hours ? `and ${plural(hours, 'hour')}` : '', phrase: plural(days, 'day') };
  }
  if (hours >= 1) {
    return { value: String(hours), unit: `${hours === 1 ? 'hour' : 'hours'} left`, rest: minutes ? `and ${plural(minutes, 'minute')}` : '', phrase: plural(hours, 'hour') };
  }
  if (minutes >= 1) {
    return { value: String(minutes), unit: `${minutes === 1 ? 'minute' : 'minutes'} left`, rest: `and ${plural(seconds, 'second')}`, phrase: plural(minutes, 'minute') };
  }
  return { value: String(seconds), unit: `${seconds === 1 ? 'second' : 'seconds'} left`, rest: '', phrase: plural(seconds, 'second') };
}

/** "14 Dec 2026, 15:40" in the visitor's own time zone. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** "14 December" (year added when it is not this year). */
export function formatDay(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}
