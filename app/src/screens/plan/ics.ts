// A calendar reminder (.ics) the owner or an heir can add to any calendar app. Built in the browser.

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text per RFC 5545 and fold lines at 74 characters. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? ' ' : '') + line.slice(i, i + 74));
  return out.join('\r\n');
}

export interface Reminder {
  title: string;
  description: string;
  url: string;
  /** event start, ms */
  at: number;
  /** alert this many minutes before */
  alertMinutes: number;
}

export function buildIcs(r: Reminder): string {
  const uid = `${r.at}-${Math.random().toString(36).slice(2)}@pusaka`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pusaka//Plan reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(r.at)}`,
    `DTEND:${stamp(r.at + 30 * 60 * 1000)}`,
    `SUMMARY:${esc(r.title)}`,
    `DESCRIPTION:${esc(`${r.description}\n\n${r.url}`)}`,
    `URL:${r.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(r.title)}`,
    `TRIGGER:-PT${Math.max(0, Math.round(r.alertMinutes))}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(r: Reminder, filename = 'pusaka-reminder.ics') {
  const blob = new Blob([buildIcs(r)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
