import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Device password lock for the program.
 *
 * The lock is purely local (works offline, on the ward laptop) and does not
 * touch data or the cloud sync: it only decides whether the app UI is shown.
 * On first launch the user sets a password and receives a recovery code that
 * can be used later to set a new password if the password is forgotten.
 * Print pages are never locked (they open in their own window).
 */

const HASH_KEY = "ward39.lockHash";
const RECOVERY_KEY = "ward39.recoveryHash";
const SESSION_KEY = "ward39.unlocked";

async function hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(`ward39:${value}`);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0;
  for (const byte of data) h = (h * 31 + byte) >>> 0;
  return `f${h.toString(16)}`;
}

function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function generateRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  if (typeof globalThis.crypto?.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const raw = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function setRecoveryCode(code: string): Promise<void> {
  localStorage.setItem(RECOVERY_KEY, await hash(normalizeCode(code)));
}

export function hasRecoveryCode(): boolean {
  try {
    return Boolean(localStorage.getItem(RECOVERY_KEY));
  } catch {
    return false;
  }
}

export async function verifyRecoveryCode(code: string): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(RECOVERY_KEY);
  } catch {
    return false;
  }
  if (!stored) return false;
  return stored === (await hash(normalizeCode(code)));
}

/** Creates a fresh recovery code, stores its hash and returns it for display. */
export async function regenerateRecoveryCode(): Promise<string> {
  const code = generateRecoveryCode();
  await setRecoveryCode(code);
  return code;
}

export function getLockHash(): string | null {
  try {
    return localStorage.getItem(HASH_KEY);
  } catch {
    return null;
  }
}

export async function setAppPassword(password: string): Promise<void> {
  localStorage.setItem(HASH_KEY, await hash(password));
}

export async function verifyAppPassword(password: string): Promise<boolean> {
  const stored = getLockHash();
  if (!stored) return false;
  return stored === (await hash(password));
}

export function clearAppPassword(): void {
  try {
    localStorage.removeItem(HASH_KEY);
    localStorage.removeItem(RECOVERY_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function AppLock({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPrint = pathname.startsWith("/print");

  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"password" | "recover">("password");
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);

  useEffect(() => {
    let open = false;
    try {
      open = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    setNeedsSetup(!getLockHash());
    setUnlocked(open);
    setReady(true);
  }, []);

  const unlock = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setUnlocked(true);
    setPassword("");
    setConfirm("");
    setCode("");
    setError("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsSetup) {
      if (password.length < 4) {
        setError("كلمة السر يجب أن تكون 4 أحرف على الأقل");
        return;
      }
      if (password !== confirm) {
        setError("كلمتا السر غير متطابقتين");
        return;
      }
      await setAppPassword(password);
      const recovery = await regenerateRecoveryCode();
      setNeedsSetup(false);
      setError("");
      setPassword("");
      setConfirm("");
      setNewCode(recovery);
      return;
    }

    if (mode === "recover") {
      if (!hasRecoveryCode()) {
        setError("لا يوجد رمز استعادة محفوظ على هذا الجهاز");
        return;
      }
      if (!(await verifyRecoveryCode(code))) {
        setError("رمز الاستعادة غير صحيح");
        return;
      }
      if (password.length < 4) {
        setError("كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل");
        return;
      }
      if (password !== confirm) {
        setError("كلمتا السر غير متطابقتين");
        return;
      }
      await setAppPassword(password);
      const recovery = await regenerateRecoveryCode();
      setError("");
      setPassword("");
      setConfirm("");
      setCode("");
      setMode("password");
      setNewCode(recovery);
      return;
    }

    if (await verifyAppPassword(password)) unlock();
    else {
      setError("كلمة السر غير صحيحة");
      setPassword("");
    }
  };

  if (isPrint) return <>{children}</>;
  if (!ready) return null;

  if (newCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-base font-bold">رمز الاستعادة</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            احتفظ بهذا الرمز في مكان آمن. إذا نسيت كلمة السر يمكنك استخدامه لتعيين كلمة سر جديدة.
          </p>
          <div className="my-4 rounded-md border border-dashed border-border bg-muted p-3 text-lg font-bold tracking-widest">
            {newCode}
          </div>
          <button
            type="button"
            onClick={() => {
              setNewCode(null);
              unlock();
            }}
            className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            حفظت الرمز — متابعة
          </button>
        </div>
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  const recovering = mode === "recover";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Lock className="size-5" />
          </span>
          <h1 className="text-base font-bold">سجل مرضى جناح 39</h1>
          <p className="text-xs text-muted-foreground">
            {needsSetup
              ? "اختر كلمة سر لفتح البرنامج"
              : recovering
                ? "أدخل رمز الاستعادة وكلمة سر جديدة"
                : "أدخل كلمة السر لفتح البرنامج"}
          </p>
        </div>

        {recovering && (
          <input
            type="text"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="رمز الاستعادة (XXXX-XXXX-XXXX)"
            aria-label="رمز الاستعادة"
            className="mb-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        )}

        <input
          type="password"
          autoFocus={!recovering}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={recovering ? "كلمة السر الجديدة" : "كلمة السر"}
          aria-label={recovering ? "كلمة السر الجديدة" : "كلمة السر"}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        {(needsSetup || recovering) && (
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="تأكيد كلمة السر"
            aria-label="تأكيد كلمة السر"
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {needsSetup ? "حفظ كلمة السر والدخول" : recovering ? "تعيين كلمة سر جديدة" : "دخول"}
        </button>

        {!needsSetup && (
          <button
            type="button"
            onClick={() => {
              setMode(recovering ? "password" : "recover");
              setError("");
              setPassword("");
              setConfirm("");
              setCode("");
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {recovering ? "رجوع إلى إدخال كلمة السر" : "نسيت كلمة السر؟"}
          </button>
        )}
      </form>
    </div>
  );
}
