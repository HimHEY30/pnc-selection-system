"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Province } from "@/lib/campaigns/types";
import { useDismiss } from "@/lib/hooks/useDismiss";
import { t } from "@/lib/messages";

type Props = {
  /** Put on the "+ Add province" button so a <label htmlFor> points at it. */
  id: string;
  provinces: Province[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Pick any number of provinces. Chosen ones show as removable chips; "+ Add province"
 * opens a searchable checklist.
 *
 * Keyboard: Enter or Space on the button opens the list and moves focus to the search
 * box; typing filters; Up/Down/Home/End move through the options; Enter toggles the
 * highlighted one; Escape closes and returns focus to the button. Every chip's x is a
 * real button, so the selection can be edited without a mouse.
 */
export default function ProvinceMultiSelect({ id, provinces, value, onChange, disabled, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => provinces.filter((p) => value.includes(p.id)), [provinces, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? provinces.filter((p) => p.name.toLowerCase().includes(needle)) : provinces;
  }, [provinces, query]);

  const optionId = (index: number) => `${listId}-option-${index}`;
  const activeOption = filtered[Math.min(activeIndex, filtered.length - 1)];

  const closeList = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  const dismiss = useCallback(() => closeList(false), [closeList]);
  useDismiss(open, rootRef, dismiss);

  // Opening the list sends focus to the search box.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Keep the highlighted option visible when arrowing through a long list.
  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function toggle(provinceId: number) {
    onChange(value.includes(provinceId) ? value.filter((v) => v !== provinceId) : [...value, provinceId]);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
        // Never submit the surrounding form from here.
        event.preventDefault();
        if (activeOption) toggle(activeOption.id);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeList(true);
        break;
      case "Tab":
        closeList(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-lg border bg-surface px-3 py-2 ${
          invalid ? "border-danger" : "border-line-strong"
        }`}
      >
        {selected.length > 0 && (
          <ul aria-label={t.provinces.selected} className="contents">
            {selected.map((province) => (
              <li
                key={province.id}
                className="flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pl-3 pr-1.5 text-sm font-semibold text-primary"
              >
                {province.name}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    toggle(province.id);
                    triggerRef.current?.focus();
                  }}
                  aria-label={t.provinces.remove(province.name)}
                  className="flex size-5 items-center justify-center rounded-full text-primary transition hover:bg-primary-line focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          ref={triggerRef}
          id={id}
          // Lets the form focus this button when "choose at least one province" fails.
          name="addProvince"
          type="button"
          disabled={disabled}
          onClick={() => (open ? closeList(false) : setOpen(true))}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={describedBy}
          className="rounded-full border border-dashed border-line-strong px-3 py-1 text-sm font-medium text-ink-muted transition hover:border-primary hover:text-primary focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.provinces.add}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 max-w-full rounded-xl border border-line bg-surface p-2 shadow-lg">
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? optionId(filtered.indexOf(activeOption)) : undefined}
            aria-label={t.provinces.search}
            placeholder={t.provinces.search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            autoComplete="off"
            className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-ring"
          />

          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={t.provinces.listLabel}
            className="mt-2 max-h-60 overflow-y-auto"
          >
            {filtered.map((province, index) => {
              const isSelected = value.includes(province.id);
              return (
                <li
                  key={province.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  // mousedown would pull focus off the search box; keep it there.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(province.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink ${
                    index === activeIndex ? "bg-primary-soft" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-primary bg-primary text-white" : "border-line-strong bg-surface"
                    }`}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                  {province.name}
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">{t.provinces.none}</p>}
        </div>
      )}
    </div>
  );
}
