import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui-kit";
import { PatientPicker, useActivePatients } from "@/components/PatientPicker";

export const Route = createFileRoute("/rounds")({
  head: () => ({
    meta: [
      { title: "الراوند اليومي — جناح 39 | Daily Round — Ward 39" },
      { name: "description", content: "Record and review the daily medical round for Ward 39 patients." },
      { property: "og:title", content: "Daily Round — Ward 39" },
      { property: "og:description", content: "Record and review the daily medical round for Ward 39 patients." },
    ],
  }),
  component: RoundsPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function RoundsPage() {
  const { t } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [patientId, setPatientId] = useState<number | "">("");
  const [doctor, setDoctor] = useState("");
  const [nurse, setNurse] = useState("");
  const [findings, setFindings] = useState("");
  const [orders, setOrders] = useState("");

  const entries = useLiveQuery(() => db.rounds.where("date").equals(date).toArray(), [date]);
  const nameOf = (id: number) => {
    const p = patients?.find((x) => x.id === id);
    return p ? p.name || `${t("fileNo")} ${p.fileNo}` : `#${id}`;
  };

  async function add() {
    if (!patientId) return;
    await db.rounds.add({ patientId, date, doctor, findings, orders, nurse });
    setFindings("");
    setOrders("");
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("rounds")}</h1>
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
          <Field label={t("selectPatient")}>
            <PatientPicker value={patientId} onChange={setPatientId} patients={patients} />
          </Field>
          <Field label={t("doctor")}>
            <Input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
          </Field>
          <Field label={t("nurse")}>
            <Input value={nurse} onChange={(e) => setNurse(e.target.value)} />
          </Field>
          <Field label={t("findings")} className="sm:col-span-2">
            <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} />
          </Field>
          <Field label={t("orders")} className="sm:col-span-2">
            <Textarea value={orders} onChange={(e) => setOrders(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={add} disabled={!patientId}>
              <Plus />
              {t("add")}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`${t("rounds")} — ${date}`} subtitle={String(entries?.length ?? 0)} />
        <ul className="divide-y divide-border">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="space-y-1">
                <p className="font-medium">{nameOf(e.patientId)}</p>
                <p className="text-sm text-muted-foreground">{e.findings}</p>
                <p className="text-sm">{e.orders}</p>
                <p className="text-xs text-muted-foreground">
                  {e.doctor} {e.nurse ? `· ${e.nurse}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => db.rounds.delete(e.id!)}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {(entries?.length ?? 0) === 0 ? (
            <li className="px-5 py-8 text-center text-muted-foreground">{t("noEntries")}</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
