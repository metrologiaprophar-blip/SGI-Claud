"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { inputClass } from "./field";
import { Icon } from "./icon";

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("common");
  return (
    <div className="relative">
      <Icon
        name="lock"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
      />
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(inputClass, "pr-10 pl-9", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
      >
        <Icon name={visible ? "eyeOff" : "eye"} className="size-4" />
      </button>
    </div>
  );
}
