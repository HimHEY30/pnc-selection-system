// Every user-facing string of the campaign screens, in one place. Components import
// `t` from "@/lib/messages" and never hard-code copy, so adding Khmer later means
// adding a km.ts with the same shape and choosing between them in index.ts.
//
// Messages that need a value are functions. Wording follows the approved designs.

export const en = {
  common: {
    cancel: "Cancel",
    close: "Close",
    optional: "(optional)",
    tryAgain: "Try again",
    loading: "Loading",
    comingSoon: "Coming soon",
    skipToContent: "Skip to content",
  },

  brand: {
    product: "Student Selection",
    organisation: "Passerelles Numériques Cambodia",
  },

  nav: {
    label: "Admin",
    dashboard: "Dashboard",
    campaigns: "Campaigns",
    afterSetup: "Available after setup",
    sessions: "Information sessions",
    candidates: "Candidates",
    exam: "Entrance exam",
    lockedHint: "Available after a campaign is set up",
    toggle: "Toggle navigation",
  },

  roles: {
    "system-admin": "System admin",
    "selection-manager": "Selection manager",
    "selection-officer": "Selection officer",
    "committee-user": "Committee member",
  } as Record<string, string>,

  profile: { logout: "Logout" },

  status: {
    NotStarted: "Not started",
    InProgress: "In progress",
    Complete: "Complete",
    Draft: "Draft",
    Active: "Active",
    Closed: "Closed",
  },

  switcher: {
    label: "Switch campaign",
    none: "No campaign yet",
    choose: "Choose a campaign",
    unavailable: "Campaigns unavailable",
    noneInList: "You have no campaigns yet.",
    create: "Create campaign",
    listUnavailable: "We could not load your campaigns.",
  },

  steps: {
    CampaignInfo: {
      title: "Campaign info",
      description: "Dates, expected candidates, seats and target provinces.",
    },
    EligibilityRules: {
      title: "Eligibility rules",
      description: "Define who can apply: age, education, province and more.",
    },
    InformationSessions: {
      title: "Information sessions",
      description: "Schedule visits to schools and communities.",
    },
    Candidates: {
      title: "Candidates",
      description: "Application form, required documents and import options.",
    },
    EntranceExam: {
      title: "Entrance exam",
      description: "Subjects, scoring, exam dates and centres.",
    },
  },

  dashboard: {
    welcome: (name: string) => `Welcome, ${name}`,
    fallbackName: "there",
    subtitle: "Your dashboard will show candidates, sessions and exam results once a campaign is running.",
    emptyTitle: "No campaign yet",
    emptyBody:
      'A campaign is one selection cycle, for example "Selection 2027". It holds the dates, eligibility rules, information sessions, candidates and entrance exam for that year.',
    create: "Create campaign",
    hint: "Setup takes 5 steps. You can save a draft and come back at any time.",
    readOnlyHint: "Ask a selection manager or a system admin to create the first campaign.",
    stepLabel: (n: number) => `Step ${n}`,
    stepsLabel: "Setup steps",
  },

  create: {
    title: "Create campaign",
    subtitle: "Start with the basics. You will configure the details in the next steps.",
    name: "Campaign name",
    nameHint: "Staff will see this name everywhere in the app.",
    namePlaceholder: "e.g. Selection 2027",
    academicYear: "Academic year",
    description: "Short description",
    howToStart: "How do you want to start?",
    scratch: "Start from scratch",
    scratchHint: "Set every step yourself with guidance along the way.",
    copy: "Copy settings from a previous campaign",
    copyHint: "Available once you have completed your first campaign.",
    submit: "Create and continue",
    submitting: "Creating…",
  },

  setup: {
    breadcrumbs: "Breadcrumb",
    campaigns: "Campaigns",
    title: "Campaign setup",
    subtitle: "Complete the 5 steps in any order. Your work is saved as a draft.",
    listLabel: "Setup steps",
    start: "Start",
    continue: "Continue",
    review: "Review",
    view: "View",
    progress: "Setup progress",
    stepsComplete: (done: number, total: number) => `${done} of ${total} steps complete`,
    stepsInProgress: (n: number) => `${n} in progress`,
    activate: "Review and activate",
    activateHint:
      "You can activate the campaign once all 5 steps are complete. Until then it stays a draft and is only visible to staff.",
    academicYear: "Academic year",
    createdBy: "Created by",
    readOnly: "You can view this campaign but only a selection manager or a system admin can change it.",
    notDraft: "This campaign is no longer a draft, so its setup can no longer be changed.",
  },

  info: {
    back: "← Back to setup overview",
    title: "Step 1: Campaign info",
    subtitle: "The basic facts about this selection cycle. Other steps use these dates and numbers.",
    stepTabsLabel: "Campaign setup steps",
    currentStep: (status: string) => `Step 1 · ${status}`,
    tabLabel: (n: number) => `Step ${n}`,
    identity: "Identity",
    name: "Campaign name",
    academicYear: "Academic year",
    description: "Description",
    dates: "Dates",
    startDate: "Start date",
    startDateHint: "The day the selection team starts working on this campaign.",
    endDate: "End date",
    targets: "Targets",
    expectedCandidates: "Expected candidates",
    expectedCandidatesPlaceholder: "e.g. 1500",
    expectedCandidatesHint: "Your best estimate. The dashboard compares registrations against it.",
    seatsAvailable: "Seats available",
    seatsAvailablePlaceholder: "e.g. 150",
    seatsAvailableHint: "How many students PNC can admit this year.",
    provinces: "Target provinces",
    provincesHint: "Used later to plan information sessions and filter candidates.",
    saveDraft: "Save draft",
    savingDraft: "Saving…",
    saveContinue: "Save and continue to Step 2",
    savingContinue: "Saving…",
    draftSaved: (time: string) => `Draft saved at ${time}`,
    justSaved: "Draft saved",
    fixErrors: "Some fields need your attention. They are marked below.",
    saveFailed: "We could not save your changes. Check your connection and try again.",
    readOnly: "You can view this step but only a selection manager or a system admin can change it.",
    notDraft: "This campaign is no longer a draft, so this step can no longer be changed.",
  },

  provinces: {
    add: "+ Add province",
    search: "Search provinces",
    none: "No province matches your search.",
    remove: (name: string) => `Remove ${name}`,
    selected: "Selected provinces",
    listLabel: "Provinces",
    empty: "No province selected yet.",
  },

  timeline: {
    title: "Timeline preview",
    starts: "Campaign starts",
    sessions: "Information sessions",
    sessionsHint: "Set in Step 3",
    exam: "Entrance exam",
    examHint: "Set in Step 5",
    ends: "Campaign ends",
    notSet: "Not set yet",
    fixEndDate: "Fix the end date to see it here",
  },

  tip: {
    title: "Tip",
    body: "Not sure about a number yet? Save a draft and come back. You can change everything on this page until the campaign is activated.",
  },

  validation: {
    nameRequired: "Enter a campaign name.",
    nameTooLong: (max: number) => `Campaign name must be ${max} characters or fewer.`,
    academicYearRequired: "Choose an academic year.",
    academicYearTooLong: (max: number) => `Academic year must be ${max} characters or fewer.`,
    descriptionTooLong: (max: number) => `Description must be ${max} characters or fewer.`,
    startDateRequired: "Enter a start date.",
    endDateRequired: "Enter an end date.",
    endBeforeStart: (start: string) => `End date must be after the start date (${start}).`,
    expectedRequired: "Enter the expected number of candidates.",
    expectedInvalid: "Expected candidates must be a whole number greater than 0.",
    seatsRequired: "Enter the number of seats available.",
    seatsInvalid: "Seats available must be a whole number greater than 0.",
    seatsTooMany: (expected: string) => `Seats available cannot be more than expected candidates (${expected}).`,
    provincesRequired: "Choose at least one target province.",
  },

  errors: {
    pageTitle: "We could not load this page",
    pageBody: "Something went wrong on our side. Your saved work is safe.",
    notFoundTitle: "Campaign not found",
    notFoundBody: "This campaign does not exist or was removed.",
    backToDashboard: "Back to dashboard",
    forbidden: "You do not have permission to do this.",
    unavailable: "We could not reach the server. Check your connection and try again.",
    generic: "Something went wrong. Please try again.",
  },
};

export type Messages = typeof en;
