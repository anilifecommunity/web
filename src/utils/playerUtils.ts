



export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const paddedMins = mins.toString().padStart(2, '0');
  const paddedSecs = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins}:${paddedSecs}`;
}

export function formatPlayerClock(currentTimeSec: number, durationSec: number, now: Date = new Date()): {
  nowFormatted: string;
  endsAtFormatted: string;
  displayString: string;
} {
  const formatHourMin = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return `${hours}:${minutes} ${ampm}`;
  };

  const nowFormatted = formatHourMin(now);
  const remainingSec = Math.max(0, (durationSec || 0) - (currentTimeSec || 0));
  const endDate = new Date(now.getTime() + remainingSec * 1000);
  const endsAtFormatted = formatHourMin(endDate);

  return {
    nowFormatted,
    endsAtFormatted,
    displayString: `${nowFormatted} — Ends at ${endsAtFormatted}`,
  };
}

export function calculateProgressPercent(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  const pct = (currentTime / duration) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function isWatched(currentTime: number, duration: number, thresholdPercent: number = 80): boolean {
  if (!duration || duration <= 0) return false;
  return calculateProgressPercent(currentTime, duration) >= thresholdPercent;
}

export function clampSpeed(speed: number): number {
  const allowed = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  let closest = allowed[0];
  let minDiff = Math.abs(speed - closest);
  for (const s of allowed) {
    const diff = Math.abs(speed - s);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }
  return closest;
}
