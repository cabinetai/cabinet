/**
 * Human-readable cron expression formatting.
 * Shared between schedule-picker, agent-detail-panel, and agent-card.
 */

const KNOWN_PRESETS: Record<string, string> = {
  "*/5 * * * *": "Every 5 minutes",
  "*/15 * * * *": "Every 15 minutes",
  "*/30 * * * *": "Every 30 minutes",
  "0 * * * *": "Every hour",
  "0 */4 * * *": "Every 4 hours",
  "0 9 * * *": "Daily at 9:00 AM",
  "0 9 * * 1-5": "Weekdays at 9:00 AM",
  "0 9 * * 1": "Weekly on Monday",
  "0 9 1 * *": "Monthly on the 1st at 9:00 AM",
};

// Index 0–7: 0=Sun, 1=Mon…6=Sat, 7=Sun (cron allows both 0 and 7 for Sunday)
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtHour(hour24: number, min: number): string {
  const p = hour24 >= 12 ? "PM" : "AM";
  const h = hour24 > 12 ? hour24 - 12 : hour24 === 0 ? 12 : hour24;
  const m = min > 0 ? `:${String(min).padStart(2, "0")}` : ":00";
  return `${h}${m} ${p}`;
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function cronToHuman(cron: string): string {
  if (KNOWN_PRESETS[cron]) return KNOWN_PRESETS[cron];

  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [min, hour, dom, , dow] = parts;

  // */N minutes
  if (min.startsWith("*/") && hour === "*") {
    const n = min.slice(2);
    const dayStr = dow === "1-5" ? " on weekdays" : dow === "0,6" ? " on weekends" : "";
    return `Every ${n} min${dayStr}`;
  }

  // Every N hours
  if (min === "0" && hour.startsWith("*/")) {
    const n = hour.slice(2);
    const dayStr = dow === "1-5" ? " on weekdays" : "";
    return `Every ${n}h${dayStr}`;
  }

  // Specific time (numeric min + hour)
  const minNum = parseInt(min, 10);
  const hourNum = parseInt(hour, 10);
  if (!isNaN(minNum) && !isNaN(hourNum) && !hour.includes("*") && !min.includes("*")) {
    const timeStr = fmtHour(hourNum, minNum);

    // Monthly
    if (dom !== "*" && dow === "*") {
      const d = parseInt(dom, 10);
      if (!isNaN(d)) return `Monthly on the ${ordinal(d)} at ${timeStr}`;
    }

    if (dom === "*") {
      // Multi-day weekly (comma-separated)
      if (dow.includes(",")) {
        const days = dow
          .split(",")
          .map((d) => DAY_NAMES[parseInt(d, 10)] ?? `day ${d}`)
          .join(", ");
        return `${days} at ${timeStr}`;
      }

      if (dow === "*") return `Daily at ${timeStr}`;
      if (dow === "1-5") return `Weekdays at ${timeStr}`;

      const dayNum = parseInt(dow, 10);
      if (!isNaN(dayNum) && DAY_NAMES[dayNum]) return `${DAY_NAMES[dayNum]}s at ${timeStr}`;
      return `(${dow}) at ${timeStr}`;
    }
  }

  return cron;
}

/** Short label for agent cards (e.g., "15m", "4h", "Daily 9am") */
export function cronToShortLabel(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [min, hour, dom, , dow] = parts;

  if (min.startsWith("*/") && hour === "*") return `${min.slice(2)}m`;
  if (min === "0" && hour.startsWith("*/")) return `${hour.slice(2)}h`;
  if (min === "0" && hour === "*") return "1h";

  const minNum = parseInt(min, 10);
  const hourNum = parseInt(hour, 10);
  if (!isNaN(minNum) && !isNaN(hourNum) && !hour.includes("*") && !min.includes("*")) {
    const p = hourNum >= 12 ? "pm" : "am";
    const h = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum;
    const m = minNum > 0 ? `:${String(minNum).padStart(2, "0")}` : "";

    if (dom !== "*" && dow === "*") return `Monthly ${h}${m}${p}`;
    if (dow === "1-5") return `Wkdays ${h}${m}${p}`;
    if (dow === "*") return `Daily ${h}${m}${p}`;
    return `${h}${m}${p}`;
  }

  return cron;
}
