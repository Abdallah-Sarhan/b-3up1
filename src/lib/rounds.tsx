import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Printer, Save } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui-kit";
import { useActivePatients } from "@/components/PatientPicker";

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

const folderKey = (v: string) => {
  const n = parseInt((v || "").replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

function RoundsPage() {
  const { t, lang } = useLang();
  const patients = useActivePatients();
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState<Record<number, string>>({});

  const entries = useLiveQuery(
    () => db.rounds.where("date").equals(date).toArray(),
    [date],
  );

  const rows = useMemo(
    () =>
      (patients ?? [])
        .slice()
        .sort((a, b) => folderKey(a.folderNo) - folderKey(b.folderNo)),
    [patients],
  );

  // Load saved notes for the chosen date.
  useEffect(() => {
    if (!entries) return;
    const map: Record<number, string> = {};
    for (const e of entries) map[e.patientId] = e.findings ?? "";
    setNotes(map);
  }, [entries]);

  async function saveNote(patientId: number) {
    const note = notes[patientId] ?? "";
    const existing = (entries ?? []).find((e) => e.patientId === patientId);
    if (existing?.id != null) {
      await db.rounds.update(existing.id, { findings: note });
    } else {
      await db.rounds.add({ patientId, date, doctor: "", findings: note, orders: "", nurse: "" });
    }
    toast.success(t("savedOk"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold">{t("rounds")}</h1>
        <div className="flex items-end gap-3">
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title={`${t("rounds")} — ${date}`} subtitle={String(rows.length)} />
        <div className="overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th className="p-2 text-start w-12">{t("folderNo")}</th>
                <th className="p-2 text-start">{t("name")}</th>
                <th className="p-2 text-start w-24">{t("fileNo")}</th>
                <th className="p-2 text-start w-40">{t("doctor")}</th>
                <th className="p-2 text-start">{t("diagnosis")}</th>
                <th className="p-2 text-start w-72">
                  {lang === "ar" ? "ملاحظات" : "Notes"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border align-top">
                  <td className="p-2 font-semibold">{p.folderNo}</td>
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{p.fileNo}</td>
                  <td className="p-2">{p.doctor}</td>
                  <td className="p-2">{p.diagnosis}</td>
                  <td className="p-2">
                    <Textarea
                      rows={2}
                      value={notes[p.id!] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [p.id!]: e.target.value }))
                      }
                      onBlur={() => saveNote(p.id!)}
                    />
                    <div className="mt-1 print:hidden">
                      <Button size="sm" variant="ghost" onClick={() => saveNote(p.id!)}>
                        <Save />
                        {t("save")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    {t("noEntries")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
