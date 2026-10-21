import { useEffect, useState } from "react";

export type PrintCalibration = { dx: number; dy: number; fontScale: number };
const DEFAULT_CALIBRATION: PrintCalibration = { dx: 0, dy: 0, fontScale: 1 };
const STORAGE_KEY = "ward39.print-calibration.v1";

export function usePrintCalibration(formKey: string) {
  const [calibration, setCalibration] = useState<PrintCalibration>(DEFAULT_CALIBRATION);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as Record<string, Partial<PrintCalibration>> : {};
      const value = stored[formKey] ?? {};
      const finite = (n: unknown, fallback: number) => typeof n === "number" && Number.isFinite(n) ? n : fallback;
      setCalibration({ dx: finite(value.dx, 0), dy: finite(value.dy, 0), fontScale: Math.min(2, Math.max(0.5, finite(value.fontScale, 1))) });
    } catch { setCalibration(DEFAULT_CALIBRATION); }
    setLoadedKey(formKey);
  }, [formKey]);
  useEffect(() => {
    if (loadedKey !== formKey) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as Record<string, Partial<PrintCalibration>> : {};
      stored[formKey] = calibration;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { /* Settings are optional; printing remains available if storage is blocked. */ }
  }, [calibration, formKey, loadedKey]);
  const setDx = (dx: number) => setCalibration((current) => ({ ...current, dx: Number.isFinite(dx) ? dx : 0 }));
  const setDy = (dy: number) => setCalibration((current) => ({ ...current, dy: Number.isFinite(dy) ? dy : 0 }));
  const setFontScale = (fontScale: number) => setCalibration((current) => ({ ...current, fontScale: Math.min(2, Math.max(0.5, Number.isFinite(fontScale) ? fontScale : 1)) }));
  const resetCalibration = () => setCalibration(DEFAULT_CALIBRATION);
  return { ...calibration, setDx, setDy, setFontScale, resetCalibration };
}
