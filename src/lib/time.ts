export function dateKeyInTimeZone(timeZone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function insideLocalHours(timeZone: string, start: string, end: string, date = new Date(), weekdaysOnly = false) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (weekdaysOnly && ["Sat", "Sun"].includes(values.weekday)) return false;
    const current = `${values.hour}:${values.minute}`;
    const s = start.slice(0, 5);
    const e = end.slice(0, 5);
    // Support windows that cross midnight.
    return s <= e ? current >= s && current <= e : current >= s || current <= e;
  } catch {
    return false;
  }
}
