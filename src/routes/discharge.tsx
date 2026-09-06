import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { LogOut, Search, Undo2 } from "lucide-react";
import { db, dbReady, dischargePatient, readmitPatient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, CardHeader, Input } from "@/components/ui-kit";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/discharge")({
  head: () => ({
    meta: [
      { title: "خروج المرضى — جناح 39 | Discharge — Ward 39" },
      { name: "description", content: "Discharge patients from Ward 39 and review discharged records." },
      { property: "og:title", content: "Discharge — Ward 39" },
      { property: "og:description", content: "Discharge patients from Ward 39 and review discharged records." },
    ],
  }),
  component: DischargePage,
});

function DischargePage() {
  const { t } = useLang();
  const [query, setQuery] = useState("");

  const patients = useLiveQuery(async () => {
    await dbReady;
    return db.patients.orderBy("name").toArray();
  }, []);

  const { active, discharged } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (patients ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.fileNo.toLowerCase().includes(q) ||
        p.cid.toLowerCase().includes(q),
    );
    return {
      active: list.filter((p) => !p.dischargedAt),
      discharged: list.filter((p) => p.dischargedAt),
    };
  }, [patients, query]);

  const [pendingId, setPendingId] = useState<number | null>(null);

  async function confirmDischarge(note: string) {
    const id = pendingId;
    setPendingId(null);
    if (id == null) return;
    await dischargePatient(id, note);
    toast.success(t("dischargeDone"));
  }

  async function readmit(id: number) {
    await readmitPatient(id);
    toast.success(t("readmittedOk"));
  }




  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("dischPt")}</h1>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="ps-9" />
      </div>

      <Card>
        <CardHeader title={t("activePatients")} subtitle={String(active.length)} />
        <ul className="divide-y divide-border">
          {active.slice(0, 300).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: String(p.id) }}
                  className="font-medium text-primary hover:underline"
                >
                  {p.name || `${t("fileNo")} ${p.fileNo}`}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {p.fileNo} · {p.diagnosis}
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => discharge(p.id!)}>
                <LogOut />
                {t("discharged")}
              </Button>
            </li>
          ))}
          {active.length === 0 ? (
            <li className="px-5 py-8 text-center text-muted-foreground">{t("noResults")}</li>
          ) : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title={t("dischargedList")} subtitle={String(discharged.length)} />
        <ul className="divide-y divide-border">
          {discharged.slice(0, 300).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <span className="font-medium">{p.name || `${t("fileNo")} ${p.fileNo}`}</span>
                <p className="text-xs text-muted-foreground">
                  {p.dischargedAt} {p.dischargeNote ? `· ${p.dischargeNote}` : ""}
                </p>
                <AdmissionHistory patientId={p.id!} />
              </div>
              <Button variant="outline" size="sm" onClick={() => readmit(p.id!)}>
                <Undo2 />
                {t("undoDischarge")}
              </Button>
            </li>
          ))}
          {discharged.length === 0 ? (
            <li className="px-5 py-8 text-center text-muted-foreground">{t("noEntries")}</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

function AdmissionHistory({ patientId }: { patientId: number }) {
  const { t } = useLang();
  const list = useLiveQuery(
    () => db.admissions.where("patientId").equals(patientId).sortBy("admittedAt"),
    [patientId],
  );
  if (!list || list.length === 0) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">{t("admissionHistory")} ({list.length})</summary>
      <ul className="mt-1 space-y-0.5 ps-4">
        {list.map((a) => (
          <li key={a.id}>
            {t("admittedOn")}: {a.admittedAt} —{" "}
            {a.dischargedAt ? `${t("discharged")}: ${a.dischargedAt}` : t("stillAdmitted")}
            {a.dischargeNote ? ` · ${a.dischargeNote}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
