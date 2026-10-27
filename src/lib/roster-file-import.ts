import * as XLSX from "xlsx";

export interface RecognizedRosterRow {
  rowNumber: number;
  name: string;
  dayCodes: string[];
}

type MammothApi = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages?: unknown[] }>;
};

declare global {
  interface Window {
    mammoth?: MammothApi;
  }
}

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

function isDayHeader(value: string): boolean {
  const v = value.toLowerCase().replace(/[.\s_-]/g, "");
  return /^(sun(day)?|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)$/.test(v);
}

function isNameHeader(value: string): boolean {
  return /^(name|nurse|staff|employee|اسم|الاسم|اسم الممرض|الممرض|التمريض|الموظف)$/i.test(text(value));
}

function isSerial(value: string): boolean {
  return /^\d{1,3}$/.test(text(value));
}

function parseGrid(grid: unknown[][]): RecognizedRosterRow[] {
  const rows = grid.map((row) => row.map(text));
  const headerIndex = rows.findIndex((row) =>
    row.filter(isDayHeader).length >= 4 || row.some(isNameHeader),
  );
  const header = headerIndex >= 0 ? rows[headerIndex] ?? [] : [];
  let nameCol = header.findIndex(isNameHeader);
  if (nameCol < 0) {
    const firstData = rows.slice(Math.max(0, headerIndex + 1)).find((row) => row.some(Boolean)) ?? [];
    nameCol = firstData.findIndex((value, index) => value && !isSerial(value) && !isDayHeader(value) && index < 4);
    if (nameCol < 0) nameCol = firstData[0] && isSerial(firstData[0]) ? 1 : 0;
  }
  const headerDayCols = header.map((value, index) => isDayHeader(value) ? index : -1).filter((index) => index >= 0);
  let dayCols = headerDayCols.length >= 5 ? headerDayCols.slice(0, 7) : [];
  if (dayCols.length !== 7) {
    const candidates = rows.slice(Math.max(0, headerIndex + 1)).find((row) => row.length >= nameCol + 8);
    if (candidates) dayCols = Array.from({ length: 7 }, (_, i) => nameCol + 1 + i);
    else {
      const maxColumns = Math.max(0, ...rows.map((row) => row.length));
      dayCols = Array.from({ length: 7 }, (_, i) => nameCol + 1 + i).filter((index) => index < maxColumns);
    }
  }
  if (dayCols.length < 7) {
    throw new Error("The file does not contain a clear name column followed by seven day columns. Arrange it as: Nurse name, then the seven days.");
  }
  const result: RecognizedRosterRow[] = [];
  rows.forEach((row, index) => {
    if (index <= headerIndex) return;
    const name = text(row[nameCol]);
    const codes = dayCols.map((col) => text(row[col]));
    if (!name && !codes.some(Boolean)) return;
    if (isNameHeader(name) || isDayHeader(name)) return;
    // Ignore title/legend rows that have no plausible staff name and no day codes,
    // but preserve rows with codes and missing names so they can be corrected.
    if (!name && !codes.some(Boolean)) return;
    result.push({ rowNumber: result.length + 1, name, dayCodes: codes });
  });
  if (!result.length) throw new Error("No staff rows were found. Check that the source file contains a real table with one nurse per row.");
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
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!firstSheet) throw new Error("No worksheet was found in the Excel file.");
    return parseGrid(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", raw: false }) as unknown[][]);
  }
  if (/\.docx$/.test(lower) || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await getMammoth();
    const converted = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return parseGrid(tableRowsFromHtml(converted.value));
  }
  if (/\.doc$/.test(lower)) {
    throw new Error("Legacy .doc files are not supported directly. Open the file in Word and save it as .docx, or save the table as .xlsx.");
  }
  throw new Error("Choose an Excel file (.xlsx, .xls, .csv) or a Word document (.docx). Photos and image files are no longer supported.");
}
