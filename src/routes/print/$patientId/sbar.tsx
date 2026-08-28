import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type SbarEntry } from "@/lib/db";
import { PrintShell, PrintTitle, usePrintPatient } from "@/components/PrintSheet";

export const Route = createFileRoute("/print/$patientId/sbar")({
  head: () => ({
    meta: [
      { title: "SBAR Handover — Ward 39" },
      { name: "description", content: "Printable SBAR handover form for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SbarPrint,
});

const SHIFT_ROWS: Array<{ key: string; label: string }> = [
  { key: "morning", label: "07:AM\nTO\n02:PM" },
  { key: "evening", label: "02:PM\nTO\n10:PM" },
  { key: "night", label: "10:PM\nTO\n7:AM" },
];

function SbarPrint() {
  const { id, patient } = usePrintPatient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const all = useLiveQuery(() => db.sbar.where("patientId").equals(id).sortBy("date"), [id]);
  const entries = (all ?? []).filter((e) => e.date === date);
  const availableDates = [...new Set((all ?? []).map((e) => e.date))].sort().reverse();

  const byShift = (shift: string): SbarEntry | undefined => entries.find((e) => e.shift === shift);

  return (
    <PrintShell title="SBAR Handover" patient={patient}>
      {patient && (
        <>
          <div className="mx-auto mb-4 flex max-w-xs items-center gap-2 print:hidden">
            <label className="text-sm font-sans font-medium">Date:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input px-2 font-sans text-sm"
              list="sbar-dates"
            />
            <datalist id="sbar-dates">
              {availableDates.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          <PrintTitle>Hand Over</PrintTitle>

          {/* Patient header — mirrors the SBAR sheet header block */}
          <table className="mb-2 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <HCell label="DATE" value={date} />
                <HCell label="Name" value={patient.name} />
                <HCell label="FILE#" value={patient.fileNo} />
                <HCell label="DOB/AGE" value={[patient.dob, patient.age].filter(Boolean).join(" / ")} />
                <HCell label="Diagnosis" value={patient.diagnosis} />
                <HCell label="Ward" value="39" />
              </tr>
              <tr>
                <HCell label="CID" value={patient.cid} />
                <HCell label="D.O.A" value={patient.doa} />
                <HCell label="Nationality" value={patient.nationality} />
                <HCell label="Sex" value={patient.sex} />
                <HCell label="Tr. Doctor" value={patient.doctor} />
                <HCell label="" value="" />
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="w-[10%] border border-black bg-neutral-100 px-1 py-1.5">Shift</th>
                <th className="w-[19%] border border-black bg-neutral-100 px-1 py-1.5">Situation</th>
                <th className="w-[19%] border border-black bg-neutral-100 px-1 py-1.5">Background</th>
                <th className="w-[19%] border border-black bg-neutral-100 px-1 py-1.5">Assessment</th>
                <th className="w-[19%] border border-black bg-neutral-100 px-1 py-1.5">Recommendation</th>
                <th className="w-[14%] border border-black bg-neutral-100 px-1 py-1.5">Signature</th>
              </tr>
            </thead>
            <tbody>
              {SHIFT_ROWS.map(({ key, label }) => {
                const e = byShift(key);
                return (
                  <tr key={key}>
                    <td className="border border-black px-1 py-1 text-center text-xs font-bold whitespace-pre-line align-middle">
                      {label}
                    </td>
                    <BCell>{e?.situation}</BCell>
                    <BCell>{e?.background}</BCell>
                    <BCell>{e?.assessment}</BCell>
                    <BCell>{e?.recommendation}</BCell>
                    <BCell>{e?.signature}</BCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </PrintShell>
  );
}

function HCell({ label, value }: { label: string; value: string }) {
  return (
    <td className="border border-black px-1.5 py-1">
      {label ? <span className="font-bold">{label}: </span> : null}
      {value || (label ? "—" : "")}
    </td>
  );
}

function BCell({ children }: { children: string | undefined }) {
  return (
    <td className="h-28 border border-black px-1.5 py-1 align-top text-xs whitespace-pre-wrap">
      {children ?? ""}
    </td>
  );
}
