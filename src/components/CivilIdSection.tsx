import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, Printer, Trash2, Upload, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui-kit";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDocs, removeSide, signedUrl, uploadSide, validateFile, type Side } from "@/lib/civil-id";

export function CivilIdSection({ fileNo, patientId }: { fileNo: string; patientId: string }) {
  const [urls, setUrls] = useState<Record<Side, string | null>>({ front: null, back: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Side | null>(null);
  const [askDelete, setAskDelete] = useState<Side | null>(null);
  const fn = fileNo.trim();

  async function refresh() {
    if (!fn) return setLoading(false);
    setLoading(true);
    setError(null);
    try {
      const row = await getDocs(fn);
      setUrls({
        front: row?.front_path ? await signedUrl(row.front_path) : null,
        back: row?.back_path ? await signedUrl(row.back_path) : null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [fn]);

  async function onFile(side: Side, file?: File) {
    if (!file) return;
    const bad = validateFile(file);
    if (bad) return toast.error(bad);
    setBusy(side);
    try {
      await uploadSide(fn, side, file);
      toast.success("تم حفظ الصورة");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(side: Side) {
    setAskDelete(null);
    setBusy(side);
    try {
      await removeSide(fn, side);
      toast.success("تم حذف الصورة");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title="البطاقة المدنية (Civil ID)" />
      <div className="space-y-4 p-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          تُحفظ الصورة بشكل خاص ويصل إليها الموظفون المعتمدون فقط
        </p>
        {!fn ? (
          <p className="text-sm text-muted-foreground">أضف رقم الملف للمريض أولاً لتتمكن من رفع البطاقة المدنية.</p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void refresh()}>إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["front", "back"] as Side[]).map((side) => (
                <Slot
                  key={side}
                  label={side === "front" ? "الوجه" : "الخلف"}
                  url={urls[side]}
                  loading={loading}
                  busy={busy === side}
                  onFile={(f) => void onFile(side, f)}
                  onDelete={() => setAskDelete(side)}
                />
              ))}
            </div>
            <Link to="/print/$patientId/civilid" params={{ patientId }}>
              <Button variant="outline"><Printer />طباعة البطاقة المدنية</Button>
            </Link>
          </>
        )}
      </div>
      <ConfirmDialog
        open={askDelete !== null}
        title="حذف صورة البطاقة المدنية؟"
        confirmLabel="حذف"
        destructive
        onConfirm={() => askDelete && void onDelete(askDelete)}
        onCancel={() => setAskDelete(null)}
      />
    </Card>
  );
}

function Slot({ label, url, loading, busy, onFile, onDelete }: {
  label: string; url: string | null; loading: boolean; busy: boolean;
  onFile: (f?: File) => void; onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0]);
    e.target.value = "";
  };
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-sm font-medium">{label}</div>
      <div className="flex aspect-[85.6/54] items-center justify-center overflow-hidden rounded-md bg-muted">
        {loading || busy ? (
          <span className="text-xs text-muted-foreground">جارٍ التحميل…</span>
        ) : url ? (
          <img src={url} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">لا توجد صورة</span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload />{url ? "استبدال" : "رفع"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => camRef.current?.click()}>
          <Camera />الكاميرا
        </Button>
        {url ? (
          <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
            <Trash2 />حذف
          </Button>
        ) : null}
      </div>
    </div>
  );
}
