import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { PatientForm } from "@/components/PatientForm";

export const Route = createFileRoute("/patients/$patientId/edit")({
  head: () => ({
    meta: [
      { title: "تعديل مريض — Ward 39" },
      { name: "description", content: "Edit patient details in Ward 39 registry." },
      { property: "og:title", content: "Edit Patient — Ward 39" },
      { property: "og:description", content: "Edit patient details in Ward 39 registry." },
    ],
  }),
  component: EditPatientPage,
});

function EditPatientPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { patientId } = useParams({ from: "/patients/$patientId/edit" });
  const id = Number(patientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);

  if (patient === undefined) return <p className="py-10 text-center text-muted-foreground">{t("loading")}</p>;
  if (patient === null || !patient) {
    navigate({ to: "/patients" });
    return null;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("editPatient")}</h1>
      <PatientForm patient={patient} />
    </div>
  );
}
