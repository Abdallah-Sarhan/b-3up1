import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,30}$/, "اسم المستخدم 3–30 حرفًا (أحرف إنجليزية، أرقام، _)");
export const passwordSchema = z.string().min(8, "كلمة السر 8 أحرف على الأقل").max(72);

const GENERIC_LOGIN_ERROR = "اسم المستخدم أو كلمة السر غير صحيحة";

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Server-only: resolves a username to its auth email. Never returned to the client. */
async function emailForUsername(username: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("login_name", username.replace(/_/g, "\\_"))
    .maybeSingle();
  if (!data) return null;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.id);
  return u.user?.email ?? null;
}

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: usernameSchema, password: z.string().min(1).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = await emailForUsername(data.username);
    if (!email) return { ok: false as const, error: GENERIC_LOGIN_ERROR };
    const sb = await publicClient();
    const { data: s, error } = await sb.auth.signInWithPassword({ email, password: data.password });
    if (error || !s.session) return { ok: false as const, error: GENERIC_LOGIN_ERROR };
    return {
      ok: true as const,
      access_token: s.session.access_token,
      refresh_token: s.session.refresh_token,
    };
  });

export const signUpWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: usernameSchema,
        displayName: z.string().trim().min(1, "أدخل الاسم الظاهر").max(80),
        password: passwordSchema,
        recoveryEmail: z.string().trim().email("بريد غير صالح").max(255),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("login_name", data.username.replace(/_/g, "\\_"))
      .maybeSingle();
    if (taken) return { ok: false as const, error: "اسم المستخدم مستخدم بالفعل" };
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.recoveryEmail.toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { login_name: data.username, display_name: data.displayName },
    });
    if (error) {
      const msg = /already|registered|exists/i.test(error.message)
        ? "هذا البريد مسجّل لحساب آخر"
        : /password/i.test(error.message)
          ? "كلمة السر ضعيفة أو مسرّبة، اختر غيرها"
          : "تعذّر إنشاء الحساب";
      return { ok: false as const, error: msg };
    }
    return { ok: true as const };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(1).max(30) }).parse(d))
  .handler(async ({ data }) => {
    try {
      if (/^[A-Za-z0-9_]{3,30}$/.test(data.username)) {
        const email = await emailForUsername(data.username);
        if (email) {
          const origin = getRequestHeader("origin") ?? "";
          const sb = await publicClient();
          await sb.auth.resetPasswordForEmail(email, {
            redirectTo: origin.startsWith("http") ? `${origin}/reset-password` : undefined,
          });
        }
      }
    } catch (e) {
      console.error("reset request failed", e);
    }
    return { ok: true as const };
  });

export type ManagedUser = {
  id: string;
  login_name: string;
  display_name: string;
  approved: boolean;
  is_admin: boolean;
  created_at: string;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("غير مسموح");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertAdmin(context);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, login_name, display_name, approved, created_at")
        .order("created_at"),
      context.supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    const admins = new Set((roles ?? []).map((r) => r.user_id));
    return (profiles ?? []).map((p) => ({ ...p, is_admin: admins.has(p.id) }));
  });

export const setApproved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approved: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId && !data.approved) throw new Error("لا يمكنك إيقاف حسابك");
    const { error } = await context.supabase
      .from("profiles")
      .update({ approved: data.approved })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر الحفظ");
    return { ok: true };
  });
