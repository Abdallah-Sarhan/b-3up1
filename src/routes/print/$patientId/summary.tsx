import { createFileRoute } from "@tanstack/react-router";
import { KcmhHeader, PatientHeaderGrid, PrintShell, PrintTitle, usePrintPatient } from "@/components/PrintSheet";

export const Route = createFileRoute("/print/$patientId/summary")({
  head: () => ({
    meta: [
      { title: "Patient Data Sheet — Ward 39" },
      { name: "description", content: "Printable patient data sheet for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SummaryPrint,
});

function SummaryPrint() {
  const { patient } = usePrintPatient();
  return (
    <PrintShell title="Patient Data Sheet" patient={patient}>
      {patient && (
        <>
          <KcmhHeader right="PATIENT DATA SHEET" />
          <PrintTitle>Patient Information</PrintTitle>
          <PatientHeaderGrid patient={patient} />
          {patient.notes ? (
            <div className="mb-6">
              <div className="text-sm font-bold">Notes:</div>
              <div className="mt-1 min-h-16 whitespace-pre-wrap border border-black p-2 text-sm">{patient.notes}</div>
            </div>
          ) : null}
          <div className="mt-16 flex justify-between text-sm">
            <div className="text-center">
              <div className="mb-1 border-t border-black px-8 pt-1">Nurse Signature</div>
            </div>
            <div className="text-center">
              <div className="mb-1 border-t border-black px-8 pt-1">Date</div>
            </div>
          </div>
        </>
      )}
    </PrintShell>
  );
}
