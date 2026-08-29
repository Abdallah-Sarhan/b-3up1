import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Printer } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";
import { PRINT_FORMS, getPrintForm, type PrintFormDef } from "@/components/print-content";
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
  last,
}: {
  form: PrintFormDef;
  patient: Patient;
  guide: boolean;
  dx: number;
  dy: number;
  last: boolean;
}) {
  const breakStyle = last ? undefined : ({ breakAfter: "page", pageBreakAfter: "always" } as const);

  if (form.template) {
    return (
      <div
        dir="ltr"
        className="relative mx-auto mb-6 bg-white text-black shadow-md print:mb-0 print:shadow-none"
        style={{
          width: "210mm",
          height: "297mm",
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
          <form.Content patient={patient} id={patient.id!} />
        </div>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      className="mx-auto mb-6 w-full bg-white p-[12mm] text-black shadow-md print:mb-0 print:p-0 print:shadow-none"
      style={{
        maxWidth: form.landscape ? "297mm" : "210mm",
        minHeight: form.landscape ? "200mm" : "285mm",
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

  if (!form) {
    return (
      <p className="p-10 text-center">
        <Link to="/paper-forms" className="text-primary underline">
          ← {t("back")}
        </Link>
      </p>
    );
  }

  const list = (patients ?? []).filter((p) => p.id != null);

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4 ${form.landscape ? "landscape" : "portrait"}; margin: ${
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
            last={i === list.length - 1}
          />
        ))
      )}
    </div>
  );
}
