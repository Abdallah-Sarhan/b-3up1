import { createFileRoute } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { PatientForm } from "@/components/PatientForm";

export const Route = createFileRoute("/patients/new")({
  head: () => ({
    meta: [
      { title: "مريض جديد — Ward 39" },
      { name: "description", content: "Register a new patient in Ward 39 registry." },
      { property: "og:title", content: "New Patient — Ward 39" },
      { property: "og:description", content: "Register a new patient in Ward 39 registry." },
    ],
  }),
  component: NewPatientPage,
});

function NewPatientPage() {
  const { t } = useLang();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("newPatient")}</h1>
      <PatientForm />
    </div>
  );
}
