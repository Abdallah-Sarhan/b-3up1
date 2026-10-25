/**
 * Client-side OCR for the Ward 39 weekly staff roster.
 * The image is processed in the browser and is not uploaded or persisted.
 * OCR results are deliberately reviewable before they affect the assignment.
 */
import { isRosterDayOff, normalizeRosterCode, shiftForRosterCode } from "@/lib/weekly-roster";

type OcrWord = {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
type Worker = {
  recognize: (image: File) => Promise<{ data: { words: OcrWord[]; text: string } }>;
  terminate: () => Promise<void>;
};
type TesseractApi = {
  createWorker: (
    languages: string,
    oem?: number,
    options?: Record<string, unknown>,
  ) => Promise<Worker>;
};

declare global {
  interface Window {
    Tesseract?: TesseractApi;
  }
}

const TESSERACT_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

async function getTesseract(): Promise<TesseractApi> {
  if (window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-roster-tesseract="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل محرك قراءة الصورة.")), { once: true });
      if (window.Tesseract) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.dataset.rosterTesseract = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل محرك قراءة الصورة. تحقق من اتصال الإنترنت ثم حاول مرة أخرى."));
    document.head.appendChild(script);
  });
  if (!window.Tesseract) throw new Error("محرك قراءة الصورة غير متاح في هذا المتصفح.");
  return window.Tesseract;
}

function center(word: OcrWord) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}
function xCenter(word: OcrWord) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}
function normalizeToken(value: string) {
  return normalizeRosterCode(value).replace(/[.,;:()[\]{}]/g, "");
}
function isScheduleToken(value: string) {
  const token = normalizeToken(value);
  const compact = token.replace(/[-/]/g, "");
  return Boolean(
    shiftForRosterCode(token) ||
      ["72", "210", "107"].includes(compact) ||
      isRosterDayOff(token) ||
      token.includes("ANNUAL") ||
      token.includes("LEAVE") ||
      token.startsWith("LEAVETILL"),
  );
}
function correctedCode(words: OcrWord[]): string {
  const value = words.map((word) => normalizeToken(word.text)).filter(Boolean).join(" ");
  if (!value) return "";
  const compact = value.replace(/\s+/g, "");
  if (compact.includes("ANNUAL") && compact.includes("LEAVE")) return "ANNUAL LEAVE";
  if (compact.includes("LEAVETILL")) return "LEAVE TILL";
  if (compact === "D0") return "DO";
  if (compact === "72") return "7-2";
  if (compact === "210") return "2-10";
  if (compact === "107") return "10-7";
  const code = value.replace(/\s+/g, "");
  if (shiftForRosterCode(code)) return code.replace(/AM|PM/g, "");
  if (isRosterDayOff(code)) return code;
  return value;
}

async function getImageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Detect long vertical table rules to help map OCR words to the seven day cells. */
async function verticalRules(file: File): Promise<number[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return [];
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const startY = Math.floor(canvas.height * 0.2);
  const endY = Math.floor(canvas.height * 0.96);
  const minDark = Math.floor((endY - startY) * 0.38);
  const xs: number[] = [];
  for (let x = 0; x < canvas.width; x++) {
    let dark = 0;
    for (let y = startY; y < endY; y += 2) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset] < 105 && data[offset + 1] < 105 && data[offset + 2] < 105) dark++;
    }
    if (dark >= minDark / 2) xs.push(x / scale);
  }
  const groups: number[][] = [];
  for (const x of xs) {
    const last = groups[groups.length - 1];
    if (last && x - last[last.length - 1] <= 3 / scale) last.push(x);
    else groups.push([x]);
  }
  return groups.map((group) => group.reduce((sum, x) => sum + x, 0) / group.length);
}

function scheduleColumnCenters(words: OcrWord[], width: number, rules: number[]): number[] {
  if (rules.length >= 8) {
    const lastEight = rules.slice(-8);
    return lastEight.slice(0, -1).map((x, index) => (x + lastEight[index + 1]) / 2);
  }
  const candidates = words
    .filter((word) => isScheduleToken(word.text) && word.confidence !== undefined && word.confidence >= 12)
    .map(xCenter)
    .sort((a, b) => a - b);
  const clusters: number[][] = [];
  const tolerance = width * 0.035;
  for (const x of candidates) {
    const nearest = clusters.find((group) => Math.abs(group.reduce((s, n) => s + n, 0) / group.length - x) < tolerance);
    if (nearest) nearest.push(x);
    else clusters.push([x]);
  }
  const centers = clusters
    .map((group) => group.reduce((s, n) => s + n, 0) / group.length)
    .sort((a, b) => a - b);
  if (centers.length > 7) {
    // Keep the seven most populated x clusters when OCR also mistakes headings for codes.
    const populated = clusters
      .map((group, index) => ({ center: centers[index], count: group.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7)
      .map((group) => group.center)
      .sort((a, b) => a - b);
    return populated;
  }
  return centers;
}

function groupWordsByRow(words: OcrWord[], tolerance: number): OcrWord[][] {
  const sorted = [...words].sort((a, b) => center(a) - center(b));
  const groups: OcrWord[][] = [];
  for (const word of sorted) {
    const y = center(word);
    const current = groups[groups.length - 1];
    if (current && Math.abs(center(current[0]) - y) <= tolerance) current.push(word);
    else groups.push([word]);
  }
  return groups;
}

/**
 * OCR text positions are used to prefill an editable roster grid. It is not
 * auto-approved: name spelling and the selected day's cell must be checked.
 */
export interface RecognizedRosterRow { rowNumber: number; name: string; dayCodes: string[]; }

export async function recognizeWeeklyRoster(file: File): Promise<{ rows: RecognizedRosterRow[]; rawText: string }> {
  if (!file.type.startsWith("image/")) throw new Error("اختر صورة واضحة لجدول العمل.");
  const [api, size, rules] = await Promise.all([getTesseract(), getImageSize(file), verticalRules(file)]);
  const worker = await api.createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  try {
    const result = await worker.recognize(file);
    const words = result.data.words.filter((word) => word.text.trim() && (word.confidence ?? 0) >= 8);
    const centers = scheduleColumnCenters(words, size.width, rules);
    if (centers.length < 3) {
      throw new Error("لم أتمكن من تحديد أعمدة أيام الأسبوع بوضوح. استخدم صورة مستقيمة وعالية الدقة.");
    }
    const boundaries = rules.length >= 8 ? rules.slice(-8) : [
      centers[0] - (centers[1] - centers[0]) / 2,
      ...centers.slice(1).map((x, i) => (centers[i] + x) / 2),
      centers[centers.length - 1] + (centers[centers.length - 1] - centers[centers.length - 2]) / 2,
    ];
    const firstScheduleX = boundaries[0];
    const scheduleWords = words.filter((word) => xCenter(word) >= firstScheduleX && isScheduleToken(word.text));
    const rowTolerance = Math.max(7, size.height * 0.006);
    const rowGroups = groupWordsByRow(scheduleWords, rowTolerance);
    const rowCenters = rowGroups.map((group) => group.reduce((sum, word) => sum + center(word), 0) / group.length);
    if (rowCenters.length < 2) {
      throw new Error("تعذر التعرف على صفوف الموظفين من الصورة. راجع وضوح الجدول ثم أعد المحاولة.");
    }
    const firstY = Math.min(...rowCenters);
    const lastY = Math.max(...rowCenters);
    const possibleNameWords = words.filter((word) => xCenter(word) < firstScheduleX && center(word) >= firstY - rowTolerance * 1.4 && center(word) <= lastY + rowTolerance * 1.4);
    const nameGroups = groupWordsByRow(possibleNameWords, rowTolerance);
    const rows: RosterStaffRow[] = rowCenters.map((rowY, index) => {
      const names = nameGroups
        .filter((group) => Math.abs(center(group[0]) - rowY) <= rowTolerance * 1.5)
        .flat()
        .sort((a, b) => xCenter(a) - xCenter(b));
      const name = names.map((word) => word.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      const dayCodes = centers.map((_, dayIndex) => {
        const cell = scheduleWords.filter((word) => {
          const yNear = Math.abs(center(word) - rowY) <= rowTolerance * 1.5;
          const colIndex = boundaries.findIndex((left, i) => i < boundaries.length - 1 && xCenter(word) >= left && xCenter(word) < boundaries[i + 1]);
          return yNear && colIndex === dayIndex;
        });
        return correctedCode(cell);
      });
      // All seven weekday cells are retained; users review the selected date's
      // cell before applying the roster to the assignment.
      return { rowNumber: index + 1, name, dayCodes };
    });
    return { rows: rows.filter((row) => row.name || row.dayCode), rawText: result.data.text };
  } finally {
    await worker.terminate();
  }
}
