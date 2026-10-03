type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What the switch controls, read out by screen readers (e.g. "Rule is active"). */
  label: string;
  disabled?: boolean;
};

/** An on/off switch. A real button with role="switch", so it works with Space and Enter. */
export default function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-ring disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-primary" : "bg-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
