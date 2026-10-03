using Campaigns.Domain;
using SharedKernel;

namespace Campaigns.Application;

public sealed class CampaignSetupGateway : ICampaignSetupGateway
{
    private readonly ICampaignRepository _repository;
    private readonly IClock _clock;

    public CampaignSetupGateway(ICampaignRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<CampaignSetupContext?> GetContextAsync(Guid campaignId, CancellationToken ct)
    {
        var campaign = await _repository.GetAsync(campaignId, ct);
        if (campaign is null)
        {
            return null;
        }

        var names = (await _repository.ListProvincesAsync(ct)).ToDictionary(p => p.Id, p => p.NameEn);
        var provinces = campaign.Provinces
            .Select(p => new TargetProvince(p.ProvinceId.ToString(), names.GetValueOrDefault(p.ProvinceId, p.ProvinceId.ToString())))
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .ToList();

        return new CampaignSetupContext(
            campaign.Id,
            campaign.Name,
            campaign.Status.ToString(),
            campaign.IsEditable,
            campaign.StartDate,
            provinces,
            campaign.Steps.ToDictionary(s => s.Step, s => s.Status));
    }

    public async Task<Result> SetStepStatusAsync(Guid campaignId, SetupStepKey step, StepStatus status, CancellationToken ct)
    {
        var campaign = await _repository.GetAsync(campaignId, ct);
        if (campaign is null)
        {
            return Result.Failure(CampaignErrors.NotFound);
        }

        var changed = campaign.SetStepStatus(step, status, _clock.UtcNow);
        if (changed.IsFailure)
        {
            return changed;
        }

        return await _repository.SaveChangesAsync(ct);
    }
}
