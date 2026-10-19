import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/, "اسم المستخدم 3–30 حرفًا (أحرف إنجليزية، أرقام، _)");
export const passwordSchema = z.string().min(8, "كلمة السر 8 أحرف على الأقل").max(72);

async function call(action: string, data?: unknown) {
  if (!navigator.onLine) throw new Error("الدخول يحتاج اتصالاً بالإنترنت");
  const { data: session } = await supabase.auth.getSession();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (session.session) headers.set("Authorization", `Bearer ${session.session.access_token}`);
  try {
    const response = await fetch("https://b-3up1.lovable.app/api/public/desktop-auth", {
      method: "POST", headers, body: JSON.stringify({ action, data }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("تعذّر تنفيذ الطلب؛ تحقق من الاتصال ونشر تحديث الدخول");
    return await response.json();
  } catch {
    throw new Error("تعذّر الاتصال بخدمة الدخول؛ تحقق من الإنترنت ونشر تحديث الدخول");
  }
}

export const signInWithUsername = ({ data }: { data: unknown }) => call("signIn", data);
export const signUpWithUsername = ({ data }: { data: unknown }) => call("signUp", data);
export const requestPasswordReset = ({ data }: { data: unknown }) => call("reset", data);
export const listUsers = () => call("listUsers");
export const setApproved = ({ data }: { data: unknown }) => call("setApproved", data);
