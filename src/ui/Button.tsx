import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "primary" | "ghost";
export function Button({ variant = "default", icon, active, className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: boolean; active?: boolean }) {
  const cls = ["btn", variant !== "default" && variant, icon && "icon", active && "active", className]
    .filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest} />;
}
