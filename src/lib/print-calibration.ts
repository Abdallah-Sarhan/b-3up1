import { useEffect, useRef, useState } from "react";
import { fetchCloudSharedSettings, saveCloudSharedSetting } from "@/lib/cloud-direct";

export type PrintCalibration = { dx: number; dy: number; fontScale: number };
type StoredCalibrations = Record<string, Partial<PrintCalibration>>;
const DEFAULT_CALIBRATION: PrintCalibration = { dx: 0, dy: 0, fontScale: 1 };
const CALIBRATION_PREFIX = "ward39.print-calibration:";
const FIELD_POSITION_PREFIX = "ward39.print-field-positions:";
let storedCalibrations: StoredCalibrations = {};
let calibrationLoad: Promise<boolean> | null = null;
let storedFieldPositions: StoredFieldPositions = {};
const fieldPositionLoads = new Map<string, Promise<boolean>>();
const fieldPositionSaves = new Map<string, ReturnType<typeof setTimeout>>();
const FIELD_POSITION_RESET_EVENT = "ward39:print-field-positions-reset";
const FIELD_POSITION_CHANGE_EVENT = "ward39:print-field-position-changed";

function normalizeCalibration(value: Partial<PrintCalibration> | undefined): PrintCalibration {
  const finite = (number: unknown, fallback: number) =>
    typeof number === "number" && Number.isFinite(number) ? number : fallback;
  return {
    dx: finite(value?.dx, DEFAULT_CALIBRATION.dx),
    dy: finite(value?.dy, DEFAULT_CALIBRATION.dy),
    fontScale: Math.min(2, Math.max(0.5, finite(value?.fontScale, DEFAULT_CALIBRATION.fontScale))),
  };
}

async function loadCalibrationsFromCloud(): Promise<boolean> {
  if (!calibrationLoad) {
    calibrationLoad = fetchCloudSharedSettings(CALIBRATION_PREFIX).then((rows) => {
      for (const row of rows) {
        const formKey = row.key.slice(CALIBRATION_PREFIX.length);
        if (!formKey) continue;
        try {
          const value: unknown = JSON.parse(row.value);
          if (value && typeof value === "object" && !Array.isArray(value)) {
            storedCalibrations[formKey] = value as Partial<PrintCalibration>;
          }
        } catch { /* Ignore malformed configuration rows. */ }
      }
      return true;
    }).catch(() => {
      calibrationLoad = null;
      return false;
    });
  }
  return calibrationLoad;
}

function saveCalibrationToCloud(formKey: string, calibration: PrintCalibration) {
  storedCalibrations[formKey] = calibration;
  void saveCloudSharedSetting(CALIBRATION_PREFIX + formKey, JSON.stringify(calibration)).catch(() => {
    // Keep the adjustment usable in this tab; cloud failures never mark clinical data as saved.
  });
}

/** Store print alignment in the shared cloud settings table, not browser storage. */
export function usePrintCalibration(formKey: string) {
  const [calibration, setCalibration] = useState<PrintCalibration>(DEFAULT_CALIBRATION);

  useEffect(() => {
    let alive = true;
    void loadCalibrationsFromCloud().then(() => {
      if (alive) setCalibration(normalizeCalibration(storedCalibrations[formKey]));
    });
    return () => { alive = false; };
  }, [formKey]);

  const setDx = (dx: number) => {
    const next = { ...calibration, dx: Number.isFinite(dx) ? dx : 0 };
    setCalibration(next);
    saveCalibrationToCloud(formKey, next);
  };
  const setDy = (dy: number) => {
    const next = { ...calibration, dy: Number.isFinite(dy) ? dy : 0 };
    setCalibration(next);
    saveCalibrationToCloud(formKey, next);
  };
  const setFontScale = (fontScale: number) => {
    const next = {
      ...calibration,
      fontScale: Math.min(2, Math.max(0.5, Number.isFinite(fontScale) ? fontScale : 1)),
    };
    setCalibration(next);
    saveCalibrationToCloud(formKey, next);
  };
  const resetCalibration = () => {
    setCalibration(DEFAULT_CALIBRATION);
    saveCalibrationToCloud(formKey, DEFAULT_CALIBRATION);
  };

  return { ...calibration, setDx, setDy, setFontScale, resetCalibration };
}

export type PrintFieldPosition = { left: number; top: number };
type StoredFieldPositions = Record<string, Record<string, PrintFieldPosition>>;

async function loadFieldPositionsFromCloud(formKey: string): Promise<boolean> {
  const pending = fieldPositionLoads.get(formKey);
  if (pending) return pending;
  const loading = fetchCloudSharedSettings(FIELD_POSITION_PREFIX + formKey).then((rows) => {
    const row = rows.find((item) => item.key === FIELD_POSITION_PREFIX + formKey);
    if (!row) {
      storedFieldPositions[formKey] = {};
      return true;
    }
    try {
      const value: unknown = JSON.parse(row.value);
      storedFieldPositions[formKey] =
        value && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, PrintFieldPosition>
          : {};
    } catch {
      storedFieldPositions[formKey] = {};
    }
    return true;
  }).catch(() => {
    fieldPositionLoads.delete(formKey);
    return false;
  });
  fieldPositionLoads.set(formKey, loading);
  return loading;
}

function scheduleFieldPositionSave(formKey: string) {
  const old = fieldPositionSaves.get(formKey);
  if (old) clearTimeout(old);
  const timer = setTimeout(() => {
    fieldPositionSaves.delete(formKey);
    void saveCloudSharedSetting(
      FIELD_POSITION_PREFIX + formKey,
      JSON.stringify(storedFieldPositions[formKey] ?? {}),
    ).catch(() => {
      // Draggable fields remain active for this session if settings are unavailable.
    });
  }, 300);
  fieldPositionSaves.set(formKey, timer);
}

/**
 * Loads shared coordinates from Supabase, while using memory only for immediate
 * interaction. Individual and batch print screens share the same cloud settings.
 */
export function usePrintFieldPosition(
  formKey: string,
  fieldKey: string,
  defaultLeft: number,
  defaultTop: number,
) {
  const [position, setPositionState] = useState<PrintFieldPosition>({
    left: defaultLeft,
    top: defaultTop,
  });
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    touched.current = false;
    void loadFieldPositionsFromCloud(formKey).then(() => {
      if (!alive || touched.current) return;
      const saved = storedFieldPositions[formKey]?.[fieldKey];
      setPositionState({
        left: typeof saved?.left === "number" && Number.isFinite(saved.left) ? saved.left : defaultLeft,
        top: typeof saved?.top === "number" && Number.isFinite(saved.top) ? saved.top : defaultTop,
      });
    });
    return () => { alive = false; };
  }, [formKey, fieldKey, defaultLeft, defaultTop]);

  useEffect(() => {
    const handleReset = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== formKey) return;
      setPositionState({ left: defaultLeft, top: defaultTop });
    };
    const handlePositionChange = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as {
        formKey?: string;
        fieldKey?: string;
        position?: PrintFieldPosition;
      };
      if (detail.formKey !== formKey || detail.fieldKey !== fieldKey || !detail.position) return;
      setPositionState(detail.position);
    };
    window.addEventListener(FIELD_POSITION_RESET_EVENT, handleReset);
    window.addEventListener(FIELD_POSITION_CHANGE_EVENT, handlePositionChange);
    return () => {
      window.removeEventListener(FIELD_POSITION_RESET_EVENT, handleReset);
      window.removeEventListener(FIELD_POSITION_CHANGE_EVENT, handlePositionChange);
    };
  }, [formKey, fieldKey, defaultLeft, defaultTop]);

  const setPosition = (left: number, top: number) => {
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    touched.current = true;
    const nextPosition = { left, top };
    setPositionState(nextPosition);
    storedFieldPositions[formKey] ??= {};
    storedFieldPositions[formKey][fieldKey] = nextPosition;
    window.dispatchEvent(
      new CustomEvent(FIELD_POSITION_CHANGE_EVENT, {
        detail: { formKey, fieldKey, position: nextPosition },
      }),
    );
    scheduleFieldPositionSave(formKey);
  };

  return { position, setPosition };
}

export function resetPrintFieldPositions(formKey: string) {
  delete storedFieldPositions[formKey];
  window.dispatchEvent(new CustomEvent(FIELD_POSITION_RESET_EVENT, { detail: formKey }));
  scheduleFieldPositionSave(formKey);
}
