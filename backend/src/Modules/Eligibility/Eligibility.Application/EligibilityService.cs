using Campaigns.Application;
using Campaigns.Domain;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;
using Identity.Application;
using SharedKernel;

namespace Eligibility.Application;

public interface IEligibilityService
{
    Task<CatalogueDto> GetCatalogueAsync(CancellationToken ct);
    Task<Result<RuleSetDto>> GetAsync(Guid campaignId, CancellationToken ct);
    Task<Result<RuleSetDto>> SaveDraftAsync(Guid campaignId, RuleSetRequest request, CancellationToken ct);
    Task<Result<RuleSetDto>> CompleteAsync(Guid campaignId, RuleSetRequest request, CancellationToken ct);
    Task<Result<TestResultDto>> TestAsync(Guid campaignId, TestRequest request, CancellationToken ct);
    Task<Result<SuggestedDto>> GetSuggestedAsync(Guid campaignId, CancellationToken ct);

    /// <summary>
    /// Copies another campaign's rules into this one (new ids, same content) and marks the step
    /// In progress. Not reachable from the UI yet: it is for the Create dialog's "copy settings"
    /// option once campaigns can be completed.
    /// </summary>
    Task<Result> CopyRulesAsync(Guid sourceCampaignId, Guid targetCampaignId, CancellationToken ct);
}

/// <summary>
/// All eligibility-rule business logic. Controllers only translate HTTP; who may call what is
/// decided by the policies on the controller. Reading and testing work on any campaign;
/// saving and copying only on a Draft.
/// </summary>
public sealed class EligibilityService : IEligibilityService
{
    private readonly IEligibilityRepository _repository;
    private readonly ICampaignSetupGateway _campaigns;
    private readonly ICurrentUserService _currentUser;
    private readonly IClock _clock;

    public EligibilityService(
        IEligibilityRepository repository,
        ICampaignSetupGateway campaigns,
        ICurrentUserService currentUser,
        IClock clock)
    {
        _repository = repository;
        _campaigns = campaigns;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<CatalogueDto> GetCatalogueAsync(CancellationToken ct) =>
        Mapping.ToDto(await _repository.GetCatalogueAsync(ct));

    public async Task<Result<RuleSetDto>> GetAsync(Guid campaignId, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<RuleSetDto>(CampaignErrors.NotFound);
        }

        var ruleSet = await _repository.GetRuleSetAsync(campaignId, ct);
        return ToDto(context, ruleSet?.ToContent() ?? RuleSetContent.Empty, ruleSet, StepStatusOf(context));
    }

    public Task<Result<RuleSetDto>> SaveDraftAsync(Guid campaignId, RuleSetRequest request, CancellationToken ct) =>
        SaveAsync(campaignId, request, ValidationMode.Draft, ct);

    public Task<Result<RuleSetDto>> CompleteAsync(Guid campaignId, RuleSetRequest request, CancellationToken ct) =>
        SaveAsync(campaignId, request, ValidationMode.Complete, ct);

    public async Task<Result<TestResultDto>> TestAsync(Guid campaignId, TestRequest request, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<TestResultDto>(CampaignErrors.NotFound);
        }

        var catalogue = await _repository.GetCatalogueAsync(ct);
        var validated = RuleSetValidator.Validate(
            request.RuleSet ?? new RuleSetRequest(null, [], null), catalogue, context.TargetProvinces, ValidationMode.Test);
        if (!validated.IsValid)
        {
            return Result.Failure<TestResultDto>(EligibilityErrors.Invalid(validated.Errors));
        }

        var result = EligibilityEvaluator.Evaluate(validated.Content!, catalogue, new CandidateData(request.Candidate));
        return Mapping.ToDto(result);
    }

    public async Task<Result<SuggestedDto>> GetSuggestedAsync(Guid campaignId, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<SuggestedDto>(CampaignErrors.NotFound);
        }

        var suggested = SuggestedRules.Create(context.TargetProvinces.Select(p => p.Id).ToList(), context.StartDate);
        return new SuggestedDto(suggested.AgeReferenceDate, suggested.Groups.Select(Mapping.ToDto).ToList());
    }

    public async Task<Result> CopyRulesAsync(Guid sourceCampaignId, Guid targetCampaignId, CancellationToken ct)
    {
        var user = _currentUser.User;
        if (user is null)
        {
            return Result.Failure(EligibilityErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(targetCampaignId, ct);
        if (context is null)
        {
            return Result.Failure(CampaignErrors.NotFound);
        }

        if (!context.IsEditable)
        {
            return Result.Failure(CampaignErrors.NotEditable);
        }

        var source = await _repository.GetRuleSetAsync(sourceCampaignId, ct);
        if (source is null || !source.Groups.Any(g => g.Rules.Count > 0))
        {
            return Result.Failure(EligibilityErrors.NothingToCopy);
        }

        var copy = WithNewIds(source.ToContent());
        var now = _clock.UtcNow;
        var target = await _repository.GetRuleSetAsync(targetCampaignId, ct);
        if (target is null)
        {
            target = RuleSet.Create(targetCampaignId, now);
            _repository.Add(target);
        }

        var changes = RuleSetDiff.Compare(targetCampaignId, target.ToContent(), copy);
        target.Apply(copy, now, user.Subject, user.DisplayName);
        _repository.AddAudit(changes.Select(c => EligibilityAuditEntry.From(targetCampaignId, c, user.Subject, user.DisplayName, now)));

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return saved;
        }

        return await _campaigns.SetStepStatusAsync(targetCampaignId, SetupStepKey.EligibilityRules, StepStatus.InProgress, ct);
    }

    private async Task<Result<RuleSetDto>> SaveAsync(Guid campaignId, RuleSetRequest request, ValidationMode mode, CancellationToken ct)
    {
        var user = _currentUser.User;
        if (user is null)
        {
            return Result.Failure<RuleSetDto>(EligibilityErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<RuleSetDto>(CampaignErrors.NotFound);
        }

        if (!context.IsEditable)
        {
            return Result.Failure<RuleSetDto>(CampaignErrors.NotEditable);
        }

        var existing = await _repository.GetRuleSetAsync(campaignId, ct);
        if (request.Version is { } version && version != (existing?.Version ?? 0))
        {
            return Result.Failure<RuleSetDto>(EligibilityErrors.ConcurrentEdit);
        }

        var catalogue = await _repository.GetCatalogueAsync(ct);
        var validated = RuleSetValidator.Validate(request, catalogue, context.TargetProvinces, mode);
        if (!validated.IsValid)
        {
            return Result.Failure<RuleSetDto>(EligibilityErrors.Invalid(validated.Errors));
        }

        var now = _clock.UtcNow;
        var ruleSet = existing;
        if (ruleSet is null)
        {
            ruleSet = RuleSet.Create(campaignId, now);
            _repository.Add(ruleSet);
        }

        // Only write (and audit) when something actually changed, so "last changed by" stays honest
        // when someone saves without editing.
        var changes = RuleSetDiff.Compare(campaignId, ruleSet.ToContent(), validated.Content!);
        if (changes.Count > 0 || existing is null)
        {
            ruleSet.Apply(validated.Content!, now, user.Subject, user.DisplayName);
            _repository.AddAudit(changes.Select(c => EligibilityAuditEntry.From(campaignId, c, user.Subject, user.DisplayName, now)));
        }

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return Result.Failure<RuleSetDto>(saved.Error);
        }

        var step = mode == ValidationMode.Complete ? StepStatus.Complete : StepStatus.InProgress;
        var marked = await _campaigns.SetStepStatusAsync(campaignId, SetupStepKey.EligibilityRules, step, ct);
        if (marked.IsFailure)
        {
            return Result.Failure<RuleSetDto>(marked.Error);
        }

        return ToDto(context, ruleSet.ToContent(), ruleSet, step);
    }

    private static StepStatus StepStatusOf(CampaignSetupContext context) =>
        context.StepStatuses.GetValueOrDefault(SetupStepKey.EligibilityRules, StepStatus.NotStarted);

    private static RuleSetDto ToDto(CampaignSetupContext context, RuleSetContent content, RuleSet? ruleSet, StepStatus step) => new(
        context.CampaignId,
        context.Name,
        context.Status,
        context.StartDate,
        IsLocked: !context.IsEditable,
        step.ToString(),
        content.AgeReferenceDate,
        content.Groups.Select(Mapping.ToDto).ToList(),
        context.TargetProvinces.Select(p => new ProvinceOptionDto(p.Id, p.Name)).ToList(),
        ruleSet?.Version ?? 0,
        ruleSet?.UpdatedAt,
        ruleSet?.UpdatedByName);

    private static RuleSetContent WithNewIds(RuleSetContent content) => content with
    {
        Groups = content.Groups
            .Select(g => g with
            {
                Id = Guid.NewGuid(),
                Rules = g.Rules.Select(r => r with { Id = Guid.NewGuid() }).ToList(),
            })
            .ToList(),
    };
}
