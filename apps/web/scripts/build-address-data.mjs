// Rebuilds lib/address/data/*.json from the public Pumi service (https://github.com/dwilkie/pumi, MIT).
//
//   node scripts/build-address-data.mjs            (run from apps/web; takes a few minutes)
//   ADDRESS_API_URL=http://localhost:3001/pumi node scripts/build-address-data.mjs
//
// The picker reads these files, not the service, so nobody waits on a free host that sleeps. Run this when Cambodia
// changes its districts, communes or villages, review the diff, and commit it. It writes nothing unless every level was
// read completely, so a service that is down cannot leave half a list behind.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = (process.env.ADDRESS_API_URL ?? "https://pumi.onrender.com/pumi").replace(/\/+$/, "");
const OUT = fileURLToPath(new URL("../lib/address/data/", import.meta.url));
const PARALLEL = 6;
const ATTEMPTS = 6;
const TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One request, retried: the service may be asleep for the first one. */
async function get(path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error("not a list");
      return body;
    } catch (error) {
      if (attempt >= ATTEMPTS) throw new Error(`${url}: ${error.message}`);
      await sleep(1000 * attempt);
    }
  }
}

/** Same reading as readPlace in lib/address/places.ts: a digit-string id and an English (else Latin) name. */
function read(raw, parent) {
  const code = typeof raw.id === "string" && /^\d{1,8}$/.test(raw.id) ? raw.id : null;
  const name = [raw.name_en, raw.name_latin].find((n) => typeof n === "string" && n.trim() !== "")?.trim();
  if (!code || !name) return null;
  const nameKm = typeof raw.name_km === "string" && raw.name_km.trim() !== "" ? raw.name_km.trim() : null;
  return parent === null ? [code, name, nameKm] : [code, name, nameKm, parent];
}

/** Runs `work` over the items a few at a time and returns the results in order. */
async function inParallel(items, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  return results;
}

async function children(level, parentParam, parents) {
  let done = 0;
  const lists = await inParallel(parents, async (parent) => {
    const rows = (await get(level, { [parentParam]: parent })).map((raw) => read(raw, parent)).filter(Boolean);
    if (++done % 100 === 0) console.log(`  ${level}: ${done}/${parents.length}`);
    return rows;
  });
  return lists.flat();
}

const sortByCode = (rows) => rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

console.log(`Reading from ${BASE}`);
const provinces = sortByCode((await get("provinces")).map((raw) => read(raw, null)).filter(Boolean));
console.log(`provinces: ${provinces.length}`);
const districts = sortByCode(await children("districts", "province_id", provinces.map((p) => p[0])));
console.log(`districts: ${districts.length}`);
const communes = sortByCode(await children("communes", "district_id", districts.map((d) => d[0])));
console.log(`communes: ${communes.length}`);
const villages = sortByCode(await children("villages", "commune_id", communes.map((c) => c[0])));
console.log(`villages: ${villages.length}`);

if (provinces.length < 20 || districts.length < 150 || communes.length < 1000 || villages.length < 10000) {
  throw new Error("The lists look far too short; nothing was written.");
}

await mkdir(OUT, { recursive: true });
for (const [name, rows] of Object.entries({ provinces, districts, communes, villages })) {
  // One row per line, so a refresh shows in review as the places that changed.
  const text = `[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]\n`;
  await writeFile(`${OUT}${name}.json`, text);
}
console.log(`Wrote ${OUT}`);
