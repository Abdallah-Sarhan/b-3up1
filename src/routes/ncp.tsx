import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardList, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";

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

  const plans = useLiveQuery(
    () =>
      patientId
        ? db.careplan.where("patientId").equals(patientId).toArray()
        : Promise.resolve([] as import("@/lib/db").CarePlanEntry[]),
    [patientId],
  );

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
            <CardHeader title={t("careplan")} subtitle={String(plans?.length ?? 0)} />
            <ul className="divide-y divide-border">
              {(plans ?? []).map((p) => (
                <li key={p.id} className="space-y-1 px-5 py-3">
                  <p className="font-medium">
                    {p.problemNo ? `${p.problemNo}. ` : ""}
                    {p.problem}
                  </p>
                  <p className="text-sm text-muted-foreground">{p.objective}</p>
                  <p className="text-sm">{p.intervention}</p>
                </li>
              ))}
              {(plans?.length ?? 0) === 0 ? (
                <li className="px-5 py-8 text-center text-muted-foreground">{t("noEntries")}</li>
              ) : null}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}
