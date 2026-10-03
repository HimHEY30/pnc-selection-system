namespace Campaigns.Domain;

/// <summary>Per-campaign, per-step progress. Stored as a smallint.</summary>
public enum StepStatus : short
{
    NotStarted = 0,
    InProgress = 1,
    Complete = 2,
}
