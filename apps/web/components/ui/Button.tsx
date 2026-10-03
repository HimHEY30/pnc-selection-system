import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-ring disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  // White text is only ever used on the dark blue.
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-neutral-soft disabled:text-ink-muted",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-canvas disabled:bg-neutral-soft disabled:text-ink-muted",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-sm",
};

/** Class names for anything that should look like a button, such as a <Link>. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export default function Button({ variant = "secondary", size = "md", type = "button", className, ...rest }: Props) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className ?? ""}`} {...rest} />;
}
