import type Dexie from "dexie";
import { db as wardDB, withCloudCacheMutation, type Patient } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import {
  adoptLegacyClinicalRecord,
  adoptLegacyPatient,
  clearClinicalMappings,
  getCloudId,
  getLocalId,
  linkIds,
  setCloudVersion,
  remoteTableName,
  saveSharedSetting,
  type ClinicalTable,
} from "@/lib/clinical-cloud";

type RemoteRow = {
  id: string;
  file_no?: string;
  name?: string;
  nationality?: string;
  diagnosis?: string;
  folder_no?: string;
  age?: string;
  doctor?: string;
  cid?: string;
  doa?: string;
  dob?: string;
  sex?: string;
  room?: string;
  bed?: string;
  marital_status?: string;
  notes?: string;
  discharged_at?: string | null;
  discharge_note?: string | null;
  updated_at?: number;
  created_at?: number;
  version?: number;
  changed_at?: number;
  deleted_at?: string | null;
  patient_id?: string | null;
  data?: Record<string, unknown>;
  sync_seq?: number | null;
};


const CLINICAL_TABLES: ClinicalTable[] = [
  "vitals", "notes", "sbar", "careplan", "rounds",
  "tranq", "assignments", "admissions", "meds",
];

const REALTIME_TABLES = [
  "patients",
  "patient_vitals",
  "patient_nurse_notes",
  "patient_sbar",
  "patient_care_plans",
  "patient_rounds",
  "patient_tranquilizer_events",
  "patient_admissions",
  "staff_assignments",
  "medication_register",
  "ward_shift_settings",
] as const;

const PAGE_SIZE = 500;
const POLL_INTERVAL_MS = 30_000;
const LEGACY_MARKER = "ward39.cloud.initialized.v2";
const ACTIVE_USER_MARKER = "ward39.cloud.active-user";

let initialization: Promise<void> | null = null;
let initializationUserId: string | null = null;
let refreshInFlight: Promise<void> | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastErrorMessage: string | null = null;
let cacheClearPromise: Promise<void> | null = null;
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

function assertOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("لا يوجد اتصال بالإنترنت. لم يتم فتح بيانات محلية باعتبارها بيانات سحابية؛ اتصل بالإنترنت وأعد المحاولة.");
  }
}

function safeError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (typeof navigator !== "undefined" && !navigator.onLine || /fetch|network|timeout|load failed/i.test(raw)) {
    return new Error("تعذر الاتصال بسحابة Lovable Cloud. لم يتم تأكيد المزامنة؛ افحص الإنترنت ثم أعد المحاولة.");
  }
  if (/not approved|42501|row-level security|permission denied/i.test(raw)) {
    return new Error("هذا الحساب غير معتمد أو لا يملك صلاحية الوصول إلى البيانات السريرية.");
  }
  return new Error(raw || "تعذر تحميل البيانات من سحابة Lovable Cloud.");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((k) => `${JSON.stringify(k)}:${stable(row[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function fetchAllRows(table: string): Promise<RemoteRow[]> {
  const all: RemoteRow[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await (supabase.from(table as never) as any)
      .select("*")
      .order("sync_seq", { ascending: true, nullsFirst: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw safeError(error);
    const page = (data ?? []) as RemoteRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

type CloudPatientView = Omit<Patient, "id" | "dischargedAt" | "dischargeNote"> & { dischargedAt: string; dischargeNote: string };

function cloudPatient(row: RemoteRow): CloudPatientView {
  const out: Record<string, unknown> = {
    fileNo: typeof row.file_no === "string" && row.file_no.startsWith("~") ? "" : (row.file_no ?? ""),
    name: row.name ?? "",
    nationality: row.nationality ?? "",
    diagnosis: row.diagnosis ?? "",
    folderNo: row.folder_no ?? "",
    age: row.age ?? "",
    doctor: row.doctor ?? "",
    cid: row.cid ?? "",
    doa: row.doa ?? "",
    dob: row.dob ?? "",
    sex: row.sex ?? "",
    room: row.room ?? "",
    bed: row.bed ?? "",
    maritalStatus: row.marital_status ?? "",
    notes: row.notes ?? "",
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    dischargedAt: row.discharged_at ?? "",
    dischargeNote: row.discharge_note ?? "",
  };
  return out as CloudPatientView;
}

function localPatientMatch(rows: Patient[], row: RemoteRow): Patient | undefined {
  const mapped = getLocalId("patients", row.id);
  if (mapped != null && typeof mapped === "number") return rows.find((p) => p.id === mapped);
  const fileNo = typeof row.file_no === "string" && !row.file_no.startsWith("~") ? row.file_no.trim() : "";
  if (fileNo) return rows.find((p) => p.fileNo.trim() === fileNo);
  const cid = String(row.cid ?? "").trim();
  if (cid) return rows.find((p) => p.cid.trim() === cid && p.name === (row.name ?? ""));
  const name = String(row.name ?? "").trim();
  if (name && Number(row.created_at ?? 0) > 0) {
    return rows.find((p) => p.name.trim() === name && p.createdAt === Number(row.created_at));
  }
  return undefined;
}

async function removeLocalPatient(patient: Patient): Promise<void> {
  const id = patient.id;
  if (id == null) return;
  await withCloudCacheMutation(async () => {
    await Promise.all(CLINICAL_TABLES.map((name) => wardDB.table(name).where("patientId").equals(id).delete()));
    await wardDB.patients.delete(id);
  });
}

async function pullPatients(): Promise<void> {
  const remote = await fetchAllRows("patients");
  const local = (await wardDB.patients.toArray()) as Patient[];
  for (const row of remote) {
    const existing = localPatientMatch(local, row);
    if (row.deleted_at) {
      if (existing) {
        await removeLocalPatient(existing);
      }
      continue;
    }
    const value = cloudPatient(row);
    if (existing?.["id"] != null) {
      if (getCloudVersion("patients", existing["id"]!) !== Number(row.version ?? 0)) {
        await withCloudCacheMutation(() => wardDB.patients.update(existing["id"]!, value));
      }
      linkIds("patients", existing.id, row.id);
      setCloudVersion("patients", existing.id, Number(row.version ?? 0));
      existing.fileNo = value.fileNo;
      existing.name = value.name;
      existing.nationality = value.nationality;
      existing.diagnosis = value.diagnosis;
      existing.folderNo = value.folderNo;
      existing.age = value.age;
      existing.doctor = value.doctor;
      existing.cid = value.cid;
      existing.doa = value.doa;
      existing.dob = value.dob;
      existing.sex = value.sex;
      existing.room = value.room;
      existing.bed = value.bed;
      existing.maritalStatus = value.maritalStatus;
      existing.notes = value.notes;
      existing.dischargedAt = value.dischargedAt;
      existing.dischargeNote = value.dischargeNote;
      existing.updatedAt = value.updatedAt;
      existing.createdAt = value.createdAt;
    } else {
      const newId = await withCloudCacheMutation(() => wardDB.patients.add(value));
      linkIds("patients", Number(newId), row.id);
      setCloudVersion("patients", Number(newId), Number(row.version ?? 0));
      const added = { ...value, id: Number(newId) };
      local.push(added);
    }
  }
}

const LOCAL_IDENTITY_FIELDS: Record<ClinicalTable, string[]> = {
  vitals: ["date", "time"],
  notes: ["date", "time"],
  sbar: ["date", "shift"],
  careplan: ["dateIdentified", "problemNo", "problem"],
  rounds: ["date"],
  tranq: ["date", "time", "drug", "dose", "givenBy"],
  assignments: ["date", "shift"],
  admissions: ["admittedAt", "createdAt"],
  meds: ["createdAt", "category", "drug", "patient"],
};

function localChildMatch(
  localRows: Record<string, unknown>[],
  table: ClinicalTable,
  remote: RemoteRow,
  parentLocalId: number | null,
): Record<string, unknown> | undefined {
  const mapped = getLocalId(table, remote.id);
  if (typeof mapped === "number") return localRows.find((r) => r["id"] === mapped);
  if (remote.patient_id && parentLocalId == null) return undefined;
  const data = remote.data ?? {};
  return localRows.find((row) => {
    if (parentLocalId != null && Number(row["patientId"]) !== parentLocalId) return false;
    const { id: _id, patientId: _patientId, ...rest } = row;
    if (stable(rest) === stable(data)) return true;
    return LOCAL_IDENTITY_FIELDS[table].every((key) =>
      rest[key] !== undefined && rest[key] !== null &&
      data[key] !== undefined && data[key] !== null &&
      String(rest[key]) === String(data[key])
    );
  });
}

async function pullClinicalTable(table: ClinicalTable): Promise<void> {
  const remoteName = remoteTableName(table);
  const remoteRows = await fetchAllRows(remoteName);
  const localRows = (await wardDB.table(table).toArray()) as Record<string, unknown>[];
  for (const row of remoteRows) {
    const parentLocal = row.patient_id ? getLocalId("patients", row.patient_id) : null;
    const parentLocalId = typeof parentLocal === "number" ? parentLocal : null;
    const existing = localChildMatch(localRows, table, row, parentLocalId);
    if (row.deleted_at) {
      if (existing?.["id"] != null) {
        await withCloudCacheMutation(() => wardDB.table(table).delete(existing["id"] as number));
      }
      continue;
    }
    if (row.patient_id && parentLocalId == null) {
      // Do not silently detach a clinical entry from its patient when a parent
      // row cannot be resolved on this device.
      throw new Error("تعذر ربط أحد السجلات السريرية بالمريض في السحابة. أوقفنا العرض لمنع ربط البيانات بمريض خطأ؛ راجع المشرف.");
    }
    const fields = { ...(row.data ?? {}) } as Record<string, unknown>;
    const value = { ...fields, ...(parentLocalId != null ? { patientId: parentLocalId } : {}) };
    if (existing?.["id"] != null) {
      if (getCloudVersion(table, existing["id"] as number) !== Number(row.version ?? 0)) {
        await withCloudCacheMutation(() => wardDB.table(table).update(existing["id"] as number, value as never));
      }
      linkIds(table, existing["id"] as number, row.id);
      setCloudVersion(table, existing["id"] as number, Number(row.version ?? 0));
      Object.assign(existing, value);
    } else {
      const localId = await withCloudCacheMutation(() => wardDB.table(table).add(value as never));
      linkIds(table, Number(localId), row.id);
      setCloudVersion(table, Number(localId), Number(row.version ?? 0));
      localRows.push({ ...value, id: Number(localId) });
    }
  }
}

async function pullSharedSettings(): Promise<void> {
  const rows = await fetchAllRows("ward_shift_settings");
  for (const row of rows) {
    if (row.deleted_at || !row.data || typeof row.data["key"] !== "string" || typeof row.data["value"] !== "string") continue;
    await wardDB.meta.put({ key: row.data["key"], value: row.data["value"] });
    linkIds("ward_shift_settings", row.data["key"], row.id);
    setCloudVersion("ward_shift_settings", row.data["key"], Number(row.version ?? 0));
  }
}

async function migrateUnlinkedLegacyCache(db: Dexie): Promise<void> {
  // Existing local data is imported only when it has no cloud link. Known cloud
  // rows are never uploaded from an old cache and therefore cannot roll back
  // newer edits made on another device.
  const patients = (await db.table("patients").toArray()) as Patient[];
  for (const patient of patients) {
    if (patient.id == null) continue;
    if (getCloudId("patients", patient.id)) continue;
    await adoptLegacyPatient(patient.id, patient);
  }

  for (const table of CLINICAL_TABLES) {
    const entries = (await db.table(table).toArray()) as Record<string, unknown>[];
    for (const entry of entries) {
      if (typeof entry["id"] !== "number" || getCloudId(table, entry["id"])) continue;
      await adoptLegacyClinicalRecord(table, entry["id"], entry);
    }
  }

  const settings = await db.table("meta").toArray() as Array<{ key: string; value: string }>;
  for (const setting of settings) {
    if (!setting.key.startsWith("leader:") || getCloudId("ward_shift_settings", setting.key)) continue;
    await saveSharedSetting(setting.key, setting.value);
  }
}

async function assertApprovedSession(): Promise<string> {
  assertOnline();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw safeError(error);
  const userId = data.session?.user.id;
  if (!userId) throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد فتح البرنامج.");
  const { data: approved, error: approvalError } = await supabase.rpc("is_approved", { _user_id: userId });
  if (approvalError) throw safeError(approvalError);
  if (!approved) throw new Error("حسابك ينتظر موافقة المشرف أو لم يعد معتمدًا للوصول إلى بيانات المرضى.");
  return userId;
}

async function pullAllCloudData(): Promise<void> {
  assertOnline();
  await pullPatients();
  for (const table of CLINICAL_TABLES) await pullClinicalTable(table);
  await pullSharedSettings();
}

function scheduleRealtimeRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void refreshCloudViews().catch(() => {
      lastErrorMessage = "تعذر تحديث البيانات الفورية من السحابة.";
    });
  }, 250);
}

async function refreshCloudViews(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    assertOnline();
    await pullAllCloudData();
    lastErrorMessage = null;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function stopLiveSync(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (typeof window !== "undefined") {
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    if (offlineHandler) window.removeEventListener("offline", offlineHandler);
  }
  onlineHandler = null;
  offlineHandler = null;
}

function startLiveSync(): void {
  stopLiveSync();
  realtimeChannel = supabase.channel("ward39-clinical-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, scheduleRealtimeRefresh);
  for (const table of REALTIME_TABLES.filter((name) => name !== "patients")) {
    realtimeChannel = realtimeChannel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRealtimeRefresh);
  }
  realtimeChannel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      // Polling is the fallback; the screen is never told a failed save succeeded.
      lastErrorMessage = "التحديث الفوري غير متاح حاليًا؛ يتم التحقق من السحابة دوريًا.";
    }
  });
  pollTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void refreshCloudViews().catch(() => {
      lastErrorMessage = "تعذر تحديث البيانات من السحابة؛ تحقّق من الاتصال.";
    });
  }, POLL_INTERVAL_MS);
  if (typeof window !== "undefined") {
    onlineHandler = scheduleRealtimeRefresh;
    offlineHandler = () => {
      lastErrorMessage = "انقطع الاتصال. الحفظ متوقف حتى استعادة اتصال السحابة.";
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
  }
}

/**
 * Cloud is the source of truth. AuthGate calls this only after a current,
 * approved Supabase session exists. Any startup error prevents clinical screens
 * from rendering, rather than presenting old IndexedDB data as current.
 */
export async function initializeClinicalCloud(db: Dexie = wardDB): Promise<void> {
  const userId = await assertApprovedSession();
  if (initialization && initializationUserId === userId) return initialization;
  if (initializationUserId && initializationUserId !== userId) {
    stopLiveSync();
    await refreshInFlight?.catch(() => undefined);
    await withCloudCacheMutation(async () => {
      for (const table of db.tables) await table.clear();
    });
    await clearClinicalMappings();
    initialization = null;
  }
  initializationUserId = userId;
  initialization = (async () => {
    try {
      // Never reuse another account's browser cache or cloud-id mappings.
      let previousUser: string | null = null;
      try { previousUser = localStorage.getItem(ACTIVE_USER_MARKER); } catch { /* no local marker */ }
      if (previousUser && previousUser !== userId) {
        await withCloudCacheMutation(async () => {
          for (const table of db.tables) await table.clear();
        });
        await clearClinicalMappings();
      }
      // Claim this browser cache for the current user before migration starts.
      // If migration fails and they sign out, the next user's session will still
      // detect the owner mismatch and clear this cache rather than importing it.
      try { localStorage.setItem(ACTIVE_USER_MARKER, userId); } catch { /* session auth still applies */ }
      const marker = (() => {
        try { return localStorage.getItem(`${LEGACY_MARKER}:${userId}`); } catch { return null; }
      })();
      // First reconcile cloud records and tombstones with this device cache.
      // Then migrate only the rows that are still genuinely local-only, and
      // pull once more so newly imported rows have confirmed cloud identities.
      await pullAllCloudData();
      if (marker !== "done") {
        await migrateUnlinkedLegacyCache(db);
        await pullAllCloudData();
      }
      try {
        localStorage.setItem(`${LEGACY_MARKER}:${userId}`, "done");
        localStorage.setItem(ACTIVE_USER_MARKER, userId);
      } catch { /* cloud mappings still work */ }
      lastErrorMessage = null;
      startLiveSync();
    } catch (error) {
      initialization = null;
      initializationUserId = null;
      stopLiveSync();
      throw safeError(error);
    }
  })();
  return initialization;
}

/** Retry path used by AuthGate after network or cloud settings are repaired. */
export async function retryClinicalCloudInitialization(): Promise<void> {
  initialization = null;
  initializationUserId = null;
  await initializeClinicalCloud(wardDB);
}

export function getClinicalCloudStatus(): { online: boolean; warning: string | null } {
  return {
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    warning: lastErrorMessage,
  };
}

/** Stop subscriptions and remove the local clinical view cache without deleting cloud data. */
export async function stopClinicalCloudSync(): Promise<void> {
  stopLiveSync();
  initialization = null;
  initializationUserId = null;
}

export async function clearClinicalCloudCache(): Promise<void> {
  if (cacheClearPromise) return cacheClearPromise;
  cacheClearPromise = (async () => {
    stopLiveSync();
    await refreshInFlight?.catch(() => undefined);
    // Never erase the only copy of data after an incomplete/failed migration.
    let safelyMigrated = false;
    try {
      const activeUser = localStorage.getItem(ACTIVE_USER_MARKER);
      safelyMigrated = Boolean(activeUser && localStorage.getItem(LEGACY_MARKER + ":" + activeUser) === "done");
    } catch {
      safelyMigrated = false;
    }

    if (safelyMigrated) {
      await withCloudCacheMutation(async () => {
        for (const table of wardDB.tables) await table.clear();
      });
      await clearClinicalMappings();
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(LEGACY_MARKER + ":") || key === ACTIVE_USER_MARKER) localStorage.removeItem(key);
        }
      } catch {
        // Cloud data remains authoritative even if device-side cleanup fails.
      }
    }

    initialization = null;
    initializationUserId = null;
  })().finally(() => {
    cacheClearPromise = null;
  });
  return cacheClearPromise;
}

/** Explicitly clear only device-side ID mappings; no cloud clinical data is deleted. */
export async function resetClinicalCloudMappings(): Promise<void> {
  await clearClinicalMappings();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_MARKER + ":")) localStorage.removeItem(key);
    }
  } catch { /* cache-only cleanup */ }
}
