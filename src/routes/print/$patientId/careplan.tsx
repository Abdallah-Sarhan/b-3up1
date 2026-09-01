import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MohFormHeader } from "@/components/print-content";
import { PrintShell, usePrintPatient } from "@/components/PrintSheet";

export const Route = createFileRoute("/print/$patientId/careplan")({
  head: () => ({
    meta: [
      { title: "Nursing Care Plan — Ward 39" },
      { name: "description", content: "Printable nursing care plan for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CarePlanPrint,
});

function CarePlanPrint() {
  const { id, patient } = usePrintPatient();
  const entries = useLiveQuery(
    () => db.careplan.where("patientId").equals(id).sortBy("dateIdentified"),
    [id],
  );
  const list = entries ?? [];

  return (
    <PrintShell title="Nursing Care Plan" patient={patient}>
      {patient && (
        <>
          <div className="mb-1 text-center text-sm font-bold">NURSING CARE PLAN — NURS.6 B</div>
          <MohFormHeader patient={patient} />

          <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="w-[10%] border border-black bg-neutral-100 px-1 py-1">Date Pro. Identified</th>
                <th className="w-[22%] border border-black bg-neutral-100 px-1 py-1">Patient's Problem Actual/Potential</th>
                <th className="w-[22%] border border-black bg-neutral-100 px-1 py-1">Objective (Expected Patient Outcome)</th>
                <th className="w-[26%] border border-black bg-neutral-100 px-1 py-1">Nursing Intervention</th>
                <th className="w-[10%] border border-black bg-neutral-100 px-1 py-1">Date Pro Resolved</th>
                <th className="w-[10%] border border-black bg-neutral-100 px-1 py-1">Nurse Sign</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td className="h-24 border border-black px-1 py-1" colSpan={6}></td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.id}>
                    <td className="border border-black px-1 py-1 align-top">{c.dateIdentified}</td>
                    <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.problem}</td>
                    <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.objective}</td>
                    <td className="border border-black px-1 py-1 align-top whitespace-pre-wrap">{c.intervention}</td>
                    <td className="border border-black px-1 py-1 align-top">{c.dateResolved}</td>
                    <td className="border border-black px-1 py-1 align-top">{c.nurseSign}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mt-3 text-[10px]">
            <p>(Specify potential problem with pt)</p>
            <p>Pro. = Problem &nbsp;|&nbsp; Rsvd. = Resolved</p>
            <p className="mt-2 font-bold">HEALTH TEACHING PLAN:-</p>
            <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
            <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
            <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
          </div>
        </>
      )}
    </PrintShell>
  );
}
