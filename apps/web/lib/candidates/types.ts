// Shapes of the backend's candidate API (see Candidates.Application/Contracts.cs and
// Sessions.Application/CandidateLookups.cs). Safe to import from client components: no server-only code.

export type Gender = "Female" | "Male";
export const GENDERS: readonly Gender[] = ["Female", "Male"];

/** One level of an address. The code is null when the name was typed by hand (the address service was down). */
export type Place = { code: string | null; name: string | null };

export type Address = {
  province: Place | null;
  district: Place | null;
  commune: Place | null;
  /** Null when the village was left out. */
  village: Place | null;
};

/** The session a candidate came to. Status shows "Cancelled" if it was called off afterwards. */
export type CandidateSession = { id: string; title: string; date: string | null; status: string };

export type Candidate = {
  id: string;
  campaignId: string;
  nameKm: string;
  nameEn: string;
  gender: Gender;
  /** ISO date, yyyy-mm-dd. */
  dateOfBirth: string;
  /** Stored form: 0 and then 8 or 9 digits. */
  phone: string;
  address: Address;
  /** The partner in the directory, or null when the school was typed. */
  schoolHostId: string | null;
  schoolName: string;
  session: CandidateSession | null;
  hasNgoSupport: boolean;
  ngoName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Sent back when changing, so a change made by somebody else in the meantime is noticed. */
  version: number;
};

/** What the form sends. When the school is picked, only `schoolHostId` counts; when typed, only `schoolName`. */
export type CandidateRequest = {
  nameKm: string;
  nameEn: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string;
  address: Address;
  schoolHostId: string | null;
  schoolName: string | null;
  sessionId: string | null;
  hasNgoSupport: boolean;
  ngoName: string | null;
  /** Needed to change a candidate; ignored when adding. */
  version: number | null;
};

export type CandidateList = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  /** False once the campaign is closed: candidates can still be read. */
  canChange: boolean;
  /** The provinces that this campaign's candidates are from, for the filter. */
  provinces: string[];
  items: Candidate[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/** What the list's search box and filters ask for. Anything left out means "no filter". */
export type CandidateFilters = {
  q?: string;
  province?: string;
  sessionId?: string;
  /** "yes" or "no". */
  ngo?: "yes" | "no";
  page?: number;
};

/** A session a candidate can be said to have come to. */
export type SessionChoice = { id: string; title: string; date: string | null; status: string; canBeChosen: boolean };

/** A high school in the partner directory. */
export type SchoolChoice = { id: string; name: string };

export const PAGE_SIZE = 20;
