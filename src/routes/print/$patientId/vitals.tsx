import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type VitalEntry } from "@/lib/db";
import { KcmhHeader, PrintShell, usePrintPatient } from "@/components/PrintSheet";

export const Route = createFileRoute("/print/$patientId/vitals")({
  head: () => ({
    meta: [
      { title: "Vital Signs — Ward 39" },
      { name: "description", content: "Printable vital signs sheet for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VitalsPrint,
});

const COLS = ["DATE", "TIME", "BP", "PULSE", "RESP", "TEMP", "SPO2"] as const;
const ROWS_PER_BLOCK = 14;

function VitalsPrint() {
  const { id, patient } = usePrintPatient();
  const entries = useLiveQuery(
    () => db.vitals.where("patientId").equals(id).sortBy("date"),
    [id],
  );

  // Latest entries, oldest first, split into two column blocks like the paper sheet.
  const latest = (entries ?? []).slice(-ROWS_PER_BLOCK * 2);
  const left = latest.slice(0, ROWS_PER_BLOCK);
  const right = latest.slice(ROWS_PER_BLOCK);
  const lastWeight = [...(entries ?? [])].reverse().find((e) => e.weight)?.weight ?? "";

  return (
    <PrintShell title="Vital Signs" patient={patient}>
      {patient && (
        <>
          <KcmhHeader right="VITAL SIGNS" />
          <table className="mb-2 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="px-1 py-1"><b>PATIENT'S NAME:</b> {patient.name}</td>
                <td className="px-1 py-1"><b>DOA:</b> {patient.doa || "—"}</td>
                <td className="px-1 py-1"><b>FILE NO:</b> {patient.fileNo || "—"}</td>
                <td className="px-1 py-1"><b>TR DOCTOR:</b> {patient.doctor || "—"}</td>
                <td className="px-1 py-1"><b>AGE:</b> {patient.age || "—"}</td>
                <td className="px-1 py-1"><b>SEX:</b> {patient.sex || "—"}</td>
              </tr>
            </tbody>
          </table>
          <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                {[...COLS, ...COLS].map((c, i) => (
                  <th key={i} className="border border-black bg-neutral-100 px-1 py-1 text-[10px]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS_PER_BLOCK }, (_, r) => (
                <tr key={r}>
                  <VitalRow e={left[r]} />
                  <VitalRow e={right[r]} />
                </tr>
              ))}
              <tr>
                <td className="border border-black px-1 py-1 font-bold">DATE</td>
                <td colSpan={5} className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1 font-bold">WEIGHT</td>
                <td className="border border-black px-1 py-1 font-bold">DATE</td>
                <td colSpan={5} className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1 font-bold">WEIGHT</td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-1">{left[0]?.date ?? ""}</td>
                <td colSpan={5} className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1">{lastWeight}</td>
                <td className="border border-black px-1 py-1"></td>
                <td colSpan={5} className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-neutral-600">
            Entries shown: latest {latest.length} readings. Add readings from the patient file screen.
          </p>
        </>
      )}
    </PrintShell>
  );
}

function VitalRow({ e }: { e: VitalEntry | undefined }) {
  return (
    <>
      <td className="h-6 border border-black px-1 py-1">{e?.date ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.time ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.bp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.pulse ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.resp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.temp ?? ""}</td>
      <td className="border border-black px-1 py-1">{e?.spo2 ?? ""}</td>
    </>
  );
}
