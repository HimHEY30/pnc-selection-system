namespace Candidates.Domain;

/// <summary>What was done to a candidate. Stored as a smallint.</summary>
public enum AuditAction : short
{
    Created = 1,
    Updated = 2,
    Deleted = 3,
}

/// <summary>
/// One line of the audit trail: who did what to which candidate, when, and what it looked like before and after.
/// Append-only: nothing in the application edits or deletes these, so a deleted candidate still has its history.
/// </summary>
public sealed class CandidateAuditEntry
{
    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }
    public Guid CandidateId { get; private set; }
    public AuditAction Action { get; private set; }
    public string? BeforeJson { get; private set; }
    public string? AfterJson { get; private set; }
    public string ChangedById { get; private set; } = string.Empty;
    public string ChangedByName { get; private set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; private set; }

    private CandidateAuditEntry() { }

    public static CandidateAuditEntry Record(
        Guid campaignId,
        Guid candidateId,
        AuditAction action,
        string? beforeJson,
        string? afterJson,
        string changedById,
        string changedByName,
        DateTimeOffset at) => new()
    {
        Id = Guid.NewGuid(),
        CampaignId = campaignId,
        CandidateId = candidateId,
        Action = action,
        BeforeJson = beforeJson,
        AfterJson = afterJson,
        ChangedById = changedById,
        ChangedByName = changedByName,
        ChangedAt = at,
    };
}
