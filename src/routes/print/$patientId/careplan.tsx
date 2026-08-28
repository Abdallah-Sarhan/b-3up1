import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { STANDARD_PROBLEMS } from "@/lib/careplan-standards";
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
          <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
            <div className="text-base font-bold">HOSPITAL: KCMH</div>
            <div className="text-sm font-bold">NURSING CARE PLAN — NURS.6 B</div>
            <div className="text-sm"><b>HOSPITAL NO:</b> {patient.fileNo}</div>
          </div>

          <table className="mb-2 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-black px-2 py-1"><b>Dept.</b> M</td>
                <td className="border border-black px-2 py-1"><b>Unit</b> 2</td>
                <td className="border border-black px-2 py-1"><b>Ward</b> 39</td>
                <td className="border border-black px-2 py-1"><b>Room</b> {patient.room || "—"}</td>
                <td className="border border-black px-2 py-1"><b>Bed</b> {patient.bed || "—"}</td>
                <td className="border border-black px-2 py-1" colSpan={2}><b>Diagnosis:</b> {patient.diagnosis || "—"}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1" colSpan={3}><b>NAME:</b> {patient.name}</td>
                <td className="border border-black px-2 py-1" colSpan={2}><b>C.I.D. NO:</b> {patient.cid || "—"}</td>
                <td className="border border-black px-2 py-1"><b>AGE:</b> {patient.age || "—"}</td>
                <td className="border border-black px-2 py-1"><b>SEX:</b> {patient.sex || "—"}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1" colSpan={3}><b>Doctor in Charge:</b> {patient.doctor || "—"}</td>
                <td className="border border-black px-2 py-1" colSpan={2}><b>Date of Adm:</b> {patient.doa || "—"}</td>
                <td className="border border-black px-2 py-1" colSpan={2}><b>Marital Status:</b> {patient.maritalStatus || "—"}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="w-[9%] border border-black bg-neutral-100 px-1 py-1">Date Pro. Identified</th>
                <th className="w-[5%] border border-black bg-neutral-100 px-1 py-1">Pro. No</th>
                <th className="w-[20%] border border-black bg-neutral-100 px-1 py-1">Patient's Problem Actual/Potential</th>
                <th className="w-[20%] border border-black bg-neutral-100 px-1 py-1">Objective (Expected Patient Outcome)</th>
                <th className="w-[24%] border border-black bg-neutral-100 px-1 py-1">Nursing Intervention</th>
                <th className="w-[9%] border border-black bg-neutral-100 px-1 py-1">Date Pro Resolved</th>
                <th className="w-[13%] border border-black bg-neutral-100 px-1 py-1">Nurse Sign</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td className="h-24 border border-black px-1 py-1" colSpan={7}></td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.id}>
                    <td className="border border-black px-1 py-1 align-top">{c.dateIdentified}</td>
                    <td className="border border-black px-1 py-1 align-top">{c.problemNo}</td>
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

          <div className="mt-3 flex gap-3 text-[10px]">
            <div className="flex-1">
              <p>(Specify potential problem with pt)</p>
              <p>Pro. = Problem &nbsp;|&nbsp; Rsvd. = Resolved</p>
              <p className="mt-2 font-bold">HEALTH TEACHING PLAN:-</p>
              <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
              <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
              <p className="mt-4 border-b border-dotted border-black">&nbsp;</p>
            </div>
            <div className="w-[38%]">
              <p className="mb-1 font-bold">Standard Problems Reference:</p>
              <ol className="list-decimal space-y-0.5 ps-4">
                {STANDARD_PROBLEMS.map((p) => (
                  <li key={p.no}>{p.problem}</li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </PrintShell>
  );
}
