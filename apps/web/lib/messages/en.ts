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

  eligibility: {
    // How a rule reads inside the summary sentence: operator key -> (field, value(s)).
    phrase: {
      equals: (f: string, v: string[]) => `${f} is ${v[0]}`,
      less_than: (f: string, v: string[]) => `${f} is less than ${v[0]}`,
      at_most: (f: string, v: string[]) => `${f} is at most ${v[0]}`,
      greater_than: (f: string, v: string[]) => `${f} is greater than ${v[0]}`,
      at_least: (f: string, v: string[]) => `${f} is at least ${v[0]}`,
      between: (f: string, v: string[]) => `${f} is between ${v[0]} and ${v[1]}`,
      is: (f: string, v: string[]) => `${f} is ${v[0]}`,
      is_not: (f: string, v: string[]) => `${f} is not ${v[0]}`,
      is_one_of: (f: string, v: string[]) => `${f} is one of ${v.join(", ")}`,
      is_none_of: (f: string, v: string[]) => `${f} is none of ${v.join(", ")}`,
      is_yes: (f: string) => `${f} is yes`,
      is_no: (f: string) => `${f} is no`,
      before: (f: string, v: string[]) => `${f} is before ${v[0]}`,
      after: (f: string, v: string[]) => `${f} is after ${v[0]}`,
      date_between: (f: string, v: string[]) => `${f} is between ${v[0]} and ${v[1]}`,
    } as Record<string, (field: string, values: string[]) => string>,

    // The failure message pre-filled for a new rule: operator key -> (field, value(s)).
    defaultMessage: {
      equals: (f: string, v: string[]) => `${f} must be equal to ${v[0]}.`,
      less_than: (f: string, v: string[]) => `${f} must be less than ${v[0]}.`,
      at_most: (f: string, v: string[]) => `${f} must be at most ${v[0]}.`,
      greater_than: (f: string, v: string[]) => `${f} must be greater than ${v[0]}.`,
      at_least: (f: string, v: string[]) => `${f} must be at least ${v[0]}.`,
      between: (f: string, v: string[]) => `${f} must be between ${v[0]} and ${v[1]}.`,
      is: (f: string, v: string[]) => `${f} must be ${v[0]}.`,
      is_not: (f: string, v: string[]) => `${f} must not be ${v[0]}.`,
      is_one_of: (f: string, v: string[]) => `${f} must be one of: ${v.join(", ")}.`,
      is_none_of: (f: string, v: string[]) => `${f} must not be any of: ${v.join(", ")}.`,
      is_yes: (f: string) => `${f} must be yes.`,
      is_no: (f: string) => `${f} must be no.`,
      before: (f: string, v: string[]) => `${f} must be before ${v[0]}.`,
      after: (f: string, v: string[]) => `${f} must be after ${v[0]}.`,
      date_between: (f: string, v: string[]) => `${f} must be between ${v[0]} and ${v[1]}.`,
    } as Record<string, (field: string, values: string[]) => string>,
    fallbackMessage: "The candidate does not meet this rule.",

    // Same wording as the backend (RuleSetValidator), so a message reads the same whether it
    // comes from this page or from the server.
    validation: {
      fieldRequired: "Choose a field.",
      operatorRequired: "Choose how to compare.",
      valueRequired: "Enter a value.",
      bothValues: "Enter both values.",
      chooseOne: "Choose at least one option.",
      blank: "Fill in every value.",
      notNumber: "Enter a number.",
      wholeNumber: "Use a whole number.",
      decimals: (places: number) => `Use at most ${places} decimal places.`,
      atLeast: (min: string) => `Enter ${min} or more.`,
      atMost: (max: string) => `Enter ${max} or less.`,
      notDate: "Enter a date as year-month-day.",
      firstLower: "The first value must be lower than the second.",
      notInList: "Choose from the list.",
      notTarget: "Choose only target provinces of this campaign. Change them in Step 1.",
      messageRequired: "Write the reason shown when a candidate fails this rule.",
      messageTooLong: (max: number) => `The message must be ${max} characters or fewer.`,
      groupNameRequired: "Give the group a name.",
      groupNameTooLong: (max: number) => `Group name must be ${max} characters or fewer.`,
      duplicate: "The same rule already exists in this group.",
      needMandatory: "Add at least one active mandatory rule.",
      needReferenceDate: "Choose the date ages are calculated on.",
    },

    // Text on the Step 2 screen.
    ui: {
      title: "Step 2: Eligibility rules",
      subtitle: "Say who is allowed to apply in this campaign. Candidates are checked against these rules later.",

      empty: {
        title: "No eligibility rules yet",
        body: "Eligibility rules say who is allowed to apply in this campaign, for example an age range or the grade a candidate must have completed. You can change them every year from this page.",
        addFirst: "Add first rule",
        useSuggested: "Use suggested rules",
        suggestedHint: "Suggested rules are a starting point. You can change or delete every one of them.",
        readOnly: "No rules have been set for this campaign yet.",
      },

      builder: {
        rules: "Rules",
        addGroup: "Add group",
        suggestedFailed: "We could not load the suggested rules. Try again.",
      },

      group: {
        name: "Group name",
        logic: "How the rules in this group combine",
        all: "ALL of these must pass",
        any: "ANY one of these must pass",
        rulesLabel: (name: string) => `Rules in ${name}`,
        empty: "No rules in this group yet.",
        addRule: "Add rule",
        moveUp: "Move group up",
        moveDown: "Move group down",
        delete: "Delete group",
        deleteTitle: (name: string) => `Delete "${name}"?`,
        deleteBody: (rules: number) =>
          rules === 0
            ? "This group is empty. It will be removed when you save."
            : `This also removes its ${rules} ${rules === 1 ? "rule" : "rules"}. It will be removed when you save.`,
        confirmDelete: "Delete group",
        keep: "Keep group",
        itemLabel: (name: string) => `Group: ${name}`,
      },

      rule: {
        field: "Field",
        operator: "Comparison",
        value: "Value",
        type: "Type",
        mandatory: "Mandatory",
        optional: "Optional",
        active: "Active",
        activeLabel: (summary: string) => `Rule active: ${summary}`,
        handle: "Drag to reorder",
        handleLabel: (summary: string) => `Reorder: ${summary}`,
        moveUp: "Move rule up",
        moveDown: "Move rule down",
        edit: "Details",
        details: "Rule details",
        message: "Message shown when a candidate fails this rule",
        moveToGroup: "Group",
        delete: "Delete rule",
        deleteTitle: "Delete this rule?",
        deleteBody: (summary: string) => `"${summary}" will be removed when you save.`,
        confirmDelete: "Delete rule",
        keep: "Keep rule",
        choose: "Choose…",
        valueFrom: "From",
        valueTo: "To",
        valueNone: "No value needed",
        valueList: "Choose one or more",
        pickOptions: "Choose",
        listLabel: (field: string) => `${field}: options`,
        inactiveHint: "Switched off. This rule is ignored.",
        optionalHint: "A candidate who fails this is only given a warning.",
      },

      reference: {
        label: "Ages are calculated on",
        hint: "Age is counted in whole years on this date. It starts as the campaign start date.",
      },

      actions: {
        saveDraft: "Save draft",
        saveContinue: "Save and continue to Step 3",
        saving: "Saving…",
      },

      banners: {
        fixErrors: "Some rules need your attention. They are marked below.",
        readOnly: "You can view these rules but only a selection manager or a system admin can change them.",
        locked: "This campaign is no longer a draft, so its rules can no longer be changed.",
      },

      leave: {
        title: "Leave without saving?",
        body: "You have changes that are not saved. If you leave now they will be lost.",
        stay: "Keep editing",
        leave: "Leave page",
      },

      test: {
        title: "Test a sample candidate",
        intro: "Enter a candidate's details to see what the rules on screen would decide. Nothing is saved.",
        noRules: "Add a rule to test it.",
        dateOfBirth: "Date of birth",
        notProvided: "Not provided",
        yes: "Yes",
        no: "No",
        run: "Run test",
        running: "Running…",
        resultLabel: "Test result",
        eligible: "Eligible",
        notEligible: "Not eligible",
        warnings: (n: number) => (n === 1 ? "1 warning" : `${n} warnings`),
        passed: "Passed",
        failed: "Failed",
        skipped: "Skipped (switched off)",
        missing: "Not provided",
        mandatory: "Mandatory",
        optional: "Optional",
        groupPassed: "Group passes",
        groupFailed: "Group fails",
        groupIgnored: "Group has no mandatory rule, so it is ignored",
        unavailable: "We could not run the test. Try again.",
        stale: "The rules have changed since this test. Run it again to see the new result.",
      },

      tip: {
        title: "Tip",
        body: "Mandatory rules decide who is eligible. Optional rules never block anyone; they only give a warning. Switch a rule off to keep it without using it.",
      },
    },

    summary: {
      title: "Summary",
      empty: "Add a rule to see who would be eligible.",
      intro: "A candidate is eligible if:",
      and: ", AND ",
      or: " OR ",
      noMandatory: "There is no active mandatory rule yet, so every candidate would be eligible.",
      optionalIntro: "Optional rules (a candidate who fails these is only given a warning):",
      optionalSeparator: "; ",
      missingValue: "…",
    },
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
