import { useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Printer } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Patient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";

export type OverlayFormKey =
  | "notes"
  | "treatment"
  | "consultation"
  | "progress"
  | "nursingdb";

export const OVERLAY_FORMS: Array<{
  key: OverlayFormKey;
  to: string;
  ar: string;
  en: string;
}> = [
  { key: "notes", to: "/print/$patientId/notes", ar: "ملاحظات التمريض", en: "Nurses Notes" },
  { key: "treatment", to: "/print/$patientId/treatment", ar: "ورقة العلاج (MR 12)", en: "Treatment Sheet" },
  { key: "consultation", to: "/print/$patientId/consultation", ar: "تقرير استشاري (MR 9)", en: "Consultation Report" },
  { key: "progress", to: "/print/$patientId/progress", ar: "تقدم الحالة (MR 8)", en: "Clinical Progress" },
  { key: "nursingdb", to: "/print/$patientId/nursingdb", ar: "البيانات الأساسية (NURS 6A)", en: "Nursing Data Base" },
];

export function usePrintPatientData() {
  const { patientId } = useParams({ strict: false }) as { patientId: string };
  const id = Number(patientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  return { id, patientId, patient };
}

/** Builds an absolutely positioned <Field> bound to a reference scan size. */
export function makeField(iw: number, ih: number) {
  return function Field({
    left,
    top,
    width,
    children,
    align = "left",
    size = 13,
    spacing,
    bold,
  }: {
    left: number;
    top: number;
    width: number;
    children: ReactNode;
    align?: "left" | "center";
    size?: number;
    spacing?: number;
    bold?: boolean;
  }) {
    return (
      <div
        className="absolute overflow-hidden leading-tight"
        style={{
          left: `${(left / iw) * 100}%`,
          top: `${(top / ih) * 100}%`,
          width: `${(width / iw) * 100}%`,
          textAlign: align,
          fontSize: `${size}px`,
          fontWeight: bold ? 700 : 400,
          letterSpacing: spacing ? `${spacing}px` : "0.2px",
        }}
      >
        {children}
      </div>
    );
  };
}

/** Spread digits evenly across a row of pre-printed boxes. */
export function BoxedDigits({
  value,
  cells,
  left,
  width,
  top,
  iw,
  ih,
  size = 15,
}: {
  value: string;
  cells: number;
  left: number;
  width: number;
  top: number;
  iw: number;
  ih: number;
  size?: number;
}) {
  const digits = value.slice(-cells).padStart(cells, " ").split("");
  const cw = width / cells;
  return (
    <>
      {digits.map((d, i) => (
        <div
          key={i}
          className="absolute text-center leading-tight"
          style={{
            left: `${((left + i * cw) / iw) * 100}%`,
            top: `${(top / ih) * 100}%`,
            width: `${(cw / iw) * 100}%`,
            fontSize: `${size}px`,
          }}
        >
          {d.trim()}
        </div>
      ))}
    </>
  );
}

export function OverlayPrintPage({
  formKey,
  template,
  children,
}: {
  formKey: OverlayFormKey;
  template: string;
  children: (patient: Patient) => ReactNode;
}) {
  const { t, lang } = useLang();
  const { patientId, patient } = usePrintPatientData();
  const [guide, setGuide] = useState(true);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

  if (patient === undefined) {
    return <p className="p-10 text-center text-muted-foreground">{t("loading")}</p>;
  }
  if (!patient) {
    return (
      <p className="p-10 text-center">
        <Link to="/" className="text-primary underline">← {t("back")}</Link>
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>

      <div className="mx-auto mb-3 max-w-[210mm] px-4 print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/patients/$patientId" params={{ patientId }}>
            <Button variant="outline" size="sm">
              <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
              {t("back")}
            </Button>
          </Link>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
            {lang === "ar" ? "عرض النموذج كخلفية (لا يُطبع)" : "Show form as background (not printed)"}
          </label>
          <label className="flex items-center gap-1 text-sm">
            {lang === "ar" ? "إزاحة أفقي (mm)" : "Offset X (mm)"}
            <input
              type="number"
              step="0.5"
              value={dx}
              onChange={(e) => setDx(Number(e.target.value))}
              className="h-8 w-16 rounded-md border border-input px-1"
            />
          </label>
          <label className="flex items-center gap-1 text-sm">
            {lang === "ar" ? "إزاحة رأسي (mm)" : "Offset Y (mm)"}
            <input
              type="number"
              step="0.5"
              value={dy}
              onChange={(e) => setDy(Number(e.target.value))}
              className="h-8 w-16 rounded-md border border-input px-1"
            />
          </label>
          <Button size="sm" onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {OVERLAY_FORMS.map((f) => (
            <Link
              key={f.key}
              to={f.to}
              params={{ patientId }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                f.key === formKey
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary hover:bg-accent"
              }`}
            >
              {lang === "ar" ? f.ar : f.en}
            </Link>
          ))}
        </div>
      </div>

      <div
        dir="ltr"
        className="relative mx-auto bg-white text-black shadow-md print:shadow-none"
        style={{ width: "210mm", height: "297mm", fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {guide ? (
          <img
            src={template}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-fill opacity-30 print:hidden"
          />
        ) : null}
        <div className="absolute inset-0" style={{ transform: `translate(${dx}mm, ${dy}mm)` }}>
          {children(patient)}
        </div>
      </div>
    </div>
  );
}
