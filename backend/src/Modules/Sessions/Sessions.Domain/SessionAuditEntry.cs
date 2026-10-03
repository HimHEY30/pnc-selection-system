namespace Sessions.Domain;

/// <summary>What was changed. Stored as a smallint.</summary>
public enum AuditEntity : short
{
    Session = 1,
    Host = 2,
}

/// <summary>What was done to it. Stored as a smallint.</summary>
public enum AuditAction : short
{
    Created = 1,
    Updated = 2,
    Cancelled = 3,
    ExpectedSet = 4,
    AttendanceRecorded = 5,
    Deactivated = 6,
    Activated = 7,
}

/// <summary>
/// One line of the audit trail: who changed which session (or host), when, and what it looked like
/// before and after. Append-only: nothing in the application edits or deletes these.
/// </summary>
public sealed class SessionAuditEntry
{
    public Guid Id { get; private set; }

    /// <summary>The session's campaign. Null for a host, which belongs to no campaign.</summary>
    public Guid? CampaignId { get; private set; }

    public AuditEntity Entity { get; private set; }
    public Guid EntityId { get; private set; }
    public AuditAction Action { get; private set; }
    public string? BeforeJson { get; private set; }
    public string? AfterJson { get; private set; }
    public string ChangedById { get; private set; } = string.Empty;
    public string ChangedByName { get; private set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; private set; }

    private SessionAuditEntry() { }

    public static SessionAuditEntry Record(
        Guid? campaignId,
        AuditEntity entity,
        Guid entityId,
        AuditAction action,
        string? beforeJson,
        string? afterJson,
        string changedById,
        string changedByName,
        DateTimeOffset at) => new()
    {
        Id = Guid.NewGuid(),
        CampaignId = campaignId,
        Entity = entity,
        EntityId = entityId,
        Action = action,
        BeforeJson = beforeJson,
        AfterJson = afterJson,
        ChangedById = changedById,
        ChangedByName = changedByName,
        ChangedAt = at,
    };
}
