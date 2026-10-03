import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Styled native controls. They stay real <input>/<select>/<textarea> elements so
// keyboard, autofill and screen readers all behave as users expect.

const BASE =
  "w-full rounded-lg border bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-muted focus-ring disabled:cursor-not-allowed disabled:bg-neutral-soft disabled:text-ink-muted";

function border(invalid: boolean | undefined) {
  return invalid ? "border-danger" : "border-line-strong";
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${border(rest["aria-invalid"] === true || rest["aria-invalid"] === "true")} ${className ?? ""}`} {...rest} />;
}

export function Textarea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={`${BASE} resize-y ${border(rest["aria-invalid"] === true || rest["aria-invalid"] === "true")} ${className ?? ""}`}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${BASE} ${border(rest["aria-invalid"] === true || rest["aria-invalid"] === "true")} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </select>
  );
}
