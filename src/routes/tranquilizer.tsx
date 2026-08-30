import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { db, type MedCategory, type MedEntry } from "@/lib/db";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/tranquilizer")({
  head: () => ({
    meta: [
      { title: "المهدئات الكبرى والأدوية المراقبة — جناح 39" },
      {
        name: "description",
        content:
          "Major tranquilizer and control medication register for Ward 39, printable as the weekly M/E/N administration sheet.",
      },
      { property: "og:title", content: "Major Tranquilizer & Control Drugs — Ward 39" },
      {
        property: "og:description",
        content: "Weekly major tranquilizer and control drugs administration sheet for Ward 39.",
      },
    ],
  }),
  component: MedsPage,
});

const DAYS = ["SUN", "MON", "TUE", "WED", "THURS", "FRI", "SAT"];
const SLOTS = ["M", "E", "N"];

type Group = { drug: string; dose: string; rxNo: string; rows: MedEntry[] };

function groupOf(list: MedEntry[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of list) {
    const key = `${e.drug.trim().toUpperCase()}|${e.dose.trim().toUpperCase()}`;
    let g = map.get(key);
    if (!g) {
      g = { drug: e.drug.trim(), dose: e.dose.trim(), rxNo: e.rxNo || "", rows: [] };
      map.set(key, g);
    }
    if (!g.rxNo && e.rxNo) g.rxNo = e.rxNo;
    if (e.patient.trim()) g.rows.push(e);
  }
  return [...map.values()];
}

function MedsPage() {
  const [category, setCategory] = useState<MedCategory>("major");
  const patients = useActivePatients();
  const [form, setForm] = useState({ drug: "", patient: "", dose: "", duration: "" });
  const [fontSize, setFontSize] = useState(9);

  const list = useLiveQuery(
    () => db.meds.where("category").equals(category).sortBy("createdAt"),
    [category],
  );
  const groups = useMemo(() => groupOf(list ?? []), [list]);
  const isControl = category === "control";

  async function add() {
    if (!form.drug.trim()) return;
    await db.meds.add({
      category,
      drug: form.drug.trim(),
      dose: form.dose.trim(),
      rxNo: "",
      patient: form.patient.trim(),
      duration: form.duration.trim(),
      createdAt: Date.now(),
    });
    setForm({ ...form, patient: "", duration: "" });
    toast.success("تمت الإضافة");
  }

  async function addPatientTo(g: Group) {
    await db.meds.add({
      category,
      drug: g.drug,
      dose: g.dose,
      rxNo: g.rxNo,
      patient: "",
      duration: "",
      createdAt: Date.now(),
    });
  }

  const upd = (id: number, patch: Partial<MedEntry>) => db.meds.update(id, patch);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">المهدئات الكبرى والأدوية المراقبة</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          طباعة
        </Button>
      </div>

      {/* category switch */}
      <div className="flex gap-2 print:hidden">
        {(
          [
            ["major", "MAJOR TRANQUILIZER"],
            ["control", "CONTROL MEDICATIONS"],
          ] as Array<[MedCategory, string]>
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={category === key ? "default" : "outline"}
            onClick={() => setCategory(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card className="print:hidden">
        <CardHeader title="إضافة دواء / مريض" />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-4">
          <Field label="الدواء">
            <Input
              list="med-drugs"
              value={form.drug}
              onChange={(e) => setForm({ ...form, drug: e.target.value })}
            />
            <datalist id="med-drugs">
              {groups.map((g) => (
                <option key={`${g.drug}|${g.dose}`} value={g.drug} />
              ))}
            </datalist>
          </Field>
          <Field label="المريض">
            <Input
              list="med-patients"
              value={form.patient}
              onChange={(e) => setForm({ ...form, patient: e.target.value })}
            />
            <datalist id="med-patients">
              {(patients ?? []).map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field label="الجرعة (مثال 5MG)">
            <Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
          </Field>
          <Field label="المدة / النظام (مثال 1-0-1)">
            <Input
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-4">
            <Button onClick={add} disabled={!form.drug.trim()}>
              <Plus />
              إضافة
            </Button>
          </div>
        </div>
      </Card>

      {/* editable table */}
      <Card className="overflow-x-auto print:hidden">
        <CardHeader title={isControl ? "CONTROL MEDICATIONS" : "MAJOR TRANQUILIZER"} />
        <div className="space-y-4 px-5 py-4">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">لا توجد بيانات</p>
          ) : null}
          {groups.map((g) => (
            <div key={`${g.drug}|${g.dose}`} className="rounded-md border border-border">
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/50 px-3 py-2">
                <span className="font-bold">{g.drug}</span>
                <span className="text-sm text-muted-foreground">{g.dose}</span>
                {isControl ? (
                  <Input
                    className="h-8 w-28"
                    placeholder="Rx No."
                    defaultValue={g.rxNo}
                    onBlur={(e) => {
                      const v = e.target.value;
                      g.rows.forEach((r) => r.id && upd(r.id, { rxNo: v }));
                    }}
                  />
                ) : null}
                <Button size="sm" variant="outline" className="ms-auto" onClick={() => addPatientTo(g)}>
                  <Plus />
                  مريض
                </Button>
              </div>
              <div className="divide-y divide-border/60">
                {g.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <Input
                      className="h-8 flex-1 min-w-52"
                      list="med-patients"
                      defaultValue={r.patient}
                      onBlur={(e) => r.id && upd(r.id, { patient: e.target.value })}
                    />
                    <Input
                      className="h-8 w-28"
                      defaultValue={r.duration}
                      onBlur={(e) => r.id && upd(r.id, { duration: e.target.value })}
                    />
                    <Button variant="ghost" size="sm" onClick={() => r.id && db.meds.delete(r.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {g.rows.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">لا يوجد مرضى</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-center gap-2 print:hidden">
        <span className="text-sm text-muted-foreground">حجم خط الطباعة</span>
        <Input
          type="number"
          min={6}
          max={16}
          className="h-8 w-20"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value) || 9)}
        />
      </div>

      {/* printable sheet */}
      <PrintSheet groups={groups} isControl={isControl} fontSize={fontSize} />
    </div>
  );
}

function PrintSheet({
  groups,
  isControl,
  fontSize,
}: {
  groups: Group[];
  isControl: boolean;
  fontSize: number;
}) {
  const cellCount = DAYS.length * SLOTS.length;
  const blank = Array.from({ length: cellCount });
  const spare = 2;

  return (
    <div className="mx-auto w-full overflow-x-auto bg-white p-3 text-black shadow-md print:p-0 print:shadow-none">
      <style>{`@media print { @page { size: A4 landscape; margin: 6mm; } }`}</style>
      <table
        dir="ltr"
        className="w-full min-w-[1000px] border-collapse border border-black"
        style={{ fontSize: `${fontSize}px`, fontFamily: "'Times New Roman', Times, serif" }}
      >
        <thead>
          {isControl ? (
            <tr>
              <th className="border border-black px-1 py-0.5 text-center font-bold" colSpan={3 + cellCount}>
                CONTROL MEDICATIONS
              </th>
            </tr>
          ) : null}
          <tr>
            <th className="border border-black px-1 py-0.5 text-left" rowSpan={2} style={{ width: "18%" }}>
              {isControl ? "CONTROL MEDICATIONS" : "MEDICATIONS"}
            </th>
            <th className="border border-black px-1 py-0.5 text-center" rowSpan={2} style={{ width: "7%" }}>
              DOSE
            </th>
            {isControl ? (
              <th className="border border-black px-1 py-0.5 text-center" rowSpan={2} style={{ width: "6%" }}>
                Rx No.
              </th>
            ) : null}
            {DAYS.map((d) => (
              <th key={d} className="border border-black px-1 py-0.5 text-center font-bold" colSpan={3}>
                {d}
              </th>
            ))}
          </tr>
          <tr>
            {DAYS.flatMap((d) =>
              SLOTS.map((s) => (
                <th key={`${d}${s}`} className="border border-black px-1 py-0.5 text-center font-bold">
                  {s}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={`${g.drug}|${g.dose}`}>
              <tr className="font-bold">
                <td className="border border-black px-1 py-0.5">{g.drug.toUpperCase()}</td>
                <td className="border border-black px-1 py-0.5 text-center">{g.dose.toUpperCase()}</td>
                {isControl ? <td className="border border-black px-1 py-0.5 text-center">{g.rxNo}</td> : null}
                {blank.map((_, i) => (
                  <td key={i} className="border border-black px-1 py-0.5" />
                ))}
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <td className="border border-black px-1 py-0.5">{r.patient.toUpperCase()}</td>
                  <td className="border border-black px-1 py-0.5 text-center font-semibold">{r.duration}</td>
                  {isControl ? <td className="border border-black px-1 py-0.5" /> : null}
                  {blank.map((_, i) => (
                    <td key={i} className="border border-black px-1 py-0.5" />
                  ))}
                </tr>
              ))}
              {Array.from({ length: spare }, (_, k) => (
                <tr key={`${g.drug}-s${k}`}>
                  <td className="border border-black px-1 py-0.5">&nbsp;</td>
                  <td className="border border-black px-1 py-0.5" />
                  {isControl ? <td className="border border-black px-1 py-0.5" /> : null}
                  {blank.map((_, i) => (
                    <td key={i} className="border border-black px-1 py-0.5" />
                  ))}
                </tr>
              ))}
              <tr key={`${g.drug}-t`} className="bg-neutral-200 font-bold italic">
                <td className="border border-black px-1 py-0.5">TOTAL</td>
                <td className="border border-black px-1 py-0.5" />
                {isControl ? <td className="border border-black px-1 py-0.5" /> : null}
                {blank.map((_, i) => (
                  <td key={i} className="border border-black px-1 py-0.5" />
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
