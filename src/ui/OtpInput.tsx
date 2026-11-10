import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { motionTokens, useSafeMotion } from "./motion";

const LEN = 6;

/** Six single-digit boxes: typing moves forward, Backspace moves back, pasting fills all of them. */
export function OtpInput({ value, onChange, autoFocus, disabled }:
  { value: string; onChange: (v: string) => void; autoFocus?: boolean; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const { reduce } = useSafeMotion();
  const digits = value.replace(/\D/g, "").slice(0, LEN).padEnd(LEN, " ").split("");

  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);

  const focus = (i: number) => refs.current[Math.max(0, Math.min(LEN - 1, i))]?.focus();
  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d || " ";
    onChange(next.join("").replace(/\s+$/, "").replace(/ /g, ""));
  };

  const onType = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "").slice(-1);
    if (!d) return;
    setAt(i, d);
    if (i < LEN - 1) focus(i + 1);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && digits[i] === " " && i > 0) {
      e.preventDefault();
      setAt(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focus(pasted.length >= LEN ? LEN - 1 : pasted.length);
  };

  return (
    <div className="otp" role="group" aria-label="6-digit code">
      {digits.map((d, i) => {
        const filled = d !== " ";
        return (
          <motion.input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className={`otp-box mono${filled ? " filled" : ""}`}
            aria-label={`Digit ${i + 1}`}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={filled ? d : ""}
            onChange={(e) => onType(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            animate={reduce ? undefined : { scale: filled ? [1, 1.08, 1] : 1 }}
            transition={{ duration: motionTokens.duration.fast, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
