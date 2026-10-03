namespace Eligibility.Domain.Rules;

/// <summary>
/// One line of the audit trail: who changed which rule (or group, or the age reference
/// date) of which campaign, when, and what it looked like before and after. Append-only:
/// nothing in the application edits or deletes these.
/// </summary>
public sealed class EligibilityAuditEntry
{
    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }
    public AuditEntity Entity { get; private set; }
    public Guid EntityId { get; private set; }
    public AuditAction Action { get; private set; }
    public string? BeforeJson { get; private set; }
    public string? AfterJson { get; private set; }
    public string ChangedById { get; private set; } = string.Empty;
    public string ChangedByName { get; private set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; private set; }

    private EligibilityAuditEntry() { }

    public static EligibilityAuditEntry From(
        Guid campaignId,
        AuditChange change,
        string changedById,
        string changedByName,
        DateTimeOffset at) => new()
    {
        Id = Guid.NewGuid(),
        CampaignId = campaignId,
        Entity = change.Entity,
        EntityId = change.EntityId,
        Action = change.Action,
        BeforeJson = change.BeforeJson,
        AfterJson = change.AfterJson,
        ChangedById = changedById,
        ChangedByName = changedByName,
        ChangedAt = at,
    };
}
