import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Plus, Search, Upload, DatabaseBackup } from "lucide-react";
import { db, dbReady } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, Input } from "@/components/ui-kit";
import {
  backupToJson,
  exportPatientsToExcel,
  importPatientsFromExcel,
  restoreFromJson,
} from "@/lib/transfer";

export const Route = createFileRoute("/patients/")({
  head: () => ({
    meta: [
      { title: "سجل مرضى جناح 39 — Ward 39 Patient Registry" },
      {
        name: "description",
        content:
          "Offline desktop registry for Ward 39 (KCMH): register patients, print patient data, SBAR handover, vital signs, nurses notes and care plans.",
      },
      { property: "og:title", content: "Ward 39 Patient Registry" },
      {
        property: "og:description",
        content:
          "Offline patient registry for Ward 39: registration, printing, SBAR, vitals, nursing notes and care plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const xlsxInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const patients = useLiveQuery(async () => {
    await dbReady;
    return db.patients.orderBy("name").toArray();
  }, []);

  const filtered = useMemo(() => {
    if (!patients) return undefined;
    const q = query.trim().toLowerCase();
    const active = patients.filter((p) => !p.dischargedAt);
    if (!q) return active;
    return active.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.fileNo.toLowerCase().includes(q) ||
        p.cid.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        p.doctor.toLowerCase().includes(q),
    );
  }, [patients, query]);

  async function onImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const added = await importPatientsFromExcel(file);
      toast.success(`${t("importDone")}: ${added}`);
    } catch {
      toast.error(t("importFail"));
    }
  }

  async function onRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t("restoreWarn"))) return;
    try {
      await restoreFromJson(file);
      toast.success(t("restoreDone"));
    } catch {
      toast.error(t("importFail"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("patients")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("total")}: {patients?.length ?? "…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/patients/new">
            <Button>
              <Plus />
              {t("newPatient")}
            </Button>
          </Link>
          <Button variant="outline" onClick={() => xlsxInput.current?.click()}>
            <FileSpreadsheet />
            {t("importExcel")}
          </Button>
          <Button variant="outline" onClick={() => exportPatientsToExcel()}>
            <Download />
            {t("exportExcel")}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await backupToJson();
              toast.success(t("backupDone"));
            }}
          >
            <DatabaseBackup />
            {t("backupJson")}
          </Button>
          <Button variant="ghost" onClick={() => jsonInput.current?.click()}>
            <Upload />
            {t("restoreJson")}
          </Button>
          <input ref={xlsxInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImportExcel} />
          <input ref={jsonInput} type="file" accept=".json" className="hidden" onChange={onRestore} />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="ps-9"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-start">
                <Th>{t("fileNo")}</Th>
                <Th>{t("name")}</Th>
                <Th>{t("cid")}</Th>
                <Th>{t("nationality")}</Th>
                <Th>{t("diagnosis")}</Th>
                <Th>{t("doctor")}</Th>
                <Th>{t("doa")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered === undefined ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t("loading")}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t("noResults")}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 500).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{p.fileNo}</td>
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        to="/patients/$patientId"
                        params={{ patientId: String(p.id) }}
                        className="text-primary hover:underline"
                      >
                        {p.name || `${t("fileNo")} ${p.fileNo}`}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{p.cid}</td>
                    <td className="px-4 py-2.5">{p.nationality}</td>
                    <td className="px-4 py-2.5">{p.diagnosis}</td>
                    <td className="px-4 py-2.5">{p.doctor}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{p.doa}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}
