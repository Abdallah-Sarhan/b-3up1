import * as XLSX from "xlsx";

export interface RecognizedRosterRow {
  rowNumber: number;
  serialNumber: string;
  previousBalance: string;
  name: string;
  mobile: string;
  nationality: string;
  dayCodes: string[];
  newBalance: string;
  totalDaysWorked: string;
}

type MammothApi = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages?: unknown[] }>;
};
declare global { interface Window { mammoth?: MammothApi } }

const MAMMOTH_SCRIPT = "https://cdn.jsdelivr.net/npm/mammoth@1.9.1/mammoth.browser.min.js";
async function getMammoth(): Promise<MammothApi> {
  if (window.mammoth) return window.mammoth;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-roster-mammoth="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the Word document reader.")), { once: true });
      if (window.mammoth) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = MAMMOTH_SCRIPT;
    script.async = true;
    script.dataset["rosterMammoth"] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Word document reader. Check your internet connection."));
    document.head.appendChild(script);
  });
  if (!window.mammoth) throw new Error("Word document reader is unavailable in this browser.");
  return window.mammoth;
}
function text(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function headerKey(value: string): string {
  return text(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}
function dayNumber(value: string): number {
  const v = text(value).toLowerCase();
  const day = v.match(/(?:^|\s)(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:sday)?)?|fri(?:day)?|sat(?:urday)?)(?:$|\s)/i)?.[1]?.slice(0, 3).toLowerCase();
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  if (day) return names.indexOf(day);
  const arabic = ["الأحد", "الاحد", "الاثنين", "الإثنين", "الثلاثاء", "الأربعاء", "الاربعاء", "الخميس", "الجمعة", "السبت"];
  const idx = arabic.findIndex((d) => v.includes(d));
  return idx < 0 ? -1 : (idx === 5 ? 5 : idx === 6 ? 3 : idx === 7 ? 4 : idx === 8 ? 5 : idx === 9 ? 6 : idx);
}
function findColumn(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((value) => patterns.some((pattern) => pattern.test(headerKey(value))));
}
function parseGrid(grid: unknown[][]): RecognizedRosterRow[] {
  const rows = grid.map((row) => row.map(text));
  // Locate the actual column-header row, not the title/ward heading.
  const headerIndex = rows.findIndex((row) => {
    const joined = row.join(" ").toLowerCase();
    const dayHeaders = row.filter((cell) => dayNumber(cell) >= 0).length;
    return dayHeaders >= 5 || (/name\s*of\s*staff|staff\s*name/.test(joined) && /sl\s*no|serial/.test(joined));
  });
  if (headerIndex < 0) throw new Error("Could not find the roster header row. Expected columns such as SL NO, PB, Name Of Staff, and the seven dated weekdays.");
  const headers = rows[headerIndex] ?? [];
  const serialCol = findColumn(headers, [/^slno$/, /^serial(?:no|number)?$/]);
  const pbCol = findColumn(headers, [/^pb$/, /previousbalance/]);
  const nameCol = findColumn(headers, [/^nameofstaff$/, /^staffname$/, /^name$/, /^nurse$/]);
  const mobileCol = findColumn(headers, [/^mobile$/, /^mobileno$/, /^phone$/]);
  const natCol = findColumn(headers, [/^nat$/, /^nationality$/]);
  const nbCol = findColumn(headers, [/^nb$/, /^newbalance$/]);
  const totalCol = findColumn(headers, [/^totaldaysworked$/, /^totaldays$/]);
  const dayColumns = headers.map((header, col) => ({ col, day: dayNumber(header) })).filter((item) => item.day >= 0);
  if (nameCol < 0) throw new Error("Could not find the staff-name column. In your template, names are in the third column, 'Name Of Staff'.");
  if (dayColumns.length < 7) {
    throw new Error("Could not identify all seven weekday columns. Keep the weekday names (SUN through SAT) in the column headers.");
  }
  const orderedDayColumns = [...dayColumns].sort((a, b) => a.col - b.col).slice(0, 7).map((item) => item.col);
  const result: RecognizedRosterRow[] = [];
  rows.forEach((row, index) => {
    if (index <= headerIndex) return;
    const name = text(row[nameCol]);
    // Skip blank rows and summary totals; never treat serial numbers or PB values as names.
    if (!name || /^(name of staff|total|am\s*\(|pm\s*\(|nt\s*\()/i.test(name)) return;
    const codes = orderedDayColumns.map((col) => text(row[col]));
    result.push({
      rowNumber: result.length + 1,
      serialNumber: serialCol >= 0 ? text(row[serialCol]) : String(result.length + 1),
      previousBalance: pbCol >= 0 ? text(row[pbCol]) : "",
      name,
      mobile: mobileCol >= 0 ? text(row[mobileCol]) : "",
      nationality: natCol >= 0 ? text(row[natCol]) : "",
      dayCodes: codes,
      newBalance: nbCol >= 0 ? text(row[nbCol]) : "",
      totalDaysWorked: totalCol >= 0 ? text(row[totalCol]) : "",
    });
  });
  if (!result.length) throw new Error("No staff rows were found under the roster header.");
  return result;
}
function tableRowsFromHtml(html: string): unknown[][] {
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  const table = documentHtml.querySelector("table");
  if (!table) throw new Error("No table was found in the Word document. The roster must be a Word table, not an embedded picture.");
  return Array.from(table.querySelectorAll("tr"), (row) =>
    Array.from(row.querySelectorAll("th,td"), (cell) => cell.textContent ?? ""),
  );
}
/** Import a structured roster table from Excel or Word. Files are parsed locally in the browser. */
export async function importWeeklyRosterFile(file: File): Promise<RecognizedRosterRow[]> {
  const lower = file.name.toLowerCase();
  if (/\.(xlsx|xls|xlsm|xlsb|csv)$/.test(lower) || /spreadsheet|excel|csv/.test(file.type)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    // Prefer the sheet containing the roster header, not necessarily the first worksheet.
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
      try { return parseGrid(grid); } catch { /* inspect the next sheet */ }
    }
    throw new Error("No worksheet contained a recognizable staff roster with seven weekday columns.");
  }
  if (/\.docx$/.test(lower) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await getMammoth();
    const converted = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return parseGrid(tableRowsFromHtml(converted.value));
  }
  if (/\.doc$/.test(lower)) throw new Error("Legacy .doc files are not supported directly. Open the file in Word and save it as .docx, or save the table as .xlsx.");
  throw new Error("Choose an Excel file (.xlsx, .xls, .csv) or a Word document (.docx). Photos and image files are not supported.");
}
