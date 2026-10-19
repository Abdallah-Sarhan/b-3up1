import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export const loginInput = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/), password: z.string().min(1).max(72) });
export const signupInput = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_]{3,30}$/), displayName: z.string().trim().min(1).max(80), password: z.string().min(8).max(72), recoveryEmail: z.string().trim().email().max(255) });
export async function desktopAuthAction(action: string, input: unknown, token: string | undefined, origin: string): Promise<unknown> {
if (action === "signIn") { const data=loginInput.parse(input);
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
}
if (action === "signUp") { const data=signupInput.parse(input);
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
}
if (action === "reset") {
const data=z.object({username:z.string().trim().min(1).max(30)}).parse(input);
try { if (/^[A-Za-z0-9_]{3,30}$/.test(data.username)) { const email=await emailForUsername(data.username); if(email) { const sb=await publicClient(); await sb.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/reset-password`}); } } } catch { /* Generic response prevents account enumeration. */ }
return {ok:true};
}
if (!token) throw new Error("Unauthorized");
const {supabaseWithToken}=await import("@/lib/ward-queries.server");
const sb: SupabaseClient=supabaseWithToken(token);
const {data:user,error}=await sb.auth.getUser();
if(error || !user.user) throw new Error("Unauthorized");
const {data:admin,error:roleError}=await sb.rpc("has_role",{_user_id:user.user.id,_role:"admin"});
if(roleError || !admin) throw new Error("Forbidden");
if(action === "listUsers") { const [{data:profiles,error:pe},{data:roles,error:re}]=await Promise.all([sb.from("profiles").select("id,login_name,display_name,approved,created_at").order("created_at"),sb.from("user_roles").select("user_id,role").eq("role","admin")]); if(pe || re) throw new Error("Read failed"); const admins=new Set((roles ?? []).map(r=>r.user_id)); return (profiles ?? []).map(p=>({...p,is_admin:admins.has(p.id)})); }
if(action === "setApproved") { const data=z.object({id:z.string().uuid(),approved:z.boolean()}).parse(input); if(data.id===user.user.id && !data.approved) throw new Error("Forbidden"); const {error}=await sb.from("profiles").update({approved:data.approved}).eq("id",data.id); if(error) throw new Error("Save failed"); return {ok:true}; }
throw new Error("Invalid action");
}
