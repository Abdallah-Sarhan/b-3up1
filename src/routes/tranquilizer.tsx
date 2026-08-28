import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/tranquilizer")({
  head: () => ({
    meta: [
      { title: "المهدئات الكبرى والمراقبة — جناح 39 | Major Tranquilizer Control" },
      { name: "description", content: "Major tranquilizer administration and control register for Ward 39 patients." },
      { property: "og:title", content: "Major Tranquilizer & Control — Ward 39" },
      { property: "og:description", content: "Administration and monitoring register for major tranquilizers in Ward 39." },
    ],
  }),
  component: TranqPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toTimeString().slice(0, 5);

function TranqPage() {
  const { t } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [form, setForm] = useState({
    patientId: "" as number | "",
    time: now(),
    drug: "",
    dose: "",
    route: "IM",
    indication: "",
    givenBy: "",
    effect: "",
  });

  const entries = useLiveQuery(() => db.tranq.where("date").equals(date).toArray(), [date]);
  const nameOf = (id: number) => {
    const p = patients?.find((x) => x.id === id);
    return p ? p.name || `${t("fileNo")} ${p.fileNo}` : `#${id}`;
  };

  async function add() {
    if (!form.patientId || !form.drug) return;
    await db.tranq.add({ ...form, patientId: form.patientId as number, date });
    setForm({ ...form, drug: "", dose: "", indication: "", effect: "" });
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("tranq")}</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
      </div>

      <Card>
        <CardHeader title={t("add")} />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("time")}>
            <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
          <Field label={t("selectPatient")}>
            <PatientPicker
              value={form.patientId}
              onChange={(id) => setForm({ ...form, patientId: id })}
              patients={patients}
            />
          </Field>
          <Field label={t("drug")}>
            <Input value={form.drug} onChange={(e) => setForm({ ...form, drug: e.target.value })} />
          </Field>
          <Field label={t("dose")}>
            <Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
          </Field>
          <Field label={t("route")}>
            <Select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
              <option value="IM">IM</option>
              <option value="IV">IV</option>
              <option value="PO">PO</option>
              <option value="SC">SC</option>
            </Select>
          </Field>
          <Field label={t("indication")}>
            <Input value={form.indication} onChange={(e) => setForm({ ...form, indication: e.target.value })} />
          </Field>
          <Field label={t("givenBy")}>
            <Input value={form.givenBy} onChange={(e) => setForm({ ...form, givenBy: e.target.value })} />
          </Field>
          <Field label={t("effect")} className="sm:col-span-3">
            <Textarea value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })} />
          </Field>
          <div className="sm:col-span-3">
            <Button onClick={add} disabled={!form.patientId || !form.drug}>
              <Plus />
              {t("add")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader title={`${t("tranq")} — ${date}`} subtitle={String(entries?.length ?? 0)} />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[t("time"), t("name"), t("drug"), t("dose"), t("route"), t("givenBy"), t("effect"), ""].map((h, i) => (
                <th key={i} className="px-3 py-2 text-start text-xs font-semibold uppercase text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">{e.time}</td>
                <td className="px-3 py-2">{nameOf(e.patientId)}</td>
                <td className="px-3 py-2">{e.drug}</td>
                <td className="px-3 py-2">{e.dose}</td>
                <td className="px-3 py-2">{e.route}</td>
                <td className="px-3 py-2">{e.givenBy}</td>
                <td className="px-3 py-2">{e.effect}</td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => db.tranq.delete(e.id!)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
            {(entries?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  {t("noEntries")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
