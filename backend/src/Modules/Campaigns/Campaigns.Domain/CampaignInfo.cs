namespace Campaigns.Domain;

/// <summary>The editable content of Step 1, already validated by the application layer.</summary>
public sealed record CampaignInfo(
    string Name,
    string AcademicYear,
    string? Description,
    DateOnly? StartDate,
    DateOnly? EndDate,
    int? ExpectedCandidates,
    int? SeatsAvailable,
    IReadOnlyCollection<short> ProvinceIds);
