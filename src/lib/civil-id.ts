import { supabase } from "@/integrations/supabase/client";

/**
 * Civil ID images: private cloud bucket "civil-ids", indexed by file number in
 * patient_documents. Sensitive — never logged, exported, synced or sent to AI.
 */
export type Side = "front" | "back";
const BUCKET = "civil-ids";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export const OFFLINE_MSG = "البطاقة المدنية تحتاج اتصالاً بالإنترنت. تحقّق من الاتصال وحاول مجددًا.";

function ensureOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE_MSG);
}

function friendly(e: unknown): Error {
  if (typeof navigator !== "undefined" && !navigator.onLine) return new Error(OFFLINE_MSG);
  const m = e instanceof Error ? e.message : "";
  if (/fetch|network/i.test(m)) return new Error(OFFLINE_MSG);
  return new Error("تعذّر تنفيذ العملية. تأكد من تسجيل الدخول وأن حسابك معتمد.");
}

export function validateFile(file: File): string | null {
  if (!TYPES.includes(file.type)) return "يُسمح فقط بصور JPG أو PNG أو WEBP.";
  if (file.size > MAX_BYTES) return "حجم الصورة أكبر من 5 ميغابايت.";
  return null;
}

export async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("compress"))), "image/jpeg", 0.8),
  );
}

export type DocRow = { front_path: string | null; back_path: string | null };

export async function getDocs(fileNo: string): Promise<DocRow | null> {
  ensureOnline();
  const { data, error } = await supabase
    .from("patient_documents")
    .select("front_path, back_path")
    .eq("file_no", fileNo.trim())
    .maybeSingle();
  if (error) throw friendly(error);
  return data;
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw friendly(error);
  return data.signedUrl;
}

export async function uploadSide(fileNo: string, side: Side, file: File) {
  ensureOnline();
  const fn = fileNo.trim();
  try {
    const blob = await compressImage(file);
    const path = `${encodeURIComponent(fn)}/${side}-${Date.now()}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const old = await getDocs(fn);
    const col = side === "front" ? "front_path" : "back_path";
    const { error } = await supabase
      .from("patient_documents")
      .upsert({ file_no: fn, [col]: path }, { onConflict: "file_no" });
    if (error) throw error;
    const prev = old?.[col];
    if (prev) await supabase.storage.from(BUCKET).remove([prev]);
  } catch (e) {
    throw friendly(e);
  }
}

export async function removeSide(fileNo: string, side: Side) {
  ensureOnline();
  const fn = fileNo.trim();
  const old = await getDocs(fn);
  const col = side === "front" ? "front_path" : "back_path";
  const prev = old?.[col];
  if (prev) await supabase.storage.from(BUCKET).remove([prev]);
  const { error } = await supabase.from("patient_documents").update({ [col]: null }).eq("file_no", fn);
  if (error) throw friendly(error);
}

/** Best effort: called when a patient is deleted. Silently skipped offline. */
export async function removeAllForFileNo(fileNo: string) {
  const fn = fileNo?.trim();
  if (!fn || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  try {
    const old = await getDocs(fn);
    const paths = [old?.front_path, old?.back_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    await supabase.from("patient_documents").delete().eq("file_no", fn);
  } catch {
    /* ignore */
  }
}
