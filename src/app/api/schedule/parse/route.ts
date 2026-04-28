import { NextRequest, NextResponse } from "next/server";

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function parseTimeStr(s: string): { hour24: number; minute: number } | null {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3]?.toLowerCase();
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { hour24: hour, minute };
}

function fmtTime(h24: number, min: number): string {
  const p = h24 >= 12 ? "PM" : "AM";
  const h = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24;
  const m = min > 0 ? `:${String(min).padStart(2, "0")}` : ":00";
  return `${h}${m} ${p}`;
}

function regexParse(text: string): { cron: string; description: string } | null {
  const t = text.toLowerCase().trim();

  // Every N minutes
  const minsMatch = t.match(/every\s+(\d+)\s+min(?:utes?|s)?/);
  if (minsMatch) {
    const n = parseInt(minsMatch[1], 10);
    if (n > 0 && n < 60) return { cron: `*/${n} * * * *`, description: `Every ${n} minutes` };
  }

  // Every N hours
  const hoursMatch = t.match(/every\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const n = parseInt(hoursMatch[1], 10);
    if (n > 0 && n < 24) return { cron: `0 */${n} * * *`, description: `Every ${n} hours` };
  }

  // Every hour / hourly
  if (/(?:every\s+hour|hourly)/.test(t)) {
    return { cron: "0 * * * *", description: "Every hour" };
  }

  // Weekdays / workdays
  if (/(?:every\s+)?(?:weekday|workday|week\s*day|work\s*day)/.test(t)) {
    const tmMatch = t.match(/([\d:]+\s*(?:am|pm)?)/i);
    const time = tmMatch ? parseTimeStr(tmMatch[1]) : null;
    if (time) return { cron: `${time.minute} ${time.hour24} * * 1-5`, description: `Weekdays at ${fmtTime(time.hour24, time.minute)}` };
    return { cron: "0 9 * * 1-5", description: "Weekdays at 9:00 AM" };
  }

  // Every day / daily (must check before named-day logic)
  if (/(?:every\s+day|daily)/.test(t)) {
    const tmMatch = t.match(/([\d:]+\s*(?:am|pm)?)/i);
    const time = tmMatch ? parseTimeStr(tmMatch[1]) : null;
    if (time) return { cron: `${time.minute} ${time.hour24} * * *`, description: `Daily at ${fmtTime(time.hour24, time.minute)}` };
    return { cron: "0 9 * * *", description: "Daily at 9:00 AM" };
  }

  // Named day(s): extract all day names before "at/on/@"
  const dayKeys = Object.keys(DAY_MAP).join("|");
  const textBeforeAt = t.split(/\s+(?:at|@)\s+/)[0];
  const dayRe = new RegExp(`\\b(${dayKeys})\\b`, "gi");
  const foundDays: number[] = [];
  let dm;
  while ((dm = dayRe.exec(textBeforeAt)) !== null) {
    const d = DAY_MAP[dm[1].toLowerCase()];
    if (d !== undefined && !foundDays.includes(d)) foundDays.push(d);
  }

  if (foundDays.length > 0) {
    const atMatch = t.match(/(?:at|@)\s*([\d:]+\s*(?:am|pm)?)/i);
    const time = atMatch ? parseTimeStr(atMatch[1]) : null;
    if (time) {
      const sorted = foundDays.sort((a, b) => a - b);
      return {
        cron: `${time.minute} ${time.hour24} * * ${sorted.join(",")}`,
        description: `Selected days at ${fmtTime(time.hour24, time.minute)}`,
      };
    }
    if (foundDays.length === 1) {
      const dayName = Object.entries(DAY_MAP).find(([, v]) => v === foundDays[0])?.[0] ?? "";
      return {
        cron: `0 9 * * ${foundDays[0]}`,
        description: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s at 9:00 AM`,
      };
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.text || typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const text = body.text.trim();

  const regexResult = regexParse(text);
  if (regexResult) return NextResponse.json(regexResult);

  // Fallback: Claude Haiku via direct API call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cannot parse this schedule. Try: 'every weekday at 9am'" },
      { status: 422 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system:
          'Convert the schedule description to a JSON object with two fields: "cron" (a valid 5-part cron expression) and "description" (a short human-readable label). Respond with ONLY the JSON object, no other text.',
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const parsed = JSON.parse(data.content[0].text) as { cron: string; description: string };
    if (!parsed.cron || !parsed.description) throw new Error("Invalid response shape");
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Cannot parse this schedule. Try: 'every weekday at 9am'" },
      { status: 422 }
    );
  }
}
