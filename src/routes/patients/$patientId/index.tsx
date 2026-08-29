import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Pencil, Printer, Trash2, FileText, HeartPulse, ClipboardList, NotebookPen, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Badge, Button, Card, CardHeader } from "@/components/ui-kit";
import { PatientRecords } from "@/components/PatientRecords";

export const Route = createFileRoute("/patients/$patientId/")({
  head: () => ({
    meta: [
      { title: "ملف المريض — Ward 39" },
      { name: "description", content: "Patient file: details, vitals, nursing notes, SBAR and care plan with print forms." },
      { property: "og:title", content: "Patient File — Ward 39" },
      { property: "og:description", content: "Patient file with print forms for Ward 39." },
    ],
  }),
  component: PatientFilePage,
});

function PatientFilePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { patientId } = useParams({ from: "/patients/$patientId/" });
  const id = Number(patientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);

  if (patient === undefined) {
    return <p className="py-10 text-center text-muted-foreground">{t("loading")}</p>;
  }
  if (!patient) {
    navigate({ to: "/patients" });
    return null;
  }

  async function onDelete() {
    if (!window.confirm(t("confirmDelete"))) return;
    await db.transaction("rw", [db.patients, db.vitals, db.notes, db.sbar, db.careplan], async () => {
      await Promise.all([
        db.vitals.where("patientId").equals(id).delete(),
        db.notes.where("patientId").equals(id).delete(),
        db.sbar.where("patientId").equals(id).delete(),
        db.careplan.where("patientId").equals(id).delete(),
        db.patients.delete(id),
      ]);
    });
    toast.success(t("deletedOk"));
    navigate({ to: "/patients" });
  }

  const forms = [
    { to: "/print/$patientId/summary", icon: FileText, label: t("patientData") },
    { to: "/print/$patientId/sbar", icon: ClipboardList, label: t("sbarForm") },
    { to: "/print/$patientId/vitals", icon: HeartPulse, label: t("vitalsForm") },
    { to: "/print/$patientId/notes", icon: NotebookPen, label: t("notesForm") },
    { to: "/print/$patientId/careplan", icon: Printer, label: t("careplanForm") },
    { to: "/print/$patientId/treatment", icon: FileText, label: t("treatmentForm") },
    { to: "/print/$patientId/consultation", icon: ClipboardList, label: t("consultationForm") },
    { to: "/print/$patientId/progress", icon: NotebookPen, label: t("progressForm") },
    { to: "/print/$patientId/nursingdb", icon: FileText, label: t("nursingDbForm") },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{patient.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge>{t("fileNo")}: {patient.fileNo || "—"}</Badge>
            <Badge>{t("diagnosis")}: {patient.diagnosis || "—"}</Badge>
            <Badge>Ward 39</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/patients/$patientId/edit" params={{ patientId }}>
            <Button variant="outline">
              <Pencil />
              {t("edit")}
            </Button>
          </Link>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 />
            {t("delete")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title={t("patientFile")} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          <Info label={t("fileNo")} value={patient.fileNo} mono />
          <Info label={t("cid")} value={patient.cid} mono />
          <Info label={t("folderNo")} value={patient.folderNo} mono />
          <Info label={t("nationality")} value={patient.nationality} />
          <Info label={t("age")} value={patient.age} mono />
          <Info label={t("dob")} value={patient.dob} mono />
          <Info label={t("sex")} value={patient.sex === "M" ? t("male") : patient.sex === "F" ? t("female") : ""} />
          <Info label={t("maritalStatus")} value={patient.maritalStatus} />
          <Info label={t("diagnosis")} value={patient.diagnosis} />
          <Info label={t("doctor")} value={patient.doctor} />
          <Info label={t("doa")} value={patient.doa} mono />
          <Info label={`${t("room")} / ${t("bed")}`} value={[patient.room, patient.bed].filter(Boolean).join(" / ")} mono />
          {patient.notes ? (
            <div className="col-span-full">
              <Info label={t("notes")} value={patient.notes} />
            </div>
          ) : null}
        </dl>
      </Card>

      <Card>
        <CardHeader title={t("printForms")} />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Link key={f.to} to={f.to} params={{ patientId }}>
              <span className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 text-sm font-medium transition-colors hover:border-primary hover:bg-accent">
                <span className="flex items-center gap-3">
                  <f.icon className="size-5 text-primary" />
                  {f.label}
                </span>
                <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" />
              </span>
            </Link>
          ))}
        </div>
      </Card>

      <PatientRecords patientId={id} />
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined} style={mono ? { textAlign: "start" } : undefined}>
        {value || "—"}
      </dd>
    </div>
  );
}
