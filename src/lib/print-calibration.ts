import { useEffect, useState } from "react";

export type PrintCalibration = {
  dx: number;
  dy: number;
  fontScale: number;
};

type StoredCalibrations = Record<string, Partial<PrintCalibration>>;

const DEFAULT_CALIBRATION: PrintCalibration = { dx: 0, dy: 0, fontScale: 1 };
const STORAGE_KEY = "ward39.print-calibration.v1";

function readStoredCalibrations(): StoredCalibrations {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as StoredCalibrations)
      : {};
  } catch {
    return {};
  }
}

function normalizeCalibration(value: Partial<PrintCalibration> | undefined): PrintCalibration {
  const finite = (number: unknown, fallback: number) =>
    typeof number === "number" && Number.isFinite(number) ? number : fallback;

  return {
    dx: finite(value?.dx, DEFAULT_CALIBRATION.dx),
    dy: finite(value?.dy, DEFAULT_CALIBRATION.dy),
    fontScale: Math.min(
      2,
      Math.max(0.5, finite(value?.fontScale, DEFAULT_CALIBRATION.fontScale)),
    ),
  };
}

/** Saves alignment separately for each form and reuses it for batch or single printing. */
export function usePrintCalibration(formKey: string) {
  const [calibration, setCalibration] = useState<PrintCalibration>(DEFAULT_CALIBRATION);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredCalibrations();
    setCalibration(normalizeCalibration(stored[formKey]));
    setLoadedKey(formKey);
  }, [formKey]);

  useEffect(() => {
    // Do not replace a saved configuration with defaults while a new form loads.
    if (loadedKey !== formKey) return;

    try {
      const stored = readStoredCalibrations();
      stored[formKey] = calibration;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Printing still works if browser storage is blocked or unavailable.
    }
  }, [calibration, formKey, loadedKey]);

  const setDx = (dx: number) =>
    setCalibration((current) => ({
      ...current,
      dx: Number.isFinite(dx) ? dx : 0,
    }));

  const setDy = (dy: number) =>
    setCalibration((current) => ({
      ...current,
      dy: Number.isFinite(dy) ? dy : 0,
    }));

  const setFontScale = (fontScale: number) =>
    setCalibration((current) => ({
      ...current,
      fontScale: Math.min(2, Math.max(0.5, Number.isFinite(fontScale) ? fontScale : 1)),
    }));

  const resetCalibration = () => setCalibration(DEFAULT_CALIBRATION);

  return { ...calibration, setDx, setDy, setFontScale, resetCalibration };
}
