import { db, withCloudCacheMutation, type Patient } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";

export type ClinicalTable =
  | "vitals"
  | "notes"
  | "sbar"
  | "careplan"
  | "rounds"
  | "tranq"
  | "assignments"
  | "admissions"
  | "meds";

const REMOTE_TABLE: Record<ClinicalTable, string> = {
  vitals: "patient_vitals",
  notes: "patient_nurse_notes",
  sbar: "patient_sbar",
  careplan: "patient_care_plans",
  rounds: "patient_rounds",
  tranq: "patient_tranquilizer_events",
  assignments: "staff_assignments",
  admissions: "patient_admissions",
  meds: "medication_register",
};

const MAP_PREFIX = "ward39.cloud-id";
const REVERSE_PREFIX = "ward39.local-id";
const PATIENT_FIELDS: Record<string, string> = {
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

type RemoteRow = {
  id: string;
  version?: number;
  deleted_at?: string | null;
  patient_id?: string | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function remoteTableName(table: ClinicalTable): string {
  return REMOTE_TABLE[table];
}

function mappingKey(table: string, localId: number | string) {
  return `${MAP_PREFIX}:${table}:${String(localId)}`;
}
function reverseKey(table: string, cloudId: string) {
  return `${REVERSE_PREFIX}:${table}:${cloudId}`;
}
function readMap(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function getCloudId(table: string, localId: number | string): string | null {
  return readMap(mappingKey(table, localId));
}
export function getLocalId(table: string, cloudId: string): number | string | null {
  const value = readMap(reverseKey(table, cloudId));
  if (value === null) return null;
  if (table === "meta") return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function linkIds(table: string, localId: number | string, cloudId: string): void {
  try {
    localStorage.setItem(mappingKey(table, localId), cloudId);
    localStorage.setItem(reverseKey(table, cloudId), String(localId));
  } catch {
    throw new Error("تعذر حفظ رابط السجل السحابي على هذا الجهاز. لا تغلق الصفحة وحاول مرة أخرى.");
  }
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  throw new Error("المتصفح لا يدعم إنشاء معرف آمن للسجل. حدّث المتصفح ثم أعد المحاولة.");
}

function cleanError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return new Error("لا يوجد اتصال بالإنترنت. لم يتم حفظ التغيير؛ اتصل بالإنترنت ثم أعد المحاولة.");
  }
  if (/fetch|network|timeout|failed to fetch|load failed/i.test(message)) {
    return new Error("تعذر الوصول إلى Lovable Cloud. لم يتم حفظ التغيير؛ تحقّق من الاتصال ثم أعد المحاولة.");
  }
  if (/not approved|42501|row-level security|permission denied/i.test(message)) {
    return new Error("حسابك غير معتمد أو لا يملك صلاحية التعديل. لم يتم حفظ التغيير.");
  }
  return new Error(message || "تعذر حفظ التغيير في السحابة. لم يتم حفظه محليًا.");
}

async function assertSignedIn(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("لا يوجد اتصال بالإنترنت. لم يتم حفظ التغيير؛ اتصل بالإنترنت ثم أعد المحاولة.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw cleanError(error);
  if (!data.session?.user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا قبل حفظ البيانات.");
}

function patientPayload(value: Partial<Patient> | Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [localKey, cloudKey] of Object.entries(PATIENT_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(value, localKey)) continue;
    const v = (value as Record<string, unknown>)[localKey];
    if (v === undefined) {
      if (cloudKey === "discharged_at" || cloudKey === "discharge_note") out[cloudKey] = null;
      continue;
    }
    out[cloudKey] = v;
  }
  return out;
}

function childPayload(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, patientId: _patientId, ...data } = value;
  return Object.fromEntries(Object.entries(data).filter(([, item]) => item !== undefined));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function findPatientByFileNo(fileNo: string): Promise<RemoteRow | null> {
  if (!fileNo.trim()) return null;
  const { data, error } = await supabase
    .from("patients")
    .select("id,version,deleted_at")
    .eq("file_no", fileNo.trim())
    .maybeSingle();
  if (error) throw cleanError(error);
  return (data as unknown as RemoteRow | null) ?? null;
}

async function versionFor(table: string, id: string): Promise<number> {
  const { data, error } = await (supabase.from(table as never) as any)
    .select("id,version,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw cleanError(error);
  if (!data || data.deleted_at) throw new Error("هذا السجل غير موجود أو تم حذفه من السحابة. حدّث الصفحة قبل المتابعة.");
  return Number(data.version ?? 0);
}

async function applyEdit(args: {
  table: string;
  id: string;
  op: "upsert" | "delete";
  baseVersion: number;
  fields: Record<string, unknown>;
  patientId?: string | null;
}): Promise<RemoteRow | null> {
  await assertSignedIn();
  const { data, error } = await supabase.rpc("apply_clinical_edit", {
    p_op_id: newUuid(),
    p_table: args.table,
    p_id: args.id,
    p_op: args.op,
    p_base_version: args.baseVersion,
    p_fields: args.fields as never,
    p_changed_at: Date.now(),
    p_patient_id: args.patientId ?? null,
  });
  if (error) throw cleanError(error);
  const result = data as unknown as { status?: string; row?: RemoteRow | null; conflicts?: unknown[] };
  if (result?.status === "file_conflict") throw new Error("رقم الملف مستخدم بالفعل في السحابة. افتح سجل المريض الموجود بدل إنشاء سجل مكرر.");
  if (result?.status === "deleted") throw new Error("هذا السجل محذوف في السحابة ولا يمكن تعديله.");
  if (result?.status !== "ok") throw new Error("لم تؤكد السحابة حفظ التغيير؛ لم يتم حفظه محليًا.");
  if (result.conflicts?.length) {
    throw new Error("تم اكتشاف تعارض مع تعديل آخر. أعد تحميل السجل وراجع البيانات قبل المتابعة.");
  }
  return result.row ?? null;
}

async function uploadPatientRemote(
  patient: Partial<Patient> | Record<string, unknown>,
  localId?: number,
  options: { migration?: boolean; changedFields?: Partial<Patient> } = {},
): Promise<string> {
  const currentFileNo = String((patient as Record<string, unknown>).fileNo ?? "").trim();
  let cloudId = localId == null ? null : getCloudId("patients", localId);
  let currentVersion = 0;

  if (cloudId && options.migration) {
    // A known cloud link is authoritative: never overwrite newer cloud values
    // using an old local cache during startup.
    return cloudId;
  } else if (cloudId) {
    currentVersion = await versionFor("patients", cloudId);
  } else if (currentFileNo) {
    const existing = await findPatientByFileNo(currentFileNo);
    if (existing && existing.deleted_at) {
      throw new Error("يوجد سجل محذوف بهذا الرقم في السحابة. راجع المشرف قبل إعادة استخدام رقم الملف.");
    }
    if (existing) {
      cloudId = existing.id;
      currentVersion = Number(existing.version ?? 0);
      if (localId != null) linkIds("patients", localId, cloudId);
      if (!options.migration && localId == null) {
        throw new Error("رقم الملف مسجل بالفعل في السحابة. ابحث عن المريض الموجود بدل إنشاء سجل جديد.");
      }
      if (options.migration) return cloudId;
    }
  }

  const isNew = !cloudId;
  cloudId ||= newUuid();
  const patchSource = options.changedFields ?? patient;
  const fields = patientPayload(patchSource);
  const row = await applyEdit({
    table: "patients",
    id: cloudId,
    op: "upsert",
    baseVersion: isNew ? 0 : currentVersion,
    fields,
  });
  if (localId != null) linkIds("patients", localId, cloudId);
  return String(row?.id ?? cloudId);
}

async function cloudPatientId(localPatientId: number): Promise<string> {
  const mapped = getCloudId("patients", localPatientId);
  if (mapped) return mapped;
  const patient = await db.patients.get(localPatientId);
  if (!patient) throw new Error("تعذر العثور على المريض المرتبط بالسجل. أعد تحميل القائمة.");
  const id = await uploadPatientRemote(patient, localPatientId, { migration: true });
  linkIds("patients", localPatientId, id);
  return id;
}

async function findMatchingRemoteChild(
  table: ClinicalTable,
  record: Record<string, unknown>,
  patientId: string | null,
): Promise<RemoteRow | null> {
  const remote = remoteTableName(table);
  const { data, error } = await (supabase.from(remote as never) as any)
    .select("id,version,deleted_at,patient_id,data");
  if (error) throw cleanError(error);
  const target = stableJson(childPayload(record));
  const rows = (data ?? []) as RemoteRow[];
  return rows.find((row) =>
    (row.patient_id ?? null) === patientId &&
    stableJson(row.data ?? {}) === target
  ) ?? null;
}

async function uploadChildRemote(
  table: ClinicalTable,
  record: Record<string, unknown>,
  localId?: number,
  options: { migration?: boolean } = {},
): Promise<string> {
  const remote = remoteTableName(table);
  let cloudId = localId == null ? null : getCloudId(table, localId);
  let baseVersion = 0;
  const patientLocalId = typeof record.patientId === "number" ? record.patientId : null;
  const parentCloudId = patientLocalId == null ? null : await cloudPatientId(patientLocalId);
  const fields = childPayload(record);

  if (cloudId && options.migration) {
    // Existing mapping means this is an established cache row, not a new edit.
    return cloudId;
  } else if (cloudId) {
    baseVersion = await versionFor(remote, cloudId);
  } else if (options.migration) {
    const match = await findMatchingRemoteChild(table, record, parentCloudId);
    if (match) {
      if (localId != null) linkIds(table, localId, match.id);
      return match.id;
    }
  } else if (localId != null) {
    throw new Error("هذا السجل المحلي غير مربوط بالسحابة. أعد تحميل البيانات أو اطلب من المشرف مراجعة الترحيل.");
  }

  const isNew = !cloudId;
  cloudId ||= newUuid();
  const row = await applyEdit({
    table: remote,
    id: cloudId,
    op: "upsert",
    baseVersion: isNew ? 0 : baseVersion,
    fields,
    patientId: parentCloudId,
  });
  if (localId != null) linkIds(table, localId, cloudId);
  return String(row?.id ?? cloudId);
}

/** Create a patient in the cloud first; the local database is only a view cache. */
export async function createPatientCloudFirst(value: Omit<Patient, "id">): Promise<number> {
  const clean = { ...value };
  delete (clean as Partial<Patient>).id;
  const cloudId = await uploadPatientRemote(clean);
  try {
    const localId = await withCloudCacheMutation(() => db.patients.add(clean));
    linkIds("patients", Number(localId), cloudId);
    return Number(localId);
  } catch (error) {
    // The cloud remains authoritative; startup/realtime reconciliation restores the cache.
    throw new Error("تم تأكيد الحفظ السحابي، لكن تعذر تحديث عرض هذا الجهاز. حدّث الصفحة لاسترجاع السجل.");
  }
}

/** Update selected fields in the cloud, then update the local display cache. */
export async function updatePatientCloudFirst(localId: number, patch: Partial<Patient>): Promise<void> {
  const current = await db.patients.get(localId);
  if (!current) throw new Error("تعذر العثور على المريض. حدّث الصفحة ثم أعد المحاولة.");
  const cloudId = await uploadPatientRemote(current, localId, { migration: true });
  const fields = patientPayload(patch);
  const baseVersion = await versionFor("patients", cloudId);
  await applyEdit({ table: "patients", id: cloudId, op: "upsert", baseVersion, fields });
  try {
    await withCloudCacheMutation(() => db.patients.update(localId, patch));
  } catch {
    throw new Error("تم تأكيد الحفظ السحابي، لكن تعذر تحديث عرض هذا الجهاز. حدّث الصفحة لاسترجاع البيانات.");
  }
}

/** Create a clinical entry in the cloud first, then place its cache copy locally. */
export async function createClinicalRecordCloudFirst<T extends object>(
  table: ClinicalTable,
  value: T,
): Promise<number> {
  const clean = { ...(value as Record<string, unknown>) };
  delete clean.id;
  const cloudId = await uploadChildRemote(table, clean);
  try {
    const localId = await withCloudCacheMutation(() => db.table(table).add(clean as never));
    linkIds(table, Number(localId), cloudId);
    return Number(localId);
  } catch {
    throw new Error("تم تأكيد الحفظ السحابي، لكن تعذر تحديث عرض هذا الجهاز. حدّث الصفحة لاسترجاع السجل.");
  }
}

export async function updateClinicalRecordCloudFirst(
  table: ClinicalTable,
  localId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = (await db.table(table).get(localId)) as Record<string, unknown> | undefined;
  if (!current) throw new Error("تعذر العثور على السجل. حدّث الصفحة ثم أعد المحاولة.");
  const cloudId = await uploadChildRemote(table, current, localId, { migration: true });
  const fields = childPayload(patch);
  const remote = remoteTableName(table);
  const baseVersion = await versionFor(remote, cloudId);
  const parentCloudId = typeof current.patientId === "number" ? await cloudPatientId(current.patientId) : null;
  await applyEdit({ table: remote, id: cloudId, op: "upsert", baseVersion, fields, patientId: parentCloudId });
  try {
    await withCloudCacheMutation(() => db.table(table).update(localId, patch as never));
  } catch {
    throw new Error("تم تأكيد الحفظ السحابي، لكن تعذر تحديث عرض هذا الجهاز. حدّث الصفحة لاسترجاع السجل.");
  }
}

export async function deleteClinicalRecordCloudFirst(table: ClinicalTable, localId: number): Promise<void> {
  const current = (await db.table(table).get(localId)) as Record<string, unknown> | undefined;
  if (!current) return;
  const cloudId = await uploadChildRemote(table, current, localId, { migration: true });
  const remote = remoteTableName(table);
  const baseVersion = await versionFor(remote, cloudId);
  const parentCloudId = typeof current.patientId === "number" ? await cloudPatientId(current.patientId) : null;
  await applyEdit({ table: remote, id: cloudId, op: "delete", baseVersion, fields: {}, patientId: parentCloudId });
  await withCloudCacheMutation(() => db.table(table).delete(localId));
}

/** Patient and its attached clinical records are removed from active cloud views before cache cleanup. */
export async function deletePatientCloudFirst(localId: number): Promise<void> {
  const patient = await db.patients.get(localId);
  if (!patient) return;
  const cloudId = await uploadPatientRemote(patient, localId, { migration: true });
  const baseVersion = await versionFor("patients", cloudId);
  await applyEdit({ table: "patients", id: cloudId, op: "delete", baseVersion, fields: {} });
  const children: ClinicalTable[] = ["vitals", "notes", "sbar", "careplan", "rounds", "tranq", "assignments", "admissions"];
  await withCloudCacheMutation(async () => {
    await Promise.all(children.map((name) => db.table(name).where("patientId").equals(localId).delete()));
    await db.patients.delete(localId);
  });
}

export async function dischargePatientCloudFirst(localId: number, note: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const patient = await db.patients.get(localId);
  if (!patient) throw new Error("تعذر العثور على المريض.");
  const open = (await db.admissions.where("patientId").equals(localId).toArray()).find((a) => !a.dischargedAt);
  if (open?.id != null) {
    await updateClinicalRecordCloudFirst("admissions", open.id, { dischargedAt: today, dischargeNote: note });
  } else {
    await createClinicalRecordCloudFirst("admissions", {
      patientId: localId, admittedAt: patient.doa || today, dischargedAt: today, dischargeNote: note, createdAt: Date.now(),
    });
  }
  await updatePatientCloudFirst(localId, { dischargedAt: today, dischargeNote: note, updatedAt: Date.now() });
}

export async function readmitPatientCloudFirst(localId: number, admittedAt?: string): Promise<void> {
  const doa = admittedAt || new Date().toISOString().slice(0, 10);
  const open = (await db.admissions.where("patientId").equals(localId).toArray()).find((a) => !a.dischargedAt);
  if (!open) await createClinicalRecordCloudFirst("admissions", { patientId: localId, admittedAt: doa, createdAt: Date.now() });
  await updatePatientCloudFirst(localId, { doa, dischargedAt: undefined, dischargeNote: undefined, updatedAt: Date.now() });
}

/** Share ward leader settings through the same approved cloud edit RPC. */
export async function saveSharedSetting(key: string, value: string): Promise<void> {
  if (!key.startsWith("leader:")) {
    await withCloudCacheMutation(() => db.meta.put({ key, value }));
    return;
  }
  const { data, error } = await (supabase.from("ward_shift_settings") as any).select("id,version,deleted_at,data");
  if (error) throw cleanError(error);
  const found = ((data ?? []) as RemoteRow[]).find((row) => row.data?.key === key && !row.deleted_at);
  const cloudId = found?.id ?? getCloudId("ward_shift_settings", key) ?? newUuid();
  const baseVersion = found ? Number(found.version ?? 0) : 0;
  await applyEdit({
    table: "ward_shift_settings",
    id: cloudId,
    op: "upsert",
    baseVersion,
    fields: { key, value },
  });
  linkIds("ward_shift_settings", key, cloudId);
  await withCloudCacheMutation(() => db.meta.put({ key, value }));
}

/** Called only during first cloud initialization to preserve pre-existing local entries. */
export async function adoptLegacyPatient(localId: number, patient: Patient): Promise<void> {
  await uploadPatientRemote(patient, localId, { migration: true });
}

export async function adoptLegacyClinicalRecord(
  table: ClinicalTable,
  localId: number,
  record: Record<string, unknown>,
): Promise<void> {
  await uploadChildRemote(table, record, localId, { migration: true });
}

export async function clearClinicalMappings(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(MAP_PREFIX + ":") || key.startsWith(REVERSE_PREFIX + ":"))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Cache mappings are not authorization; cloud RLS remains authoritative.
  }
}
