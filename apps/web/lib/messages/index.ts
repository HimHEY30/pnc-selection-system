import { en, type Messages } from "./en";

// Today there is one language. To add Khmer: create km.ts exporting a `Messages`,
// and pick between `en` and `km` here (for example from a cookie or the user's profile).
export const t: Messages = en;

export type { Messages };
