import { supabase } from "@/integrations/supabase/client";
import {
  fetchCloudPatientById,
  type CloudClinicalRecord,
  type CloudClinicalTable,
  type CloudPatient,
} from "@/lib/cloud-queries";

type RemoteRow = {
  id: string;
  version?: number | null;
  deleted_at?: string | null;
  data?: Record<string, unknown> | null;
  patient_id?: string | null;
  [key: string]: unknown;
};

const PATIENT_FIELD_MAP: Record<string, string> = {
  fileNo: "file_no",
  name: "name",
  nationality: "nationality",
  diagnosis: "diagnosis",
  folderNo: "folder_no",
  age: "age",
  doctor: "doctor",
  cid: "cid",
  doa: "doa",
  dob: "dob",
  sex: "sex",
  room: "room",
  bed: "bed",
  maritalStatus: "marital_status",
  notes: "notes",
  dischargedAt: "discharged_at",
  dischargeNote: "discharge_note",
  updatedAt: "updated_at",
  createdAt: "created_at",
};

export const CLOUD_TABLES = {
  vitals: "patient_vitals",
  notes: "patient_nurse_notes",
  sbar: "patient_sbar",
  careplan: "patient_care_plans",
  rounds: "patient_rounds",
  tranq: "patient_tranquilizer_events",
  assignments: "staff_assignments",
  admissions: "patient_admissions",
  meds: "medication_register",
} as const;

export type CloudTableKey = keyof typeof CLOUD_TABLES;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  throw new Error("المتصفح لا يدعم إنشاء معرف آمن. حدّث المتصفح ثم أعد المحاولة.");
}

async function requireSignedIn(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا قبل حفظ البيانات.");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("لا يوجد اتصال بالإنترنت. لم يتم حفظ التغيير.");
  }
}

function normalizeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/42501|row-level security|permission denied|not approved/i.test(message)) {
    return new Error("الحساب غير معتمد أو لا يملك صلاحية التعديل. لم يتم حفظ التغيير.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine || /fetch|network|timeout|load failed/i.test(message)) {
    return new Error("تعذر الاتصال بالسحابة. لم يتم تأكيد الحفظ؛ تحقّق من الاتصال ثم أعد المحاولة.");
  }
  return new Error(message || "تعذر حفظ التغيير في السحابة.");
}

async function applyCloudEdit(args: {
  table: string;
  id: string;
  op: "upsert" | "delete";
  baseVersion: number;
  fields: Record<string, unknown>;
  patientId?: string | null;
}): Promise<RemoteRow | null> {
  await requireSignedIn();
  const { data, error } = await (supabase as any).rpc("apply_clinical_edit", {
    p_op_id: uuid(),
    p_table: args.table,
    p_id: args.id,
    p_op: args.op,
    p_base_version: args.baseVersion,
    p_fields: args.fields,
    p_changed_at: Date.now(),
    p_patient_id: args.patientId ?? null,
  });
  if (error) throw normalizeError(error);
  const result = data as { status?: string; row?: RemoteRow | null; conflicts?: unknown[] } | null;
  if (result?.status === "file_conflict") throw new Error("رقم الملف مستخدم بالفعل في السحابة. افتح سجل المريض الموجود بدل إنشاء سجل مكرر.");
  if (result?.status === "deleted") throw new Error("هذا السجل محذوف في السحابة ولا يمكن تعديله.");
  if (result?.status === "conflict" || result?.conflicts?.length) {
    throw new Error("تم تعديل السجل من جهاز آخر. أعد تحميل البيانات وراجعها قبل المحاولة مرة أخرى.");
  }
  if (result?.status !== "ok") throw new Error("لم تؤكد السحابة حفظ التغيير؛ لم يتم حفظه محليًا.");
  return result.row ?? null;
}

function patientFields(value: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [localKey, remoteKey] of Object.entries(PATIENT_FIELD_MAP)) {
    if (!Object.prototype.hasOwnProperty.call(value, localKey)) continue;
    const fieldValue = value[localKey];
    fields[remoteKey] = fieldValue === undefined ? null : fieldValue;
  }
  return fields;
}

function clinicalFields(value: Record<string, unknown>): Record<string, unknown> {
  const fields = { ...value };
  delete fields.id;
  delete fields.patientId;
  delete fields.version;
  delete fields.changedAt;
  return fields;
}

export async function findCloudPatientByField(
  field: "fileNo" | "cid",
  value: string,
): Promise<CloudPatient | null> {
  const valueToFind = value.trim();
  if (!valueToFind) return null;
  const column = field === "fileNo" ? "file_no" : "cid";
  const { data, error } = await (supabase.from("patients") as any)
    .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at,version")
    .eq(column, valueToFind)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw normalizeError(error);
  if (!data) return null;
  const row = data as RemoteRow;
  // Reuse the typed mapper by querying via UUID, so snake_case conversion stays centralized.
  return fetchCloudPatientById(String(row.id));
}

export async function suggestCloudPatientValues(
  field: "fileNo" | "cid",
  prefix: string,
): Promise<string[]> {
  const value = prefix.trim();
  if (!value) return [];
  const column = field === "fileNo" ? "file_no" : "cid";
  const { data, error } = await (supabase.from("patients") as any)
    .select(column)
    .is("deleted_at", null)
    .ilike(column, value + "%")
    .limit(6);
  if (error) throw normalizeError(error);
  return Array.from(new Set((data ?? []).map((row: Record<string, unknown>) => String(row[column] ?? "")).filter(Boolean)));
}

export async function createCloudPatient(value: Record<string, unknown>): Promise<CloudPatient> {
  const id = uuid();
  const result = await applyCloudEdit({
    table: "patients",
    id,
    op: "upsert",
    baseVersion: 0,
    fields: patientFields(value),
  });
  const saved = await fetchCloudPatientById(String(result?.id ?? id));
  if (!saved) throw new Error("تم إرسال المريض إلى السحابة، لكن تعذر تأكيد قراءة السجل المحفوظ.");
  return { ...saved, version: Number(result?.version ?? saved.version ?? 1) };
}

export async function updateCloudPatient(
  id: string,
  patch: Record<string, unknown>,
  baseVersion: number,
): Promise<CloudPatient> {
  const result = await applyCloudEdit({
    table: "patients",
    id,
    op: "upsert",
    baseVersion,
    fields: patientFields(patch),
  });
  const saved = await fetchCloudPatientById(String(result?.id ?? id));
  if (!saved) throw new Error("تعذر إعادة تحميل المريض بعد الحفظ السحابي.");
  return { ...saved, version: Number(result?.version ?? saved.version) };
}

export async function deleteCloudPatient(id: string, baseVersion: number): Promise<void> {
  await applyCloudEdit({ table: "patients", id, op: "delete", baseVersion, fields: {} });
}

export async function fetchCloudRecords(
  table: CloudClinicalTable,
  patientId: string,
  limit = 100,
): Promise<CloudClinicalRecord[]> {
  const { data, error } = await (supabase.from(table) as any)
    .select("id,patient_id,data,deleted_at,version,created_at,changed_at")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("changed_at", { ascending: false })
    .limit(Math.min(500, Math.max(1, limit)));
  if (error) throw normalizeError(error);
  return ((data ?? []) as RemoteRow[]).map((row) => ({
    ...((row.data as Record<string, unknown> | null) ?? {}),
    id: row.id,
    patientId: row.patient_id ?? null,
    version: Number(row.version ?? 0),
    createdAt: (row.data as Record<string, unknown> | null)?.createdAt as number | string ?? (row.created_at as string | number | undefined) ?? 0,
    changedAt: Number(row.changed_at ?? 0),
  })) as CloudClinicalRecord[];
}

export async function createCloudRecord(
  table: CloudTableKey,
  patientId: string | null,
  value: Record<string, unknown>,
): Promise<CloudClinicalRecord> {
  const id = uuid();
  const row = await applyCloudEdit({
    table: CLOUD_TABLES[table],
    id,
    op: "upsert",
    baseVersion: 0,
    fields: clinicalFields(value),
    patientId,
  });
  return {
    ...clinicalFields(value),
    id: String(row?.id ?? id),
    patientId,
    version: Number(row?.version ?? 1),
    createdAt: Date.now(),
    changedAt: Date.now(),
  };
}

export async function updateCloudRecord(
  table: CloudTableKey,
  id: string,
  patientId: string,
  patch: Record<string, unknown>,
  baseVersion: number,
): Promise<CloudClinicalRecord> {
  const fields = clinicalFields(patch);
  const row = await applyCloudEdit({
    table: CLOUD_TABLES[table],
    id,
    op: "upsert",
    baseVersion,
    fields,
    patientId,
  });
  return { ...fields, id: String(row?.id ?? id), patientId, version: Number(row?.version ?? baseVersion + 1), createdAt: 0, changedAt: Date.now() };
}

export async function deleteCloudRecord(
  table: CloudTableKey,
  id: string,
  patientId: string,
  baseVersion: number,
): Promise<void> {
  await applyCloudEdit({
    table: CLOUD_TABLES[table],
    id,
    op: "delete",
    baseVersion,
    fields: {},
    patientId,
  });
}

/** Fetch all non-deleted records only for explicit export/backup operations. */
export async function fetchAllCloudRecords(table: CloudClinicalTable): Promise<CloudClinicalRecord[]> {
  const rows: CloudClinicalRecord[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await (supabase.from(table) as any)
      .select("id,patient_id,data,deleted_at,version,created_at,changed_at,sync_seq")
      .is("deleted_at", null)
      .order("sync_seq", { ascending: true, nullsFirst: true })
      .range(start, start + 499);
    if (error) throw normalizeError(error);
    const page = (data ?? []) as RemoteRow[];
    rows.push(...page.map((row) => ({
      ...((row.data as Record<string, unknown> | null) ?? {}),
      id: row.id,
      patientId: row.patient_id ?? null,
      version: Number(row.version ?? 0),
      createdAt: ((row.data as Record<string, unknown> | null)?.createdAt as number | string | undefined) ?? (row.created_at as string | number | undefined) ?? 0,
      changedAt: Number(row.changed_at ?? 0),
    })) as CloudClinicalRecord[]);
    if (page.length < 500) return rows;
  }
}

/** Query records by a JSON payload field, used for date and category-scoped pages. */
export async function fetchCloudRecordsByField(
  table: CloudClinicalTable,
  field: string,
  value: string | number,
  limit = 500,
): Promise<CloudClinicalRecord[]> {
  const max = Math.min(1000, Math.max(1, limit));
  const { data, error } = await (supabase.from(table) as any)
    .select("id,patient_id,data,deleted_at,version,created_at,changed_at")
    .is("deleted_at", null)
    .contains("data", { [field]: value })
    .order("changed_at", { ascending: false })
    .limit(max);
  if (error) throw normalizeError(error);
  return ((data ?? []) as RemoteRow[]).map((row) => ({
    ...((row.data as Record<string, unknown> | null) ?? {}),
    id: row.id,
    patientId: row.patient_id ?? null,
    version: Number(row.version ?? 0),
    createdAt: ((row.data as Record<string, unknown> | null)?.createdAt as number | string | undefined) ?? (row.created_at as string | number | undefined) ?? 0,
    changedAt: Number(row.changed_at ?? 0),
  })) as CloudClinicalRecord[];
}
