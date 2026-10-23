import { useEffect, useState } from "react";

export type PrintCalibration = {
  dx: number;
  dy: number;
  fontScale: number;
};

type StoredCalibrations = Record<string, Partial<PrintCalibration>>;

const DEFAULT_CALIBRATION: PrintCalibration = { dx: 0, dy: 0, fontScale: 1 };
let storedCalibrations: StoredCalibrations = {};

function readStoredCalibrations(): StoredCalibrations {
  return storedCalibrations;
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
      storedCalibrations[formKey] = calibration;
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

export type PrintFieldPosition = { left: number; top: number };
type StoredFieldPositions = Record<string, Record<string, PrintFieldPosition>>;
let storedFieldPositions: StoredFieldPositions = {};
const FIELD_POSITION_RESET_EVENT = "ward39:print-field-positions-reset";
const FIELD_POSITION_CHANGE_EVENT = "ward39:print-field-position-changed";

function readFieldPositions(): StoredFieldPositions {
  return storedFieldPositions;
}

/**
 * Stores freely draggable field coordinates per paper form in the coordinate
 * system of the scanned template. Positions are shared by individual/batch
 * printing in the same browser and can be reset from either page.
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

  useEffect(() => {
    const saved = readFieldPositions()[formKey]?.[fieldKey];
    setPositionState({
      left: typeof saved?.left === "number" && Number.isFinite(saved.left) ? saved.left : defaultLeft,
      top: typeof saved?.top === "number" && Number.isFinite(saved.top) ? saved.top : defaultTop,
    });
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
    const nextPosition = { left, top };
    setPositionState(nextPosition);
    try {
      storedFieldPositions[formKey] ??= {};
      storedFieldPositions[formKey][fieldKey] = nextPosition;
      window.dispatchEvent(
        new CustomEvent(FIELD_POSITION_CHANGE_EVENT, {
          detail: { formKey, fieldKey, position: nextPosition },
        }),
      );
    } catch {
      // Position saving/syncing is optional if browser storage is unavailable.
    }
  };

  return { position, setPosition };
}

export function resetPrintFieldPositions(formKey: string) {
  try {
    delete storedFieldPositions[formKey];
    window.dispatchEvent(new CustomEvent(FIELD_POSITION_RESET_EVENT, { detail: formKey }));
  } catch {
    // Reset is optional if browser storage is unavailable.
  }
}
