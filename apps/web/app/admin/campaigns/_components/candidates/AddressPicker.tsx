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

/**
 * The four levels of a Cambodian address. Each list opens once the one above is chosen, and choosing again higher up
 * clears what was chosen below. If a list cannot be loaded the person can type the names instead.
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

  const failed = LEVELS.find((level) => states[level].status === "failed");

  return (
    <fieldset className="min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="mb-3 text-sm font-semibold text-ink">{text.legend}</legend>

      {typing ? (
        <>
          <p className="mb-3 text-[13px] leading-snug text-ink-muted">{text.typedHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {LEVELS.map((level) => (
              <FormField key={level} label={LABEL[level]} optional={level === "village"} error={errors[level]}>
                {(control) => (
                  <TextInput
                    {...control}
                    name={level}
                    value={value[level]?.name ?? ""}
                    onChange={(e) => setTypedName(level, e.target.value)}
                    autoComplete="off"
                  />
                )}
              </FormField>
            ))}
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => switchTo(false)}>
            {text.pickInstead}
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {LEVELS.map((level) => {
              const state = states[level];
              const parent = PARENT[level];
              const chosen = value[level];
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
                <FormField key={level} label={LABEL[level]} optional={level === "village"} error={errors[level]}>
                  {(control) => (
                    <Select
                      {...control}
                      name={level}
                      value={chosen?.code ?? ""}
                      disabled={state.status === "idle" || state.status === "loading" || state.status === "failed"}
                      onChange={(e) => pick(level, e.target.value)}
                    >
                      <option value="">{placeholder}</option>
                      {options.map((place) => (
                        <option key={place.code} value={place.code}>
                          {placeLabel(place)}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
              );
            })}
          </div>

          {failed && (
            <div role="alert" className="mt-3 rounded-lg border border-line-strong bg-canvas p-3">
              <p className="text-sm text-ink">{text.loadFailed(text.plural[LIST_LEVEL[failed]])}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={states[failed].retry}>{t.common.tryAgain}</Button>
                <Button onClick={() => switchTo(true)}>{text.typeInstead}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
