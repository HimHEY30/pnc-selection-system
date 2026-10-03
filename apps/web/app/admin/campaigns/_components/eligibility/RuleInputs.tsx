"use client";

import { useId } from "react";
import { Select, TextInput } from "@/components/ui/inputs";
import type { Catalogue, CatalogueField, CatalogueOperator, RuleType, TargetProvince } from "@/lib/eligibility/types";
import { t } from "@/lib/messages";

// The three inputs of a rule row: which field, how to compare it, and the value(s). The
// comparison list and the kind of value input follow the field, and both come from the
// catalogue, so a new field needs no change here.

type Common = {
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
};

const aria = ({ invalid, describedBy }: Common) => ({
  "aria-invalid": invalid ? (true as const) : undefined,
  "aria-describedby": describedBy,
});

export function FieldSelect({
  catalogue,
  value,
  onChange,
  ...common
}: Common & { catalogue: Catalogue; value: string; onChange: (key: string) => void }) {
  return (
    <Select
      aria-label={t.eligibility.ui.rule.field}
      value={value}
      disabled={common.disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={common.onBlur}
      {...aria(common)}
    >
      {!catalogue.fields.some((f) => f.key === value) && <option value="">{t.eligibility.ui.rule.choose}</option>}
      {catalogue.fields.map((field) => (
        <option key={field.key} value={field.key}>
          {field.label}
        </option>
      ))}
    </Select>
  );
}

export function OperatorSelect({
  field,
  value,
  onChange,
  ...common
}: Common & { field: CatalogueField | undefined; value: string; onChange: (key: string) => void }) {
  const operators = field?.operators ?? [];
  return (
    <Select
      aria-label={t.eligibility.ui.rule.operator}
      value={value}
      disabled={common.disabled || !field}
      onChange={(e) => onChange(e.target.value)}
      onBlur={common.onBlur}
      {...aria(common)}
    >
      {!operators.some((o) => o.key === value) && <option value="">{t.eligibility.ui.rule.choose}</option>}
      {operators.map((operator) => (
        <option key={operator.key} value={operator.key}>
          {operator.label}
        </option>
      ))}
    </Select>
  );
}

export function TypeSelect({
  value,
  onChange,
  ...common
}: Common & { value: RuleType; onChange: (type: RuleType) => void }) {
  return (
    <Select
      aria-label={t.eligibility.ui.rule.type}
      value={value}
      disabled={common.disabled}
      onChange={(e) => onChange(e.target.value as RuleType)}
      onBlur={common.onBlur}
    >
      <option value="Mandatory">{t.eligibility.ui.rule.mandatory}</option>
      <option value="Optional">{t.eligibility.ui.rule.optional}</option>
    </Select>
  );
}

type ValueInputProps = Common & {
  field: CatalogueField | undefined;
  operator: CatalogueOperator | undefined;
  values: string[];
  provinces: TargetProvince[];
  onChange: (values: string[]) => void;
};

/** The options a choice field offers: its catalogue list, or the campaign's target provinces. */
export function optionsFor(field: CatalogueField, provinces: TargetProvince[]): { key: string; label: string }[] {
  return field.optionsSource === "CampaignProvinces" ? provinces.map((p) => ({ key: p.id, label: p.name })) : field.options;
}

/**
 * The value(s) of a rule. One number or date box for "at least", two for "between", a drop-down
 * for "is", a set of checkboxes for "is one of", and nothing for "is yes".
 */
export function ValueInput({ field, operator, values, provinces, onChange, ...common }: ValueInputProps) {
  const listId = useId();

  if (!field || !operator) {
    return <TextInput aria-label={t.eligibility.ui.rule.value} disabled placeholder="—" />;
  }

  if (operator.arity === "None") {
    return <span className="px-1 text-sm text-ink-muted">{t.eligibility.ui.rule.valueNone}</span>;
  }

  const set = (index: number, value: string) => {
    const next = [...values];
    while (next.length <= index) next.push("");
    next[index] = value;
    onChange(next);
  };

  if (field.valueType === "Choice") {
    const options = optionsFor(field, provinces);

    if (operator.arity === "One") {
      return (
        <Select
          aria-label={t.eligibility.ui.rule.value}
          value={values[0] ?? ""}
          disabled={common.disabled}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          onBlur={common.onBlur}
          {...aria(common)}
        >
          <option value="">{t.eligibility.ui.rule.choose}</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    }

    // A list: "is one of" / "is none of".
    return (
      <fieldset
        aria-label={t.eligibility.ui.rule.listLabel(field.label)}
        aria-describedby={common.describedBy}
        aria-invalid={common.invalid ? true : undefined}
        className="flex min-w-0 flex-wrap gap-x-4 gap-y-1.5"
        disabled={common.disabled}
      >
        {options.map((option, index) => {
          const id = `${listId}-${index}`;
          return (
            <label key={option.key} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                id={id}
                type="checkbox"
                checked={values.includes(option.key)}
                onChange={(e) => onChange(e.target.checked ? [...values, option.key] : values.filter((v) => v !== option.key))}
                onBlur={common.onBlur}
                className="size-4 accent-primary"
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>
    );
  }

  // Numbers and dates: one box, or two for "between".
  const type = field.valueType === "Date" ? "date" : "text";
  const boxes = operator.arity === "Two" ? 2 : 1;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {Array.from({ length: boxes }, (_, index) => (
        <div key={index} className="flex min-w-0 flex-1 items-center gap-1.5">
          {boxes === 2 && (
            <span aria-hidden="true" className="text-xs text-ink-muted">
              {index === 0 ? t.eligibility.ui.rule.valueFrom : t.eligibility.ui.rule.valueTo}
            </span>
          )}
          <TextInput
            type={type}
            inputMode={field.valueType === "Number" ? "decimal" : undefined}
            aria-label={boxes === 2 ? (index === 0 ? t.eligibility.ui.rule.valueFrom : t.eligibility.ui.rule.valueTo) : t.eligibility.ui.rule.value}
            value={values[index] ?? ""}
            disabled={common.disabled}
            onChange={(e) => set(index, e.target.value)}
            onBlur={common.onBlur}
            autoComplete="off"
            {...aria(common)}
          />
        </div>
      ))}
      {field.valueType === "Number" && field.unit && (
        <span className="shrink-0 text-xs text-ink-muted">{field.unit}</span>
      )}
    </div>
  );
}
