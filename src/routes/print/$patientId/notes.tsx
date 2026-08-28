import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { PrintShell, usePrintPatient } from "@/components/PrintSheet";

export const Route = createFileRoute("/print/$patientId/notes")({
  head: () => ({
    meta: [
      { title: "Nurses Notes — Ward 39" },
      { name: "description", content: "Printable nurses notes sheet for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotesPrint,
});

const EMPTY_ROWS = 20;

function NotesPrint() {
  const { id, patient } = usePrintPatient();
  const entries = useLiveQuery(
    () => db.notes.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const list = (entries ?? []).slice(-EMPTY_ROWS);
  const blanks = Math.max(0, EMPTY_ROWS - list.length);

  return (
    <PrintShell title="Nurses Notes" patient={patient}>
      {patient && (
        <>
          <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
            <div className="text-base font-bold">HOSPITAL: KCMH</div>
            <div className="text-sm"><b>HOSPITAL NO:</b> {patient.fileNo}</div>
          </div>

          <table className="mb-2 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-black px-2 py-1"><b>Dept.</b> M</td>
                <td className="border border-black px-2 py-1"><b>Unit</b> 4</td>
                <td className="border border-black px-2 py-1"><b>Ward</b> 39</td>
                <td className="border border-black px-2 py-1"><b>Room</b> {patient.room || "—"}</td>
                <td className="border border-black px-2 py-1"><b>Bed</b> {patient.bed || "—"}</td>
                <td className="border border-black px-2 py-1"><b>NAME:</b> {patient.name}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1" colSpan={2}><b>Date of Adm.</b> {patient.doa || "—"}</td>
                <td className="border border-black px-2 py-1" colSpan={2}><b>Doctor in Charge:</b> {patient.doctor || "—"}</td>
                <td className="border border-black px-2 py-1"><b>SEX:</b> {patient.sex || "—"}</td>
                <td className="border border-black px-2 py-1"><b>C.I.D:</b> {patient.cid || "—"}</td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1" colSpan={6}><b>Diagnosis:</b> {patient.diagnosis || "—"}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="w-[12%] border border-black bg-neutral-100 px-1 py-1">Date</th>
                <th className="w-[10%] border border-black bg-neutral-100 px-1 py-1">Time</th>
                <th className="border border-black bg-neutral-100 px-1 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id}>
                  <td className="border border-black px-1.5 py-1.5 align-top">{n.date}</td>
                  <td className="border border-black px-1.5 py-1.5 align-top">{n.time}</td>
                  <td className="border border-black px-1.5 py-1.5 align-top whitespace-pre-wrap">{n.note}</td>
                </tr>
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <tr key={`b${i}`}>
                  <td className="h-7 border border-black px-1.5 py-1.5"></td>
                  <td className="border border-black px-1.5 py-1.5"></td>
                  <td className="border border-black px-1.5 py-1.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-end justify-between text-xs">
            <span>(Continue notes overleaf)</span>
            <span>7540 HA 0001462 — نموذج تقرير الممرضات عن حالة المريض</span>
          </div>
        </>
      )}
    </PrintShell>
  );
}
