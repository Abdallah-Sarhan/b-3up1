/**
 * Ward 39 weekly roster rules.
 *
 * The weekly roster uses 7-2 (morning), 2-10 (evening), and 10-7 (night).
 * DO, SD, and annual leave are not working shifts and must be excluded.
 * The first staff row is the ward head nurse: show them in the team-leader
 * field only, never as a nurse column.
 */
export type WardShift = "morning" | "evening" | "night";

export interface RosterStaffRow {
  /** One-based row number as printed in the roster, excluding the header. */
  rowNumber: number;
  name: string;
  /** Raw cell value from the selected day, e.g. 7-2, DO, SD, Annual Leave. */
  dayCode: string;
}

export interface ShiftRoster {
  shift: WardShift;
  wardHeadNurse: string;
  teamLeader: string;
  nurses: string[];
  excluded: Array<{ name: string; reason: string }>;
}

export function normalizeRosterCode(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")

}

export function shiftForRosterCode(value: string): WardShift | null {
  const code = normalizeRosterCode(value);
  if (code === "7-2" || code === "7AM-2PM") return "morning";
  if (code === "2-10" || code === "2PM-10PM") return "evening";
  if (code === "10-7" || code === "10PM-7AM") return "night";
  return null;
}

export function isRosterDayOff(value: string): boolean {
  const code = normalizeRosterCode(value);
  // OCR may confuse the letter O with zero in DO, but never rewrite names or
  // all codes globally: "DO" must remain an explicit leave code.
  return code === "DO" || code === "D0" || code === "SD" || code.includes("ANNUALLEAVE") ||
    code.includes("LEAVETILL") || code === "AL";
}

/**
 * Creates a shift roster while preserving the original printed row order.
 * Row 1 is reserved for the ward head nurse and is never included in nurses.
 * The first eligible nurse after row 1 becomes the shift leader.
 */
export function buildShiftRoster(rows: RosterStaffRow[], shift: WardShift): ShiftRoster {
  const ordered = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
  const head = ordered.find((row) => row.rowNumber === 1);
  const wardHeadNurse = head?.name.trim() ?? "";
  const excluded: ShiftRoster["excluded"] = [];

  const eligible = ordered.filter((row) => {
    const name = row.name.trim();
    if (!name || row.rowNumber === 1) return false;
    if (isRosterDayOff(row.dayCode)) {
      excluded.push({ name, reason: normalizeRosterCode(row.dayCode) });
      return false;
    }
    if (shiftForRosterCode(row.dayCode) !== shift) return false;
    return true;
  });

  const nurses = eligible.map((row) => row.name.trim());
  return {
    shift,
    wardHeadNurse,
    teamLeader: nurses[0] ?? wardHeadNurse,
    nurses,
    excluded,
  };
}
