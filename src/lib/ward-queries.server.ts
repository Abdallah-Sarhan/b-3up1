import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PATIENT_COLUMNS =
  "id, file_no, folder_no, name, age, sex, nationality, diagnosis, doctor, room, bed, doa, discharged_at, notes";

function requiredEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing env: one of ${names.join(", ")}`);
}

/** Supabase client that runs as the signed-in user (RLS applies). */
export function supabaseWithToken(token: string): SupabaseClient {
  return createClient(
    requiredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
    requiredEnv([
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    ]),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export async function wardSummary(supabase: SupabaseClient) {
  const [current, discharged] = await Promise.all([
    supabase.from("patients").select("room", { count: "exact" }).is("discharged_at", null),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .not("discharged_at", "is", null),
  ]);
  if (current.error) throw new Error(current.error.message);
  if (discharged.error) throw new Error(discharged.error.message);

  const rooms = [
    ...new Set(
      (current.data ?? [])
        .map((row) => (row as { room: string | null }).room?.trim())
        .filter((room): room is string => Boolean(room)),
    ),
  ].sort();

  return {
    current_patients: current.count ?? current.data?.length ?? 0,
    discharged_patients: discharged.count ?? 0,
    rooms_in_use: rooms,
  };
}

export async function listPatients(
  supabase: SupabaseClient,
  opts: { includeDischarged: boolean | null; limit: number | null },
) {
  const max = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  let query = supabase.from("patients").select(PATIENT_COLUMNS).order("folder_no").limit(max);
  if (!opts.includeDischarged) query = query.is("discharged_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { patients: data ?? [], count: data?.length ?? 0 };
}

export async function searchPatients(
  supabase: SupabaseClient,
  opts: { query: string; limit: number | null },
) {
  const term = opts.query.replace(/[%,()]/g, " ").trim();
  if (!term) return { patients: [], count: 0 };
  const max = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const pattern = `%${term}%`;

  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .or(
      [
        `name.ilike.${pattern}`,
        `file_no.ilike.${pattern}`,
        `folder_no.ilike.${pattern}`,
        `diagnosis.ilike.${pattern}`,
        `doctor.ilike.${pattern}`,
      ].join(","),
    )
    .limit(max);

  if (error) throw new Error(error.message);
  return { patients: data ?? [], count: data?.length ?? 0 };
}

export async function getPatient(supabase: SupabaseClient, fileNo: string) {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("file_no", fileNo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { patient: data ?? null };
}
