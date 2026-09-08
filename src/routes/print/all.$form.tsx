import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Printer } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";
import { PRINT_FORMS, getPrintForm, type PrintFormDef } from "@/components/print-content";
import { PrintFontScale } from "@/components/OverlayPrint";
import type { Patient } from "@/lib/db";

export const Route = createFileRoute("/print/all/$form")({
  head: () => ({
    meta: [
      { title: "طباعة جماعية — جناح 39 | Batch Print — Ward 39" },
      {
        name: "description",
        content: "Print any Ward 39 form for every admitted patient at once, one A4 page per patient.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BatchPrintPage,
});

function Sheet({
  form,
  patient,
  guide,
  dx,
  dy,
  fontScale,
  landscape,
  last,
}: {
  form: PrintFormDef;
  patient: Patient;
  guide: boolean;
  dx: number;
  dy: number;
  fontScale: number;
  landscape: boolean;
  last: boolean;
}) {
  const breakStyle = last ? undefined : ({ breakAfter: "page", pageBreakAfter: "always" } as const);

  if (form.template) {
    return (
      <div
        dir="ltr"
        className="relative mx-auto mb-6 overflow-hidden bg-white text-black shadow-md print:mb-0 print:shadow-none"
        style={{
          width: "210mm",
          height: "296mm",
          breakInside: "avoid",
          fontFamily: "Arial, Helvetica, sans-serif",
          ...(breakStyle ?? {}),
        }}
      >
        {guide ? (
          <img
            src={form.template}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-fill opacity-30 print:hidden"
          />
        ) : null}
        <div className="absolute inset-0" style={{ transform: `translate(${dx}mm, ${dy}mm)` }}>
          <PrintFontScale.Provider value={fontScale}>
            <form.Content patient={patient} id={patient.id!} />
          </PrintFontScale.Provider>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      className="mx-auto mb-6 w-full overflow-hidden bg-white p-[12mm] text-black shadow-md print:mb-0 print:p-0 print:shadow-none"
      style={{
        maxWidth: landscape ? "297mm" : "210mm",
        minHeight: landscape ? "188mm" : "275mm",
        breakInside: "avoid",
        fontFamily: "'Times New Roman', Times, serif",
        ...(breakStyle ?? {}),
      }}
    >
      <form.Content patient={patient} id={patient.id!} />
    </div>
  );
}

function BatchPrintPage() {
  const { t, lang } = useLang();
  const { form: formKey } = useParams({ from: "/print/all/$form" });
  const form = getPrintForm(formKey);
  const patients = useActivePatients();
  const [guide, setGuide] = useState(false);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  // Page orientation is user-switchable for non-overlay forms; overlay
  // templates stay portrait because their fields are calibrated to the scan.
  const [lsOverride, setLsOverride] = useState<boolean | null>(null);
  const landscape = form?.template ? false : (lsOverride ?? !!form?.landscape);

  if (!form) {
    return (
      <p className="p-10 text-center">
        <Link to="/paper-forms" className="text-primary underline">
          ← {t("back")}
        </Link>
      </p>
    );
  }

  // Batch printing follows the ward folder order (Folder No), ascending.
  const list = (patients ?? [])
    .filter((p) => p.id != null)
    .slice()
    .sort((a, b) => {
      const na = Number(String(a.fileNo ?? "").replace(/\D/g, ""));
      const nb = Number(String(b.fileNo ?? "").replace(/\D/g, ""));
      const va = Number.isFinite(na) ? na : Number.POSITIVE_INFINITY;
      const vb = Number.isFinite(nb) ? nb : Number.POSITIVE_INFINITY;
      if (va !== vb) return va - vb;
      return String(a.fileNo ?? "").localeCompare(String(b.fileNo ?? ""));
    });

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: ${
        form.template ? "0" : "8mm"
      }; } }`}</style>

      <div className="mx-auto mb-4 max-w-[297mm] px-4 print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/paper-forms">
            <Button variant="outline" size="sm">
              <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
              {t("back")}
            </Button>
          </Link>
          <span className="text-sm font-medium">
            {lang === "ar" ? form.ar : form.en} — {t("activePatients")}: {list.length}
          </span>
          {form.template ? null : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={landscape}
                onChange={(e) => setLsOverride(e.target.checked)}
              />
              {lang === "ar" ? "ورقة أفقية (Landscape)" : "Landscape page"}
            </label>
          )}
          {form.template ? (
            <>
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
            </>
          ) : null}
          <Button size="sm" onClick={() => window.print()} disabled={list.length === 0}>
            <Printer />
            {t("printAll")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRINT_FORMS.map((f) => (
            <Link
              key={f.key}
              to="/print/all/$form"
              params={{ form: f.key }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                f.key === form.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary hover:bg-accent"
              }`}
            >
              {lang === "ar" ? f.ar : f.en}
            </Link>
          ))}
        </div>
      </div>

      {patients === undefined ? (
        <p className="p-10 text-center text-muted-foreground print:hidden">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="p-10 text-center text-muted-foreground print:hidden">{t("noEntries")}</p>
      ) : (
        list.map((p, i) => (
          <Sheet
            key={p.id}
            form={form}
            patient={p}
            guide={guide}
            dx={dx}
            dy={dy}
            fontScale={fontScale}
            landscape={landscape}
            last={i === list.length - 1}
          />
        ))
      )}
    </div>
  );
}
