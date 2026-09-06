import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { Button, Input } from "@/components/ui-kit";

/**
 * In-app confirmation dialog.
 *
 * Windows' native prompt()/confirm() steal keyboard focus from the renderer and
 * on some Windows 10 machines the focus is never handed back, which makes every
 * field look frozen. Everything is therefore confirmed inside the app instead.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  withNote = false,
  noteLabel,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  withNote?: boolean;
  noteLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
        {withNote ? (
          <div className="mt-4">
            {noteLabel ? (
              <label className="mb-1.5 block text-sm font-medium">{noteLabel}</label>
            ) : null}
            <Input value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => onConfirm(note)}
          >
            {confirmLabel ?? t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
