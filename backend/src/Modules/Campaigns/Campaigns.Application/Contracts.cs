using Campaigns.Domain;

namespace Campaigns.Application;

/// <summary>Request body of POST /api/campaigns. Fields are nullable so missing values become field errors.</summary>
public sealed record CreateCampaignRequest(
    string? Name,
    string? AcademicYear,
    string? Description,
    string? StartMode);

/// <summary>
/// Request body for saving Step 1. Used for both "Save draft" (partial allowed) and
/// "Save and continue" (everything required). <see cref="Version"/> is the value the
/// client last read; a mismatch means someone else saved in between.
/// </summary>
public sealed record CampaignInfoRequest(
    string? Name,
    string? AcademicYear,
    string? Description,
    DateOnly? StartDate,
    DateOnly? EndDate,
    int? ExpectedCandidates,
    int? SeatsAvailable,
    short[]? ProvinceIds,
    uint? Version);

public static class StartModes
{
    public const string Scratch = "scratch";
    public const string Copy = "copy";
}

public sealed record StepDto(string Step, int Order, string Status);

public sealed record ProgressDto(int Total, int Complete, int InProgress);

public sealed record CampaignSummaryDto(
    Guid Id,
    string Name,
    string AcademicYear,
    string Status,
    DateTimeOffset CreatedAt);

public sealed record CampaignDetailDto(
    Guid Id,
    string Name,
    string AcademicYear,
    string? Description,
    string Status,
    DateOnly? StartDate,
    DateOnly? EndDate,
    int? ExpectedCandidates,
    int? SeatsAvailable,
    IReadOnlyList<short> ProvinceIds,
    string CreatedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset InfoSavedAt,
    uint Version,
    IReadOnlyList<StepDto> Steps,
    ProgressDto Progress,
    bool CanActivate)
{
    public static CampaignDetailDto From(Campaign campaign)
    {
        var steps = campaign.Steps
            .OrderBy(s => s.Step)
            .Select(s => new StepDto(s.Step.ToString(), (int)s.Step, s.Status.ToString()))
            .ToList();

        return new CampaignDetailDto(
            campaign.Id,
            campaign.Name,
            campaign.AcademicYear,
            campaign.Description,
            campaign.Status.ToString(),
            campaign.StartDate,
            campaign.EndDate,
            campaign.ExpectedCandidates,
            campaign.SeatsAvailable,
            campaign.Provinces.Select(p => p.ProvinceId).OrderBy(id => id).ToList(),
            campaign.CreatedByName,
            campaign.CreatedAt,
            campaign.UpdatedAt,
            campaign.GetStep(SetupStepKey.CampaignInfo).UpdatedAt,
            campaign.Version,
            steps,
            new ProgressDto(
                steps.Count,
                campaign.Steps.Count(s => s.Status == StepStatus.Complete),
                campaign.Steps.Count(s => s.Status == StepStatus.InProgress)),
            campaign.CanActivate);
    }
}

public sealed record ProvinceDto(short Id, string Code, string Name);
