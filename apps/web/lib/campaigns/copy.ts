import { t } from "@/lib/messages";
import { COPY_PART_KEYS, type CopyPartKey } from "./types";

// What the "copy from" part of the create form checks by itself. The server checks again and is the authority.

export type CopyErrors = { source?: string; parts?: string };

export function validateCopy(sourceCampaignId: string, ticked: ReadonlySet<CopyPartKey>): CopyErrors {
  const errors: CopyErrors = {};
  if (!sourceCampaignId) errors.source = t.create.copySourceRequired;
  else if (ticked.size === 0) errors.parts = t.create.copyPartsRequired;
  return errors;
}

/** The ticked parts in the order they are copied (provinces first, since rules and sessions refer to them). */
export function partsInOrder(ticked: ReadonlySet<CopyPartKey>): CopyPartKey[] {
  return COPY_PART_KEYS.filter((key) => ticked.has(key));
}
