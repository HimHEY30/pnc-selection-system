using Campaigns.Domain;
using SharedKernel;

namespace Campaigns.Application;

public sealed record TargetProvince(string Id, string Name);

/// <summary>What a setup step (eligibility rules, sessions, ...) needs to know about its campaign.</summary>
public sealed record CampaignSetupContext(
    Guid CampaignId,
    string Name,
    string Status,
    bool IsEditable,
    DateOnly? StartDate,
    IReadOnlyList<TargetProvince> TargetProvinces,
    IReadOnlyDictionary<SetupStepKey, StepStatus> StepStatuses);

/// <summary>
/// The door other modules use to work with a campaign's setup. The Eligibility module (and
/// later Sessions, Candidates and Exam) read the campaign through this and report their step's
/// status back, instead of reaching into the campaign tables. Published by the Campaigns module.
/// </summary>
public interface ICampaignSetupGateway
{
    /// <summary>The campaign's basics, or null when it does not exist.</summary>
    Task<CampaignSetupContext?> GetContextAsync(Guid campaignId, CancellationToken ct);

    /// <summary>Sets a setup step's status. Fails if the campaign does not exist or is no longer a draft.</summary>
    Task<Result> SetStepStatusAsync(Guid campaignId, SetupStepKey step, StepStatus status, CancellationToken ct);
}
