export function recommendedDailyLimit(rampDay: number, targetLimit = 30) {
  const day = Math.max(1, rampDay);
  const schedule = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 28, 29, 30];
  return Math.min(targetLimit, schedule[Math.min(day - 1, schedule.length - 1)] ?? targetLimit);
}

export function nextRampDay(currentDay: number, healthy: boolean) {
  if (!healthy) return Math.max(1, currentDay - 1);
  return currentDay + 1;
}
