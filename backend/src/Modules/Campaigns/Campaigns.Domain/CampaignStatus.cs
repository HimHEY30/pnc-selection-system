namespace Campaigns.Domain;

/// <summary>
/// Lifecycle of a campaign: Draft -> Active -> Closed. Only Draft is reachable
/// today; the other values exist so activation and closing can be added without
/// a schema change. Stored as a smallint, so never reorder or renumber.
/// </summary>
public enum CampaignStatus : short
{
    Draft = 0,
    Active = 1,
    Closed = 2,
}
