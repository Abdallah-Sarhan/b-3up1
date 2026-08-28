import { useState, useRef, useEffect, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

interface SuggestInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onSelect"> {
  suggestions: string[];
  onSelect?: (value: string) => void;
}

export function SuggestInput({ suggestions, onSelect, className, onChange, onKeyDown, onFocus, onBlur, ...props }: SuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const visible = open && suggestions.length > 0;

  useEffect(() => {
    setActive(-1);
  }, [suggestions]);

  useEffect(() => {
    if (activeRef.current && listRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  function select(value: string) {
    setOpen(false);
    setActive(-1);
    onSelect?.(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) {
      onKeyDown?.(e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const value = active >= 0 && active < suggestions.length ? suggestions[active] : undefined;
      if (value) {
        e.preventDefault();
        select(value);
        return;
      }
      setOpen(false);
      setActive(-1);

    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative">
      <Input
        {...props}
        className={className}
        onChange={(e) => {
          setOpen(true);
          onChange?.(e);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // small delay so a mousedown on a suggestion can fire first
          setTimeout(() => {
            setOpen(false);
            setActive(-1);
          }, 150);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {visible && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {suggestions.map((s, i) => (
            <div
              key={s}
              ref={active === i ? activeRef : null}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm text-foreground hover:bg-accent",
                active === i && "bg-accent text-accent-foreground",
              )}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
