import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Device password lock for the program.
 *
 * The lock is purely local (works offline, on the ward laptop) and does not
 * touch data or the cloud sync: it only decides whether the app UI is shown.
 * On first launch the user sets a password; afterwards it is asked on every
 * start. Print pages are never locked (they open in their own window).
 */

const HASH_KEY = "ward39.lockHash";
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
      setNeedsSetup(false);
      unlock();
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
  if (unlocked) return <>{children}</>;

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
            {needsSetup ? "اختر كلمة سر لفتح البرنامج" : "أدخل كلمة السر لفتح البرنامج"}
          </p>
        </div>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة السر"
          aria-label="كلمة السر"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        {needsSetup && (
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
          {needsSetup ? "حفظ كلمة السر والدخول" : "دخول"}
        </button>
      </form>
    </div>
  );
}
