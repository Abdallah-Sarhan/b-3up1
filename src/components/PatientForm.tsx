import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { db, emptyPatient, type Patient, readmitPatient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui-kit";
import { SuggestInput } from "@/components/SuggestInput";


export function PatientForm({ patient }: { patient?: Patient }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState<Omit<Patient, "id">>(() =>
    patient ? { ...patient } : emptyPatient(),
  );
  const [saving, setSaving] = useState(false);
  // When adding: id of an already-registered patient matched by file no / civil id
  const [matchedId, setMatchedId] = useState<number | null>(null);
  const [fileNoSugs, setFileNoSugs] = useState<string[]>([]);
  const [cidSugs, setCidSugs] = useState<string[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suggestRun = useRef(0);

  useEffect(() => () => clearTimeout(suggestTimer.current), []);

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
      void db.patients.where(key).startsWith(v).limit(6).toArray().then((rows) => {
        if (run !== suggestRun.current) return;
        (key === "fileNo" ? setFileNoSugs : setCidSugs)(
          rows.map((r) => r[key]).filter(Boolean),
        );
      });
    }, 180);
  }

  // Apply a chosen/exact file no or civil id: update suggestions and auto-fill patient data
  async function applyLookup(key: "fileNo" | "cid", value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    suggest(key, value);
    if (patient?.id) return;
    if (!value.trim()) return;
    const hit = await db.patients.where(key).equals(value.trim()).first();
    if (hit) {
      setMatchedId(hit.id ?? null);
      setForm({ ...hit, [key]: value });
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

  async function findExisting(fileNo: string, cid: string): Promise<Patient | undefined> {
    const fn = fileNo.trim();
    const cn = cid.trim();
    if (fn) {
      const hit = await db.patients.where("fileNo").equals(fn).first();
      if (hit) return hit;
    }
    if (cn) {
      const hit = await db.patients.where("cid").equals(cn).first();
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
      setMatchedId(hit.id ?? null);
      setForm({ ...hit });
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
        await db.patients.update(patient.id, data);
        toast.success(t("savedOk"));
        navigate({ to: "/patients/$patientId", params: { patientId: String(patient.id) } });
        return;
      }
      // Add mode: re-admit instead of duplicating when file no / civil id exists
      const existingId = matchedId ?? (await findExisting(form.fileNo, form.cid))?.id ?? null;
      if (existingId != null) {
        const wasDischarged = Boolean(form.dischargedAt);
        const data = {
          ...form,
          doa: form.doa || new Date().toISOString().slice(0, 10),
          updatedAt: Date.now(),
        };
        delete data.dischargedAt;
        delete data.dischargeNote;
        await db.patients.update(existingId, (obj) => {
          Object.assign(obj, data);
          delete obj.dischargedAt;
          delete obj.dischargeNote;
        });
        if (wasDischarged) await readmitPatient(existingId, data.doa);
        toast.success(wasDischarged ? t("readmittedOk") : t("patientAlreadyActive"));
        navigate({ to: "/patients/$patientId", params: { patientId: String(existingId) } });
        return;
      }
      const addData = { ...form, updatedAt: Date.now() } as Partial<Patient>;
      delete addData.id;
      const id = await db.patients.add(addData as Omit<Patient, "id">);
      toast.success(t("savedOk"));
      navigate({ to: "/patients/$patientId", params: { patientId: String(id) } });
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
            <Input type="date" value={form.dob} onChange={set("dob")} dir="ltr" />
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
