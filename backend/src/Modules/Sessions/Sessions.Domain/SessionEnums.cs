namespace Sessions.Domain;

/// <summary>Where a session is in its life. Stored as a smallint, so never reorder or renumber.</summary>
public enum SessionStatus : short
{
    /// <summary>Scheduled, has not happened yet (or nobody has recorded that it did).</summary>
    Planned = 1,

    /// <summary>It took place: its actual attendance was recorded.</summary>
    Done = 2,

    /// <summary>Called off, with a reason. Final.</summary>
    Cancelled = 3,

    /// <summary>
    /// Copied from another campaign: it has a title, a format, a venue or link and notes, but no date, times, host or
    /// person responsible yet. It becomes Planned when somebody schedules it, giving all of those at once.
    /// </summary>
    Unscheduled = 4,
}

/// <summary>How people take part. Stored as a smallint.</summary>
public enum SessionFormat : short
{
    InPerson = 1,
    Online = 2,
    Hybrid = 3,
}

/// <summary>Who runs a session. Stored as a smallint.</summary>
public enum HostType : short
{
    /// <summary>A staff member. Not a directory record: the session points at the user.</summary>
    Officer = 1,

    /// <summary>A former student, a person kept in the host directory.</summary>
    Alumni = 2,

    /// <summary>An organisation kept in the host directory (an NGO, a high school, ...).</summary>
    Partner = 3,
}

/// <summary>What kind of organisation a partner is. Stored as a smallint.</summary>
public enum PartnerKind : short
{
    Ngo = 1,
    HighSchool = 2,
    University = 3,
    Other = 4,
}
