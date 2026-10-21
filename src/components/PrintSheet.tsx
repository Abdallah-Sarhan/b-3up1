import { useState } from "react";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Printer } from "lucide-react";
import { db, type Patient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";
import { PrintFontScale } from "@/components/OverlayPrint";
import { usePrintCalibration } from "@/lib/print-calibration";

export function usePrintPatient() {
  const { patientId } = useParams({ strict: false }) as { patientId: string };
  const id = Number(patientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  return { id, patientId, patient };
}

export function PrintShell({
  title,
  patient,
  landscape,
  children,
  formKey,
  template,
}: {
  title: string;
  patient: Patient | null | undefined;
  landscape?: boolean;
  children: React.ReactNode;
  formKey?: string;
  /** Optional pre-printed form scan used as a print background. */
  template?: string;
}) {
  const { t, lang } = useLang();
  const { patientId } = useParams({ strict: false }) as { patientId: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNcpPrint = pathname.startsWith("/print/") && pathname.endsWith("/careplan");
  const [ls, setLs] = useState(!!landscape);
  const [printMode, setPrintMode] = useState<"white" | "form">("white");
  const [guide, setGuide] = useState(true);
  const { dx, dy, fontScale, setDx, setDy, setFontScale, resetCalibration } =
    usePrintCalibration(formKey ?? "print-shell");

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

  const formOnly = Boolean(formKey) && printMode === "form";
  const pageWidth = ls ? "297mm" : "210mm";
  const pageHeight = ls ? "210mm" : "297mm";

  return (
    <div className={`min-h-screen bg-muted py-6 print:bg-white print:py-0 ${formOnly ? "print-form-only" : ""}`}>
      <style>{`@media print {
        @page { size: A4 ${ls ? "landscape" : "portrait"}; margin: ${template ? "0" : "8mm"}; }
        .print-form-only table, .print-form-only th, .print-form-only td,
        .print-form-only .border-black {
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
        }
      }`}</style>
      <div
        className={`mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 px-4 print:hidden ${
          ls ? "max-w-[297mm]" : "max-w-[210mm]"
        }`}
      >
        {isNcpPrint ? (
          <Link to="/ncp">
            <Button variant="outline" size="sm">
              <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
              {t("back")}
            </Button>
          </Link>
        ) : (
          <Link to="/patients/$patientId" params={{ patientId }}>
            <Button variant="outline" size="sm">
              <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
              {t("back")}
            </Button>
          </Link>
        )}
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {!template ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ls} onChange={(e) => setLs(e.target.checked)} />
            {lang === "ar" ? "ورقة أفقية (Landscape)" : "Landscape page"}
          </label>
        ) : null}
        {formKey ? (
          <>
            <fieldset className="flex flex-wrap items-center gap-3 rounded-md border border-input px-3 py-2 text-sm">
              <legend className="px-1 font-medium">Print option</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name={`print-mode-${formKey}`} checked={printMode === "white"} onChange={() => setPrintMode("white")} />
                Print on White Paper
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`print-mode-${formKey}`} checked={printMode === "form"} onChange={() => setPrintMode("form")} />
                Print on Form
              </label>
            </fieldset>
            {template && printMode === "form" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
                {lang === "ar" ? "عرض النموذج كخلفية (لا يُطبع)" : "Show form as background (not printed)"}
              </label>
            ) : null}
            <label className="flex items-center gap-1 text-sm">
              {lang === "ar" ? "إزاحة أفقي (mm)" : "Offset X (mm)"}
              <input type="number" step="0.1" value={dx} onChange={(e) => setDx(Number(e.target.value))} className="h-8 w-16 rounded-md border border-input px-1" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              {lang === "ar" ? "إزاحة رأسي (mm)" : "Offset Y (mm)"}
              <input type="number" step="0.1" value={dy} onChange={(e) => setDy(Number(e.target.value))} className="h-8 w-16 rounded-md border border-input px-1" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              {lang === "ar" ? "حجم الخط (%)" : "Font size (%)"}
              <input
                type="number"
                min={50}
                max={200}
                step={5}
                value={Math.round(fontScale * 100)}
                onChange={(e) => setFontScale(Math.min(2, Math.max(0.5, (Number(e.target.value) || 100) / 100)))}
                className="h-8 w-16 rounded-md border border-input px-1"
              />
            </label>
            <Button variant="outline" size="sm" onClick={resetCalibration}>
              {lang === "ar" ? "إعادة ضبط المحاذاة" : "Reset alignment"}
            </Button>
          </>
        ) : null}
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
      </div>
      <div
        dir="ltr"
        className={`relative mx-auto bg-white text-black shadow-md print:shadow-none ${template ? "overflow-hidden print:p-0" : "w-full p-[12mm] print:max-w-none print:p-0"} ${
          ls ? "max-w-[297mm] print:w-full" : "max-w-[210mm]"
        }`}
        style={{
          width: template ? pageWidth : undefined,
          height: template ? pageHeight : undefined,
          fontFamily: "'Times New Roman', Times, serif",
        }}
      >
        {template && (printMode === "white" || (guide && printMode === "form")) ? (
          <img
            src={template}
            alt=""
            aria-hidden
            className={`absolute inset-0 h-full w-full object-fill ${printMode === "white" ? "opacity-100" : "opacity-30 print:hidden"}`}
          />
        ) : null}
        <div
          className={template ? "absolute inset-0" : ""}
          style={{
            transform: `translate(${dx}mm, ${dy}mm)${template ? "" : ` scale(${fontScale})`}`,
            transformOrigin: "top left",
          }}
        >
          <PrintFontScale.Provider value={fontScale}>{children}</PrintFontScale.Provider>
        </div>
      </div>
    </div>
  );
}


export function KcmhHeader({ right }: { right?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
      <div>
        <div className="text-base font-bold">KUWAIT CENTER FOR MENTAL HEALTH</div>
        <div className="text-sm">(WARD-39)</div>
      </div>
      {right ? <div className="text-sm font-bold">{right}</div> : null}
    </div>
  );
}

export function PatientHeaderGrid({ patient }: { patient: Patient }) {
  const cells: Array<[string, string]> = [
    ["Name", patient.name],
    ["File #", patient.fileNo],
    ["CID", patient.cid],
    ["DOB / Age", [patient.dob, patient.age].filter(Boolean).join(" / ")],
    ["Diagnosis", patient.diagnosis],
    ["Ward", "39"],
    ["D.O.A", patient.doa],
    ["Nationality", patient.nationality],
    ["Tr. Doctor", patient.doctor],
    ["Sex", patient.sex],
    ["Room / Bed", [patient.room, patient.bed].filter(Boolean).join(" / ")],
    ["Marital Status", patient.maritalStatus],
  ];
  return (
    <table className="mb-3 w-full border-collapse text-sm">
      <tbody>
        {Array.from({ length: Math.ceil(cells.length / 3) }, (_, r) => (
          <tr key={r}>
            {cells.slice(r * 3, r * 3 + 3).map(([label, value], i) => (
              <td key={i} className="border border-black px-2 py-1">
                <span className="font-bold">{label}: </span>
                {value || "—"}
              </td>
            ))}
            {cells.slice(r * 3, r * 3 + 3).length < 3
              ? Array.from({ length: 3 - cells.slice(r * 3, r * 3 + 3).length }, (_, i) => (
                  <td key={`e${i}`} className="border border-black px-2 py-1" />
                ))
              : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-3 text-center text-lg font-bold underline">{children}</h1>;
}
