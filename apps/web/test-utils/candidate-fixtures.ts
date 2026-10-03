import type { Candidate, CandidateList, SchoolChoice, SessionChoice } from "@/lib/candidates/types";
import { CAMPAIGN_ID } from "./session-fixtures";

export { CAMPAIGN_ID };

export const SCHOOLS: SchoolChoice[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Bak Touk High School" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Hun Sen Prey Chhor High School" },
];

export const SESSIONS: SessionChoice[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Battambang open day", date: "2027-03-20", status: "Planned", canBeChosen: true },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Visit to Hope School", date: "2027-02-01", status: "Done", canBeChosen: true },
];

/** A candidate who picked every address level from the lists and typed her school. */
export function candidateFixture(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    campaignId: CAMPAIGN_ID,
    nameKm: "សុខ ចិន្តា",
    nameEn: "Sok Chenda",
    gender: "Female",
    dateOfBirth: "2009-05-20",
    phone: "012345678",
    address: {
      province: { code: "12", name: "Phnom Penh" },
      district: { code: "1201", name: "Chamkar Mon" },
      commune: { code: "120101", name: "Tonle Basak" },
      village: null,
    },
    schoolHostId: null,
    schoolName: "Tiny Village School",
    session: null,
    hasNgoSupport: false,
    ngoName: null,
    createdByName: "Dara Manager",
    createdAt: "2027-03-10T05:00:00Z",
    updatedAt: "2027-03-10T05:00:00Z",
    version: 4,
    ...overrides,
  };
}

export function candidateListFixture(overrides: Partial<CandidateList> = {}): CandidateList {
  const items = overrides.items ?? [candidateFixture()];
  return {
    campaignId: CAMPAIGN_ID,
    campaignName: "Selection 2027",
    campaignStatus: "Active",
    canChange: true,
    provinces: ["Phnom Penh"],
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: 1,
    ...overrides,
  };
}
