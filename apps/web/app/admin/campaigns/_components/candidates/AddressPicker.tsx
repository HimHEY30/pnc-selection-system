"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";
import { Select, TextInput } from "@/components/ui/inputs";
import { fetchPlaces } from "@/lib/address/client";
import { placeLabel, type Level, type PlaceOption } from "@/lib/address/places";
import type { Address, Place } from "@/lib/candidates/types";
import { t } from "@/lib/messages";

export type AddressLevel = "province" | "district" | "commune" | "village";

type Props = {
  value: Address;
  onChange: (next: Address) => void;
  /** A message under a level, such as the server's "Choose the commune.". */
  errors?: Partial<Record<AddressLevel, string>>;
  disabled?: boolean;
};

const text = t.candidates.address;

const LEVELS: readonly AddressLevel[] = ["province", "district", "commune", "village"];
const LIST_LEVEL: Record<AddressLevel, Level> = { province: "provinces", district: "districts", commune: "communes", village: "villages" };
const LABEL: Record<AddressLevel, string> = { province: text.province, district: text.district, commune: text.commune, village: text.village };

/** The level whose pick the list at this level depends on. */
const PARENT: Record<AddressLevel, AddressLevel | null> = { province: null, district: "province", commune: "district", village: "commune" };

/** The levels a candidate cannot be saved without. The village may be left out. */
const REQUIRED = LEVELS.filter((level) => level !== "village");

type Loaded = { key: string; places: PlaceOption[] | null };
type LevelState = { status: "idle" | "loading" | "ready" | "failed"; places: PlaceOption[]; retry: () => void };

/**
 * The places at one level, loaded once the level above has a pick. `idle` until then. A retry asks again after a failure.
 * The loading state is worked out from what has arrived, so nothing is set while an effect starts.
 */
function usePlaces(level: Level, parentCode: string | null, enabled: boolean): LevelState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${level}:${parentCode ?? ""}:${attempt}`;

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void fetchPlaces(level, parentCode).then((places) => {
      if (current) setLoaded({ key, places });
    });
    return () => {
      current = false;
    };
  }, [enabled, level, parentCode, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (!enabled) return { status: "idle", places: [], retry };
  if (loaded?.key !== key) return { status: "loading", places: [], retry };
  return loaded.places ? { status: "ready", places: loaded.places, retry } : { status: "failed", places: [], retry };
}

/** Typed by hand, as saved when the lists could not be used: names, and no codes. */
const isTyped = (a: Address) => Boolean(a.province?.name) && a.province?.code == null;

const EMPTY: Address = { province: null, district: null, commune: null, village: null };

type StepState = "done" | "current" | "loading" | "failed" | "waiting";

const BUBBLE: Record<StepState, string> = {
  done: "bg-primary text-white",
  current: "border-2 border-brand-blue bg-primary-soft text-primary",
  loading: "border-2 border-brand-blue bg-primary-soft text-primary",
  failed: "border-2 border-brand-red bg-danger-soft text-danger-text",
  waiting: "border border-line-strong bg-surface text-ink-muted",
};

/** The numbered marker beside a level: its number, a tick once chosen, a spinner while loading, an alert if it failed. */
function StepMarker({ step, state }: { step: number; state: StepState }) {
  return (
    <span aria-hidden="true" className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${BUBBLE[state]}`}>
      {state === "done" ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : state === "loading" ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="animate-spin">
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      ) : state === "failed" ? (
        "!"
      ) : (
        step
      )}
    </span>
  );
}

/**
 * The four levels of a Cambodian address as a guided sequence. Each list opens once the one above is chosen, and choosing
 * again higher up clears what was chosen below. If a list cannot be loaded the person can try again or type the names.
 */
export default function AddressPicker({ value, onChange, errors = {}, disabled }: Props) {
  const [typing, setTyping] = useState(() => isTyped(value));

  const province = usePlaces("provinces", null, !typing);
  const district = usePlaces("districts", value.province?.code ?? null, !typing && Boolean(value.province?.code));
  const commune = usePlaces("communes", value.district?.code ?? null, !typing && Boolean(value.district?.code));
  const village = usePlaces("villages", value.commune?.code ?? null, !typing && Boolean(value.commune?.code));
  const states: Record<AddressLevel, LevelState> = { province, district, commune, village };

  function pick(level: AddressLevel, code: string) {
    const place = states[level].places.find((p) => p.code === code);
    const chosen: Place | null = place ? { code: place.code, name: place.name } : null;
    const next: Address = { ...value, [level]: chosen };
    // Choosing again higher up clears what depended on it.
    for (const lower of LEVELS.slice(LEVELS.indexOf(level) + 1)) next[lower] = null;
    onChange(next);
  }

  function setTypedName(level: AddressLevel, name: string) {
    onChange({ ...value, [level]: name === "" ? null : { code: null, name } });
  }

  const switchTo = (typed: boolean) => {
    setTyping(typed);
    onChange(EMPTY);
  };

  const failed = LEVELS.find((level) => !typing && states[level].status === "failed");

  const isChosen = (level: AddressLevel) => Boolean(value[level]?.name || value[level]?.code);
  const chosenRequired = REQUIRED.filter(isChosen).length;
  const nextRequired = REQUIRED.find((level) => !isChosen(level));
  const complete = nextRequired === undefined;
  // The level to work on now: the first one without a pick (the village counts, once the commune is chosen).
  const current = LEVELS.find((level) => !isChosen(level));

  const stateOf = (level: AddressLevel): StepState => {
    if (isChosen(level)) return "done";
    if (!typing && states[level].status === "failed") return "failed";
    if (!typing && states[level].status === "loading") return "loading";
    return level === current ? "current" : "waiting";
  };

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-semibold text-ink">{text.legend}</legend>
        {typing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-ink">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-orange" />
            {text.manual}
          </span>
        )}
      </div>

      <p className="mt-1 text-[13px] leading-snug text-ink-muted">{typing ? text.typedHint : text.intro}</p>

      {/* Where the person is: segments for the three required levels, and one line saying what is next. */}
      <div className="mt-3" aria-live="polite">
        <div aria-hidden="true" className="flex gap-1">
          {REQUIRED.map((level) => (
            <span key={level} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${isChosen(level) ? "bg-primary" : "bg-line"}`} />
          ))}
        </div>
        <p className={`mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold ${complete ? "text-primary" : "text-ink-muted"}`}>
          {complete ? text.complete : `${text.progress(chosenRequired, REQUIRED.length)} · ${text.next(t.candidates.address.singular[LIST_LEVEL[nextRequired]])}`}
        </p>
      </div>

      <ol className="mt-4 flex flex-col">
        {LEVELS.map((level, index) => {
          const state = states[level];
          const parent = PARENT[level];
          const chosen = value[level];
          const marker = stateOf(level);
          const last = index === LEVELS.length - 1;
          // A place already chosen stays in the list even before the list arrives or if it is no longer in it.
          const options = [...state.places];
          if (chosen?.code && !options.some((o) => o.code === chosen.code)) {
            options.push({ code: chosen.code, name: chosen.name ?? chosen.code, nameKm: null });
          }
          const placeholder =
            state.status === "loading"
              ? text.loading
              : state.status === "idle" && parent
                ? text.chooseAbove(t.candidates.address.singular[LIST_LEVEL[parent]])
                : text.choose;

          return (
            <li key={level} className={`relative flex gap-3 ${last ? "" : "pb-4"}`}>
              {/* The line down to the next level: filled once this one is chosen. */}
              {!last && <span aria-hidden="true" className={`absolute left-[13px] top-7 bottom-0 w-0.5 transition-colors duration-200 ${isChosen(level) ? "bg-primary" : "bg-line"}`} />}
              <StepMarker step={index + 1} state={marker} />
              <div className="min-w-0 flex-1">
                <span className="sr-only">{`${text.stepOf(index + 1, LEVELS.length)}, ${text.stepStatus[marker]}`}</span>
                <FormField label={LABEL[level]} optional={level === "village"} error={errors[level]}>
                  {(control) =>
                    typing ? (
                      <TextInput {...control} name={level} value={chosen?.name ?? ""} onChange={(e) => setTypedName(level, e.target.value)} autoComplete="off" />
                    ) : (
                      <Select
                        {...control}
                        name={level}
                        value={chosen?.code ?? ""}
                        disabled={state.status === "idle" || state.status === "loading" || state.status === "failed"}
                        onChange={(e) => pick(level, e.target.value)}
                        className={state.status === "loading" ? "animate-pulse" : ""}
                      >
                        <option value="">{placeholder}</option>
                        {options.map((place) => (
                          <option key={place.code} value={place.code}>
                            {placeLabel(place)}
                          </option>
                        ))}
                      </Select>
                    )
                  }
                </FormField>

                {!typing && state.status === "loading" && <p className="motion-rise mt-1.5 text-[13px] text-ink-muted">{text.loadingHint}</p>}

                {failed === level && (
                  <div role="alert" className="motion-rise mt-2 rounded-lg border border-danger/30 bg-danger-soft p-3">
                    <p className="text-sm text-danger-text">{text.loadFailed(text.plural[LIST_LEVEL[level]])}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={state.retry}>
                        {t.common.tryAgain}
                      </Button>
                      <Button onClick={() => switchTo(true)}>{text.typeInstead}</Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {typing && (
        <Button className="mt-4" onClick={() => switchTo(false)}>
          {text.pickInstead}
        </Button>
      )}
    </fieldset>
  );
}
