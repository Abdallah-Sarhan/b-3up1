import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, FileText, HeartPulse, NotebookPen, Printer } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Card, CardHeader, Field } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/paper-forms")({
  head: () => ({
    meta: [
      { title: "النماذج الورقية — جناح 39 | Paper Forms — Ward 39" },
      { name: "description", content: "Print A4 paper forms for a Ward 39 patient: data sheet, SBAR, vitals, nurses notes and care plan." },
      { property: "og:title", content: "Paper Forms — Ward 39" },
      { property: "og:description", content: "Print A4 forms: patient data, SBAR, vitals, nurses notes and care plan." },
    ],
  }),
  component: PaperFormsPage,
});

function PaperFormsPage() {
  const { t } = useLang();
  const patients = useActivePatients();
  const [patientId, setPatientId] = useState<number | "">("");

  const forms = [
    { to: "/print/$patientId/summary", icon: FileText, label: t("patientData") },
    { to: "/print/$patientId/sbar", icon: ClipboardList, label: t("sbarForm") },
    { to: "/print/$patientId/vitals", icon: HeartPulse, label: t("vitalsForm") },
    { to: "/print/$patientId/notes", icon: NotebookPen, label: t("notesForm") },
    { to: "/print/$patientId/careplan", icon: Printer, label: t("careplanForm") },
    { to: "/print/$patientId/treatment", icon: FileText, label: t("treatmentForm") },
    { to: "/print/$patientId/consultation", icon: ClipboardList, label: t("consultationForm") },
    { to: "/print/$patientId/progress", icon: NotebookPen, label: t("progressForm") },
    { to: "/print/$patientId/nursingdb", icon: FileText, label: t("nursingDbForm") },
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("paperForm")}</h1>
      <Card>
        <CardHeader title={t("selectPatient")} />
        <div className="px-5 py-4">
          <Field label={t("name")}>
            <PatientPicker value={patientId} onChange={setPatientId} patients={patients} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {forms.map((f) =>
          patientId ? (
            <Link
              key={f.to}
              to={f.to}
              params={{ patientId: String(patientId) }}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 font-medium shadow-sm hover:border-primary hover:bg-accent"
            >
              <f.icon className="size-5" />
              {f.label}
            </Link>
          ) : (
            <span
              key={f.to}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border px-5 py-4 font-medium text-muted-foreground"
            >
              <f.icon className="size-5" />
              {f.label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
