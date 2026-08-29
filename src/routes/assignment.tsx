import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Printer, Save, Shuffle } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";
import logoMoh from "@/assets/logo-moh.png.asset.json";

export const Route = createFileRoute("/assignment")({
  head: () => ({
    meta: [
      { title: "توزيعة التمريض — جناح 39 | Group Leader's Assignment Plan" },
      {
        name: "description",
        content:
          "Build the Ward 39 group leader's assignment plan: pick the shift, number of nurses and team leader, then print an A4 landscape sheet.",
      },
      { property: "og:title", content: "Group Leader's Assignment Plan — Ward 39" },
      {
        property: "og:description",
        content: "Distribute Ward 39 patients evenly across nurses per shift and print the assignment sheet.",
      },
    ],
  }),
  component: AssignmentPage,
});

const SHIFTS = [
  { key: "morning", label: "7AM-2PM" },
  { key: "evening", label: "2PM-10PM" },
  { key: "night", label: "10PM-7AM" },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y ? `${Number(d)}-${Number(m)}-${y.slice(2)}` : iso;
}

/** Split patients into `count` groups of as-equal-as-possible size. */
function distribute<T>(items: T[], count: number): T[][] {
  const groups: T[][] = Array.from({ length: count }, () => []);
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  let i = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups[g] = items.slice(i, i + size);
    i += size;
  }
  return groups;
}

function AssignmentPage() {
  const { t, lang } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState<string>("morning");
  const [leader, setLeader] = useState("");
  const [nurseCount, setNurseCount] = useState(6);
  const [nurses, setNurses] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
  const [special, setSpecial] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    setNurses((prev) => Array.from({ length: nurseCount }, (_, i) => prev[i] ?? ""));
    setSpecial((prev) => Array.from({ length: nurseCount }, (_, i) => prev[i] ?? ""));
  }, [nurseCount]);

  const list = useMemo(() => {
    const arr = [...(patients ?? [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (seed > 0) {
      // simple deterministic rotation so re-shuffling changes who gets whom
      const k = seed % Math.max(arr.length, 1);
      return [...arr.slice(k), ...arr.slice(0, k)];
    }
    return arr;
  }, [patients, seed]);

  const groups = useMemo(() => distribute(list, Math.max(nurseCount, 1)), [list, nurseCount]);
  const shiftLabel = SHIFTS.find((s) => s.key === shift)?.label ?? "";

  async function save() {
    const existing = await db.assignments.where("date").equals(date).toArray();
    await Promise.all(
      existing.filter((e) => e.shift === shift && e.id != null).map((e) => db.assignments.delete(e.id!)),
    );
    const rows = groups.flatMap((g, i) =>
      g
        .filter((p) => p.id != null)
        .map((p) => ({
          patientId: p.id!,
          date,
          shift,
          nurse: nurses[i]?.trim() || `Nurse ${i + 1}`,
          remarks: special[i]?.trim() ?? "",
        })),
    );
    if (rows.length) await db.assignments.bulkAdd(rows);
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">{t("nurseAssignment")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSeed((s) => s + 1)}>
            <Shuffle />
            {lang === "ar" ? "إعادة التوزيع" : "Redistribute"}
          </Button>
          <Button variant="outline" onClick={save}>
            <Save />
            {t("save")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader
          title={lang === "ar" ? "إعدادات التوزيعة" : "Assignment settings"}
          subtitle={`${list.length} ${lang === "ar" ? "مريض" : "patients"}`}
        />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("shift")}>
            <Select value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={lang === "ar" ? "عدد التمريض" : "Number of nurses"}>
            <Input
              type="number"
              min={1}
              max={10}
              value={nurseCount}
              onChange={(e) => setNurseCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
          <Field label={lang === "ar" ? "قائد الفريق" : "Team leader"}>
            <Input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="S/N ..." />
          </Field>

          {nurses.map((n, i) => (
            <Field key={i} label={`${lang === "ar" ? "ممرض" : "Nurse"} ${i + 1}`}>
              <Input
                value={n}
                placeholder="S/N ..."
                onChange={(e) =>
                  setNurses((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
              <Input
                className="mt-1"
                value={special[i] ?? ""}
                placeholder={lang === "ar" ? "مهمة خاصة" : "Special assignment"}
                onChange={(e) =>
                  setSpecial((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      {/* ---------- Printable sheet ---------- */}
      <div
        dir="ltr"
        className="mx-auto w-full max-w-[277mm] bg-white p-3 text-black shadow-md print:max-w-none print:p-0 print:shadow-none"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        <div className="flex items-stretch gap-1">
          <div className="flex-1 border-2 border-black">
            {/* logo + date band */}
            <div className="flex items-center justify-between px-2 py-1">
              <img src={logoMoh.url} alt="Ministry of Health" className="h-14 w-auto" />
              <div className="text-sm font-bold">DATE: {formatDate(date)}</div>
            </div>

            <div className="flex border-y border-black text-[11px] font-bold">
              <div className="flex-1 border-e border-black px-1 py-0.5">MINISTRY OF HEALTH</div>
              <div className="flex-1 border-e border-black px-1 py-0.5 text-center">LEADER: {leader || "\u2014"}</div>
              <div className="flex-1 border-e border-black px-1 py-0.5 text-center">WARD: 39</div>
              <div className="flex-1 px-1 py-0.5 text-center">SHIFT {shiftLabel}</div>
            </div>

            <table className="w-full table-fixed border-collapse text-[11px]">
              <tbody>
                <tr className="font-bold">
                  {nurses.map((n, i) => (
                    <th key={i} className="border border-black px-1 py-0.5 text-center">
                      {n || `S/N ${i + 1}`}
                    </th>
                  ))}
                </tr>
                <tr className="font-bold">
                  {nurses.map((_, i) => (
                    <th key={i} className="border border-black px-1 py-0.5 text-center">
                      PATIENT
                    </th>
                  ))}
                </tr>
                <tr>
                  {groups.map((g, i) => (
                    <td key={i} className="h-[105mm] border border-black align-top px-1 py-1">
                      {g.map((p) => (
                        <div key={p.id} className="py-[2px] text-center uppercase leading-tight">
                          {p.name || `FILE ${p.fileNo}`}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
                <tr>
                  {special.map((s, i) => (
                    <td key={i} className="h-[35mm] border border-black align-top px-1 py-1 text-center uppercase">
                      {i === 0 ? (
                        <div className="text-start text-[10px] font-bold">SPECIAL ASSIGNMENT</div>
                      ) : null}
                      <div className="leading-tight">{s}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* vertical side label */}
          <div className="flex w-[14mm] items-center justify-center border-2 border-black">
            <div
              className="whitespace-nowrap text-[11px] font-bold tracking-widest"
              style={{ writingMode: "vertical-rl" }}
            >
              GROUP LEADER'S ASSIGNMENT PLAN&nbsp;&nbsp;&nbsp;NURS 8 B
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
