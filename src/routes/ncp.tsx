import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Printer } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";
import { CarePlanTab } from "@/components/PatientRecords";

export const Route = createFileRoute("/ncp")({
  head: () => ({
    meta: [
      { title: "خطة الرعاية التمريضية — جناح 39 | Nursing Care Plan" },
      { name: "description", content: "Review and print the nursing care plan for a Ward 39 patient." },
      { property: "og:title", content: "Nursing Care Plan — Ward 39" },
      { property: "og:description", content: "Review and print nursing care plans for Ward 39 patients." },
    ],
  }),
  component: NcpPage,
});

function NcpPage() {
  const { t } = useLang();
  const patients = useActivePatients();
  const [patientId, setPatientId] = useState<number | "">("");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("ncp")}</h1>

      <Card>
        <CardHeader title={t("selectPatient")} />
        <div className="px-5 py-4">
          <Field label={t("name")}>
            <PatientPicker value={patientId} onChange={setPatientId} patients={patients} />
          </Field>
        </div>
      </Card>

      {patientId ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Link to="/patients/$patientId" params={{ patientId: String(patientId) }}>
              <Button variant="outline">
                <ClipboardList />
                {t("openFile")}
              </Button>
            </Link>
            <Link to="/print/$patientId/careplan" params={{ patientId: String(patientId) }}>
              <Button>
                <Printer />
                {t("print")}
              </Button>
            </Link>
          </div>

          <Card>
            <CardHeader title={t("careplan")} />
            <div className="p-5">
              <CarePlanTab patientId={patientId} />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
