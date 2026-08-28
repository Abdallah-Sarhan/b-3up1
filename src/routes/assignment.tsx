import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/assignment")({
  head: () => ({
    meta: [
      { title: "توزيع التمريض — جناح 39 | Nurse Assignment — Ward 39" },
      { name: "description", content: "Assign nurses to Ward 39 patients per shift and print the assignment sheet." },
      { property: "og:title", content: "Nurse Assignment — Ward 39" },
      { property: "og:description", content: "Assign nurses to Ward 39 patients per shift and print the sheet." },
    ],
  }),
  component: AssignmentPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function AssignmentPage() {
  const { t } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState("morning");
  const [patientId, setPatientId] = useState<number | "">("");
  const [nurse, setNurse] = useState("");
  const [remarks, setRemarks] = useState("");

  const entries = useLiveQuery(() => db.assignments.where("date").equals(date).toArray(), [date]);
  const list = (entries ?? []).filter((e) => e.shift === shift);
  const nameOf = (id: number) => {
    const p = patients?.find((x) => x.id === id);
    return p ? p.name || `${t("fileNo")} ${p.fileNo}` : `#${id}`;
  };

  async function add() {
    if (!patientId || !nurse) return;
    await db.assignments.add({ patientId, date, shift, nurse, remarks });
    setPatientId("");
    setRemarks("");
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("nurseAssignment")}</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
      </div>

      <Card>
        <CardHeader title={t("add")} />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("shift")}>
            <Select value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="morning">{t("morningShift")}</option>
              <option value="evening">{t("eveningShift")}</option>
              <option value="night">{t("nightShift")}</option>
            </Select>
          </Field>
          <Field label={t("selectPatient")}>
            <PatientPicker value={patientId} onChange={setPatientId} patients={patients} />
          </Field>
          <Field label={t("nurse")}>
            <Input value={nurse} onChange={(e) => setNurse(e.target.value)} />
          </Field>
          <Field label={t("remarks")} className="sm:col-span-2">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={add} disabled={!patientId || !nurse}>
              <Plus />
              {t("add")}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`${t("nurseAssignment")} — ${date}`} subtitle={String(list.length)} />
        <ul className="divide-y divide-border">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium">{nameOf(e.patientId)}</p>
                <p className="text-xs text-muted-foreground">
                  {e.nurse} {e.remarks ? `· ${e.remarks}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => db.assignments.delete(e.id!)}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {list.length === 0 ? (
            <li className="px-5 py-8 text-center text-muted-foreground">{t("noEntries")}</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
