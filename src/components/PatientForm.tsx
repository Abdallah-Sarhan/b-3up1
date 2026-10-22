import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { emptyPatient, type Patient } from "@/lib/db";
import {
  createCloudPatient,
  findCloudPatientByField,
  suggestCloudPatientValues,
  updateCloudPatient,
  createCloudRecord,
} from "@/lib/cloud-direct";
import type { CloudPatient } from "@/lib/cloud-queries";
import { useLang } from "@/lib/i18n";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui-kit";
import { SuggestInput } from "@/components/SuggestInput";


type PatientDraft = Omit<Patient, "id">;

function toPatientDraft(value: CloudPatient): PatientDraft {
  const { id: _id, version: _version, ...draft } = value;
  return draft as PatientDraft;
}

export function PatientForm({ patient }: { patient?: CloudPatient }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState<PatientDraft>(() =>
    patient ? toPatientDraft(patient) : emptyPatient(),
  );
  const [saving, setSaving] = useState(false);
  const initialCloudVersion = useRef<number | null>(
    patient?.version ?? null,
  );
  // When adding: id of an already-registered patient matched by file no / civil id
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [matchedVersion, setMatchedVersion] = useState<number | null>(null);
  const [fileNoSugs, setFileNoSugs] = useState<string[]>([]);
  const [cidSugs, setCidSugs] = useState<string[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suggestRun = useRef(0);

  useEffect(() => () => clearTimeout(suggestTimer.current), []);

  // Auto-calculate age when date of birth is known
  useEffect(() => {
    if (!form.dob) return;
    const calc = calculateAge(form.dob);
    if (calc && calc !== form.age) {
      setForm((f) => ({ ...f, age: calc }));
    }
  }, [form.dob]);

  function calculateAge(dob: string): string {
    if (!dob) return "";
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return "";
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      years--;
    }
    return String(years);
  }

  function setDob(e: React.ChangeEvent<HTMLInputElement>) {
    const dob = e.target.value;
    setForm((f) => ({ ...f, dob, age: calculateAge(dob) }));
  }

  // Live suggestions (prefix search) while typing file no / civil id
  function suggest(key: "fileNo" | "cid", value: string) {
    const v = value.trim();
    clearTimeout(suggestTimer.current);
    const run = ++suggestRun.current;
    if (patient?.id || !v) {
      (key === "fileNo" ? setFileNoSugs : setCidSugs)([]);
      return;
    }
     suggestTimer.current = setTimeout(() => {
      void suggestCloudPatientValues(key, v).then((values) => {
        if (run !== suggestRun.current) return;
        (key === "fileNo" ? setFileNoSugs : setCidSugs)(values);
      }).catch(() => {
        if (run === suggestRun.current) (key === "fileNo" ? setFileNoSugs : setCidSugs)([]);
      });
    }, 180);
  }

  // Apply a chosen/exact file no or civil id: update suggestions and auto-fill patient data
  async function applyLookup(key: "fileNo" | "cid", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    suggest(key, value);
    if (patient?.id) return;
    if (!value.trim()) return;
    const hit = await findCloudPatientByField(key, value);
    if (hit) {
      setMatchedId(hit.id);
      setMatchedVersion(hit.version);
      setForm({ ...toPatientDraft(hit), [key]: value });
      toast.info(t("existingPatientFound"));
    }
  }

  // On every change: update form, refresh suggestions, auto-fill on exact match
  function onLookupChange(key: "fileNo" | "cid") {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
      suggest(key, value);
    };
  }

  function onLookupSelect(key: "fileNo" | "cid") {
    return async (value: string) => {
      await applyLookup(key, value);
    };
  }


  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function findExisting(fileNo: string, cid: string): Promise<CloudPatient | undefined> {
    const fn = fileNo.trim();
    const cn = cid.trim();
    if (fn) {
      const hit = await findCloudPatientByField("fileNo", fn);
      if (hit) return hit;
    }
    if (cn) {
      const hit = await findCloudPatientByField("cid", cn);
      if (hit) return hit;
    }
    return undefined;
  }

  // Live lookup as soon as the user finishes typing the file no / civil id
  async function lookupExisting() {
    if (patient?.id) return; // edit mode: never hijack
    if (!form.fileNo.trim() && !form.cid.trim()) return;
    const hit = await findExisting(form.fileNo, form.cid);
    if (hit && hit.id !== matchedId) {
      setMatchedId(hit.id);
      setMatchedVersion(hit.version);
      setForm(toPatientDraft(hit));
      toast.info(t("existingPatientFound"));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t("required"));
      return;
    }
    setSaving(true);
    try {
      if (patient?.id) {
        const data = { ...form, updatedAt: Date.now() };
        const saved = await updateCloudPatient(patient.id, data, initialCloudVersion.current ?? patient.version);
        toast.success(t("savedOk"));
        navigate({ to: "/patients/$patientId", params: { patientId: saved.id } });
        return;
      }
      // Add mode: re-admit instead of duplicating when file no / civil id exists
      const match = await findExisting(form.fileNo, form.cid);
      if (match) {
        const wasDischarged = Boolean(match.dischargedAt || form.dischargedAt);
        const data: Record<string, unknown> = {
          ...form,
          doa: form.doa || new Date().toISOString().slice(0, 10),
          updatedAt: Date.now(),
          dischargedAt: null,
          dischargeNote: null,
        };
        await updateCloudPatient(match.id, data, matchedId === match.id ? (matchedVersion ?? match.version) : match.version);
        if (wasDischarged) {
          await createCloudRecord("admissions", match.id, {
            admittedAt: data.doa,
            createdAt: Date.now(),
          });
        }
        toast.success(wasDischarged ? t("readmittedOk") : t("patientAlreadyActive"));
        navigate({ to: "/patients/$patientId", params: { patientId: match.id } });
        return;
      }
      const saved = await createCloudPatient({ ...form, updatedAt: Date.now() });
      toast.success(t("savedOk"));
      navigate({ to: "/patients/$patientId", params: { patientId: saved.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ بيانات المريض في السحابة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("fileNo")}>
            <SuggestInput
              value={form.fileNo}
              onChange={onLookupChange("fileNo")}
              onSelect={onLookupSelect("fileNo")}
              onBlur={lookupExisting}
              suggestions={fileNoSugs}
              dir="ltr"
              autoComplete="off"
            />
          </Field>
          <Field label={`${t("name")} *`}>
            <Input value={form.name} onChange={set("name")} required autoFocus />
          </Field>
          <Field label={t("cid")}>
            <SuggestInput
              value={form.cid}
              onChange={onLookupChange("cid")}
              onSelect={onLookupSelect("cid")}
              onBlur={lookupExisting}
              suggestions={cidSugs}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>

          <Field label={t("nationality")}>
            <Input value={form.nationality} onChange={set("nationality")} />
          </Field>
          <Field label={t("diagnosis")}>
            <Input value={form.diagnosis} onChange={set("diagnosis")} />
          </Field>
          <Field label={t("folderNo")}>
            <Input value={form.folderNo} onChange={set("folderNo")} dir="ltr" />
          </Field>
          <Field label={t("age")}>
            <Input value={form.age} onChange={set("age")} dir="ltr" inputMode="numeric" />
          </Field>
          <Field label={t("dob")}>
            <Input type="date" value={form.dob} onChange={setDob} dir="ltr" />
          </Field>
          <Field label={t("doa")}>
            <Input value={form.doa} onChange={set("doa")} dir="ltr" placeholder="YYYY-MM-DD" />
          </Field>
          <Field label={t("doctor")}>
            <Input value={form.doctor} onChange={set("doctor")} />
          </Field>
          <Field label={t("sex")}>
            <Select value={form.sex} onChange={set("sex")}>
              <option value="">—</option>
              <option value="M">{t("male")}</option>
              <option value="F">{t("female")}</option>
            </Select>
          </Field>
          <Field label={t("maritalStatus")}>
            <Input value={form.maritalStatus} onChange={set("maritalStatus")} />
          </Field>
          <Field label={t("room")}>
            <Input value={form.room} onChange={set("room")} dir="ltr" />
          </Field>
          <Field label={t("bed")}>
            <Input value={form.bed} onChange={set("bed")} dir="ltr" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("notes")}>
            <Textarea value={form.notes} onChange={set("notes")} rows={3} />
          </Field>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {t("save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            {t("cancel")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
