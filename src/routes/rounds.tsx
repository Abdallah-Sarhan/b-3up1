import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Printer, Save } from "lucide-react";
import { createCloudRecord, updateCloudRecord } from "@/lib/cloud-direct";
import { useCloudFilteredRecords } from "@/hooks/use-cloud-filtered-records";
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
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dirtyNotes, setDirtyNotes] = useState<Record<string, boolean>>({});
  const notesRef = useRef(notes);
  const dirtyRef = useRef(dirtyNotes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { dirtyRef.current = dirtyNotes; }, [dirtyNotes]);

  useEffect(() => {
    setNotes({});
    setDirtyNotes({});
  }, [date]);

  const { records: entries, refresh, error: loadError } = useCloudFilteredRecords("rounds", "date", date);

  const rows = useMemo(
    () =>
      (patients ?? [])
        .slice()
        .sort((a, b) => folderKey(a.folderNo) - folderKey(b.folderNo)),
    [patients],
  );

  // Hydrate once per cloud-version change without wiping unsaved typing.
  useEffect(() => {
    if (!entries) return;
    const map: Record<string, string> = {};
    for (const e of entries) if (e.patientId) map[e.patientId] = String(e["findings"] ?? "");
    setNotes((current) => {
      const next = { ...map };
      for (const [idText, isDirty] of Object.entries(dirtyRef.current)) {
        const id = idText;
        if (isDirty) next[id] = notesRef.current[id] ?? current[id] ?? "";
      }
      return next;
    });
  }, [entries, date]);

  async function saveNote(patientId: string) {
    const note = notesRef.current[patientId] ?? "";
    const existing = (entries ?? []).find((e) => e.patientId === patientId);
    try {
      if (existing) {
        await updateCloudRecord("rounds", existing.id, patientId, { findings: note }, existing.version);
      } else {
        await createCloudRecord("rounds", patientId, {
          date, doctor: "", findings: note, orders: "", nurse: "",
        });
      }
      await refresh();
      setDirtyNotes((prev) => ({ ...prev, [patientId]: false }));
      toast.success(t("savedOk"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ ملاحظة الراوند في السحابة.");
    }
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
        {loadError ? <p role="alert" className="px-4 pt-3 text-sm text-destructive">{loadError}</p> : null}
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
                      value={notes[p.id] ?? ""}
                      onChange={(e) =>
                        {
                          setNotes((prev) => ({ ...prev, [p.id]: e.target.value }));
                          setDirtyNotes((prev) => ({ ...prev, [p.id]: true }));
                        }
                      }
                      onBlur={() => saveNote(p.id)}
                    />
                    <div className="mt-1 print:hidden">
                      <Button size="sm" variant="ghost" onClick={() => saveNote(p.id)}>
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
