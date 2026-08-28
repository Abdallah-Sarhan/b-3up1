import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type SbarEntry } from "@/lib/db";
import { PrintShell, usePrintPatient } from "@/components/PrintSheet";
import logoKcmh from "@/assets/logo-kcmh.png.asset.json";
import logoMoh from "@/assets/logo-moh.png.asset.json";

export const Route = createFileRoute("/print/$patientId/sbar")({
  head: () => ({
    meta: [
      { title: "Hand Over Sheet (SBAR) — Ward 39" },
      { name: "description", content: "Printable A4 landscape SBAR hand over sheet for Ward 39." },
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
    <PrintShell title="Hand Over Sheet (SBAR)" patient={patient} landscape>
      {patient && (
        <>
          <div className="mx-auto mb-4 flex max-w-xs items-center gap-2 print:hidden">
            <label className="font-sans text-sm font-medium">Date:</label>
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

          <div className="border-2 border-black">
            {/* Logo + title band */}
            <div className="flex items-center justify-between px-2 py-1">
              <img src={logoKcmh.url} alt="Kuwait Center for Mental Health" className="h-14 w-auto" />
              <h1 className="text-lg font-bold underline">Hand Over Sheet(SBAR)</h1>
              <img src={logoMoh.url} alt="Ministry of Health" className="h-14 w-auto" />
            </div>

            {/* Header info grid */}
            <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
              <tbody>
                <tr>
                  <td rowSpan={2} className="w-[7%] border border-black px-1 py-1 text-center align-middle font-bold">
                    DATE
                    <div className="font-normal">{date}</div>
                  </td>
                  <HCell label="Name:" value={patient.name} width="22%" />
                  <HCell label="FILE#" value={patient.fileNo} width="17%" />
                  <HCell label="DOB/AGE:" value={[patient.dob, patient.age].filter(Boolean).join(" / ")} width="19%" />
                  <td className="w-[27%] border border-black px-1 py-1 text-center font-bold">Diagnosis</td>
                  <td rowSpan={2} className="w-[8%] border border-black px-1 py-1 text-center align-middle font-bold">
                    Ward:39
                  </td>
                </tr>
                <tr>
                  <HCell label="CID" value={patient.cid} />
                  <HCell label="D.O.A:" value={patient.doa} />
                  <HCell label="Nationality" value={patient.nationality} />
                  <td className="border border-black px-1 py-1 text-center font-bold">
                    {patient.diagnosis?.toUpperCase() || "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* SBAR grid */}
            <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th className="w-[7%] border border-black px-1 py-0.5">Shift</th>
                  <th className="w-[21%] border border-black px-1 py-0.5">Situation</th>
                  <th className="w-[18%] border border-black px-1 py-0.5">Background</th>
                  <th className="w-[21%] border border-black px-1 py-0.5">Assessment</th>
                  <th className="w-[24%] border border-black px-1 py-0.5">Recommendation</th>
                  <th className="w-[9%] border border-black px-1 py-0.5">Signature</th>
                </tr>
              </thead>
              <tbody>
                {SHIFT_ROWS.map(({ key, label }) => {
                  const e = byShift(key);
                  return (
                    <tr key={key}>
                      <td className="h-[52mm] border border-black px-1 py-1 text-center align-middle text-[11px] font-bold whitespace-pre-line">
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
          </div>
        </>
      )}
    </PrintShell>
  );
}

function HCell({ label, value, width }: { label: string; value: string; width?: string }) {
  return (
    <td className="border border-black px-1 py-1 align-top" style={width ? { width } : undefined}>
      <span className="font-bold">{label} </span>
      <span>{value || "—"}</span>
    </td>
  );
}

function BCell({ children }: { children: string | undefined }) {
  return (
    <td className="border border-black px-1.5 py-1 align-top text-[11px] whitespace-pre-wrap">{children ?? ""}</td>
  );
}
