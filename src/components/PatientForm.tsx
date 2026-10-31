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

// Kuwait Civil ID: century digit (2 = 1900s, 3 = 2000s), then YYMMDD.
function extractKuwaitiCivilIdDob(value: string): string | null {
  const digits = value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    // Ignore visual separators commonly used when entering civil IDs.
    .replace(/\D/g, "");

  if (!/^[123]\d{11}$/.test(digits)) return null;

  const century = digits[0] === "1" ? 1800 : digits[0] === "2" ? 1900 : 2000;
  const year = century + Number(digits.slice(1, 3));
  const month = Number(digits.slice(3, 5));
  const day = Number(digits.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getTime() > Date.now()
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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

  // Derive DOB and age from the Civil ID whenever its value changes.
  // Keeping this in an effect also covers pasted values and all input paths.
  useEffect(() => {
    if (patient?.id) return;
    const dob = extractKuwaitiCivilIdDob(form.cid);
    if (!dob) return;
    const age = calculateAge(dob);
    if (form.dob !== dob || form.age !== age) {
      setForm((f) => ({ ...f, dob, age }));
    }
  }, [form.cid, patient?.id]);

  // Auto-calculate age when date of birth is known
  useEffect(() => {
    if (!form.dob) return;
    const calc = calculateAge(form.dob);
    if (calc && calc !== form.age) {
      setForm((f) => ({ ...f, age: calc }));
    }
  }, [form.dob]);

  function calculateAge(dob: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
    if (!match) return "";
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const birth = new Date(year, month - 1, day);
    if (
      birth.getFullYear() !== year ||
      birth.getMonth() !== month - 1 ||
      birth.getDate() !== day
    ) return "";

    const today = new Date();
    let years = today.getFullYear() - year;
    if (
      today.getMonth() + 1 < month ||
      (today.getMonth() + 1 === month && today.getDate() < day)
    ) years--;
    return years >= 0 ? String(years) : "";
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
      const existingDraft = toPatientDraft(hit);
      const derivedDob = key === "cid" ? extractKuwaitiCivilIdDob(value) : null;
      const dob = existingDraft.dob || derivedDob || "";
      setForm({ ...existingDraft, [key]: value, dob, age: existingDraft.age || (dob ? calculateAge(dob) : "") });
      toast.info(t("existingPatientFound"));
    }
  }

  // On every change: update form, refresh suggestions, auto-fill on exact match
  function onLookupChange(key: "fileNo" | "cid") {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (key === "cid") {
        const dob = extractKuwaitiCivilIdDob(value);
        setForm((f) => dob
          ? { ...f, cid: value, dob, age: calculateAge(dob) }
          : { ...f, cid: value });
      } else {
        setForm((f) => ({ ...f, [key]: value }));
      }
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
      const existingDraft = toPatientDraft(hit);
      const derivedDob = extractKuwaitiCivilIdDob(form.cid);
      const dob = existingDraft.dob || derivedDob || "";
      setForm({ ...existingDraft, dob, age: existingDraft.age || (dob ? calculateAge(dob) : "") });
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
          doa: form["doa"] || new Date().toISOString().slice(0, 10),
          updatedAt: Date.now(),
          dischargedAt: null,
          dischargeNote: null,
        };
        await updateCloudPatient(match.id, data, matchedId === match.id ? (matchedVersion ?? match.version) : match.version);
        if (wasDischarged) {
          await createCloudRecord("admissions", match.id, {
            admittedAt: data["doa"],
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
            <Input type="date" value={form["doa"]} onChange={set("doa")} dir="ltr" />
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
          <Field label="Unit">
            <Input value={form.unit} onChange={set("unit")} dir="ltr" placeholder="مثال: 2" />
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
