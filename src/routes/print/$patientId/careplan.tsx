import { createFileRoute } from "@tanstack/react-router";
import { PrintShell, usePrintPatient } from "@/components/PrintSheet";
import {
  NURSING_CARE_PLAN_TEMPLATE,
  NursingCarePlanTemplateContent,
} from "@/components/print-content";

export const Route = createFileRoute("/print/$patientId/careplan")({
  head: () => ({
    meta: [
      { title: "Nursing Care Plan — Ward 39" },
      { name: "description", content: "Print the MOH NURS. 6B nursing care plan form for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CarePlanPrint,
});

function CarePlanPrint() {
  const { id, patient } = usePrintPatient();

  return (
    <PrintShell
      title="Nursing Care Plan"
      patient={patient}
      landscape
      formKey="careplan"
      template={NURSING_CARE_PLAN_TEMPLATE}
    >
      {patient ? <NursingCarePlanTemplateContent patient={patient} id={id} /> : null}
    </PrintShell>
  );
}
