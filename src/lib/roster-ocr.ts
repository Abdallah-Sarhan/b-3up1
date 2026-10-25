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
    script.dataset["rosterTesseract"] = "true";
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
  return normalizeRosterCode(value).replace(/[.,;:()[\]{}|_!]/g, "");
}
function isScheduleToken(value: string) {
  const token = normalizeToken(value);
  const compact = token.replace(/[-/]/g, "");
  return Boolean(
    shiftForRosterCode(token) ||
      ["72", "722", "210", "21", "107"].includes(compact) ||
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
  if (compact === "72" || compact === "722") return "7-2";
  if (compact === "210" || compact === "21") return "2-10";
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
      const red = data[offset] ?? 255;
      const green = data[offset + 1] ?? 255;
      const blue = data[offset + 2] ?? 255;
      if (red < 105 && green < 105 && blue < 105) dark++;
    }
    if (dark >= minDark / 2) xs.push(x / scale);
  }
  const groups: number[][] = [];
  for (const x of xs) {
    const last = groups[groups.length - 1];
    const lastX = last?.[last.length - 1];
    if (last && lastX !== undefined && x - lastX <= 3 / scale) last.push(x);
    else groups.push([x]);
  }
  return groups.map((group) => group.reduce((sum, x) => sum + x, 0) / group.length);
}

function scheduleColumnCenters(words: OcrWord[], width: number, rules: number[]): number[] {
  const dayBoundaries = rules.length >= 9 ? rules.slice(-9, -1) : rules.length === 8 ? rules : [];
  if (dayBoundaries.length === 8) {
    return dayBoundaries.slice(0, -1).map((x, index) => {
      const next = dayBoundaries[index + 1];
      return next === undefined ? x : (x + next) / 2;
    });
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
      .map((group) => ({ center: group.reduce((sum, x) => sum + x, 0) / group.length, count: group.length }))
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
    const currentCenter = current?.length
      ? current.reduce((sum, item) => sum + center(item), 0) / current.length
      : undefined;
    if (current && currentCenter !== undefined && Math.abs(currentCenter - y) <= tolerance) current.push(word);
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
    if (centers.length !== 7) {
      throw new Error("لم أتمكن من تحديد أعمدة الأيام السبعة كاملة. استخدم صورة مستقيمة وعالية الدقة، أو قص الصورة لتشمل جدول الموظفين والأيام السبعة.");
    }
    const detectedDayBoundaries = rules.length >= 9 ? rules.slice(-9, -1) : rules.length === 8 ? rules : [];
    const boundaries = detectedDayBoundaries.length === 8 ? detectedDayBoundaries : (() => {
      const first = centers[0];
      const second = centers[1];
      const penultimate = centers[5];
      const last = centers[6];
      if (first === undefined || second === undefined || penultimate === undefined || last === undefined) {
        throw new Error("تعذر تحديد حدود أعمدة الأيام.");
      }
      return [
        first - (second - first) / 2,
        ...centers.slice(1).map((x, index) => {
          const previous = centers[index];
          return previous === undefined ? x : (previous + x) / 2;
        }),
        last + (last - penultimate) / 2,
      ];
    })();
    const firstScheduleX = boundaries[0];
    if (firstScheduleX === undefined) throw new Error("تعذر تحديد بداية جدول الأيام.");

    const leftRules = rules.filter((x) => x < firstScheduleX);
    let nameLeft = size.width * 0.075;
    let nameRight = size.width * 0.34;
    let widestNameColumn = 0;
    for (let index = 0; index < leftRules.length - 1; index++) {
      const left = leftRules[index];
      const right = leftRules[index + 1];
      if (left === undefined || right === undefined) continue;
      if (right - left > widestNameColumn) {
        widestNameColumn = right - left;
        nameLeft = left;
        nameRight = right;
      }
    }

    const scheduleWords = words.filter((word) => xCenter(word) >= firstScheduleX && isScheduleToken(word.text));
    const rowTolerance = Math.max(7, size.height * 0.006);

    // The printed serial-number column is a more reliable source of staff-row
    // positions than shift codes, because many cells are intentionally blank.
    const serialNumbers = new Map<number, number[]>();
    for (const word of words) {
      const serial = Number.parseInt(word.text.trim(), 10);
      if (
        xCenter(word) < size.width * 0.05 &&
        /^\d{1,2}$/.test(word.text.trim()) &&
        serial >= 1 && serial <= 30 &&
        center(word) >= size.height * 0.23 &&
        center(word) <= size.height * 0.83
      ) {
        const positions = serialNumbers.get(serial) ?? [];
        positions.push(center(word));
        serialNumbers.set(serial, positions);
      }
    }
    const serialEntries = [...serialNumbers.entries()]
      .filter(([, positions]) => positions.length > 0)
      .map(([rowNumber, positions]) => ({
        rowNumber,
        y: positions.reduce((sum, y) => sum + y, 0) / positions.length,
      }))
      .sort((a, b) => a.rowNumber - b.rowNumber);

    const wordRowGroups = groupWordsByRow(scheduleWords, rowTolerance);
    let rowEntries = serialEntries.length >= 20
      ? serialEntries
      : wordRowGroups
          .map((group, index) => ({
            rowNumber: index + 1,
            y: group.reduce((sum, word) => sum + center(word), 0) / group.length,
          }))
          .filter((entry) => entry.y >= size.height * 0.23 && entry.y <= size.height * 0.83);
    if (rowEntries.length < 2) {
      throw new Error("تعذر التعرف على صفوف الموظفين من الصورة. راجع وضوح الجدول ثم أعد المحاولة.");
    }
    const rowCenters = rowEntries.map((entry) => entry.y);
    const firstY = Math.min(...rowCenters);
    const lastY = Math.max(...rowCenters);
    const possibleNameWords = words.filter((word) => xCenter(word) >= nameLeft && xCenter(word) < nameRight && center(word) >= firstY - rowTolerance * 2.5 && center(word) <= lastY + rowTolerance * 2.5);
    const nameGroups = groupWordsByRow(possibleNameWords, rowTolerance);
    const rows: RecognizedRosterRow[] = rowEntries.map(({ rowNumber: rosterRowNumber, y: rowY }) => {
      const names = nameGroups
        .filter((group) => {
          const first = group[0];
          return first ? Math.abs(group.reduce((sum, word) => sum + center(word), 0) / group.length - rowY) <= rowTolerance * 2.5 : false;
        })
        .flat()
        .sort((a, b) => xCenter(a) - xCenter(b));
      const name = names.map((word) => word.text.trim()).filter((token) => !/^[|!.,;:_-]+$/.test(token)).join(" ").replace(/\s+/g, " ").trim();
      const allRowWords = words.filter((word) =>
        xCenter(word) >= firstScheduleX && Math.abs(center(word) - rowY) <= rowTolerance * 1.5
      );
      const rowText = allRowWords.map((word) => word.text.trim()).join(" ").replace(/\s+/g, " ").toUpperCase();
      const hasMergedAnnualLeave = rowText.includes("ANNUAL") && rowText.includes("LEAVE");
      const hasAnyWorkingCode = allRowWords.some((word) => {
        const token = normalizeToken(word.text);
        return Boolean(shiftForRosterCode(token) || isRosterDayOff(token));
      });
      let dayCodes: string[];
      if (hasMergedAnnualLeave && !hasAnyWorkingCode) {
        // Leave rows are sometimes printed across one merged cell instead of seven day cells.
        const till = rowText.match(/TILL\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
        const leaveCode = till ? `ANNUAL LEAVE TILL ${till[1]}` : "ANNUAL LEAVE";
        dayCodes = Array.from({ length: 7 }, () => leaveCode);
      } else {
        dayCodes = centers.map((_, dayIndex) => {
          const cell = scheduleWords.filter((word) => {
            const yNear = Math.abs(center(word) - rowY) <= rowTolerance * 1.5;
            const colIndex = boundaries.findIndex((left, i) => {
              const right = boundaries[i + 1];
              return right !== undefined && i < boundaries.length - 1 && xCenter(word) >= left && xCenter(word) < right;
            });
            return yNear && colIndex === dayIndex;
          });
          return correctedCode(cell);
        });
      }
      // All seven weekday cells are retained; users review the selected date's
      // cell before applying the roster to the assignment.
      return { rowNumber: rosterRowNumber, name, dayCodes };
    });
    return { rows: rows.filter((row) => row.name || row.dayCodes.some(Boolean)), rawText: result.data.text };
  } finally {
    await worker.terminate();
  }
}
