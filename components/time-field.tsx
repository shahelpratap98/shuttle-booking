"use client";

import { useState } from "react";

// A 12-hour time picker (hour, minutes, am / pm) that sends a 24-hour
// "HH:MM" value under `name`. The browser's own time box follows the
// computer's clock setting, which can be 24-hour; this always reads 12-hour.
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function split(value: string | undefined) {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return { hour: "", minute: "00", pm: false };
  const h = Number(value.slice(0, 2));
  return { hour: String(h % 12 === 0 ? 12 : h % 12), minute: value.slice(3, 5), pm: h >= 12 };
}

export function TimeField({ id, name, defaultValue, required }: { id: string; name: string; defaultValue?: string; required?: boolean }) {
  const start = split(defaultValue);
  const [hour, setHour] = useState(start.hour);
  const [minute, setMinute] = useState(start.minute);
  const [pm, setPm] = useState(start.pm);

  const h24 = hour === "" ? null : (Number(hour) % 12) + (pm ? 12 : 0);
  const value = h24 === null ? "" : `${String(h24).padStart(2, "0")}:${minute}`;
  // Keep an odd saved minute (e.g. 1:25 is fine, 3:17 from an import too).
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      <select id={id} aria-label="Hour" required={required} value={hour} onChange={(e) => setHour(e.target.value)} className="field min-w-[3.6rem] flex-1 pl-2 pr-1">
        <option value="" disabled>
          –
        </option>
        {HOURS.map((h) => (
          <option key={h} value={String(h)}>{h}</option>
        ))}
      </select>
      <span aria-hidden="true" className="font-semibold text-muted">:</span>
      <select aria-label="Minutes" value={minute} onChange={(e) => setMinute(e.target.value)} className="field min-w-[3.6rem] flex-1 pl-2 pr-1">
        {minutes.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select aria-label="am or pm" value={pm ? "pm" : "am"} onChange={(e) => setPm(e.target.value === "pm")} className="field min-w-[3.6rem] flex-1 pl-2 pr-1">
        <option value="am">am</option>
        <option value="pm">pm</option>
      </select>
    </div>
  );
}
