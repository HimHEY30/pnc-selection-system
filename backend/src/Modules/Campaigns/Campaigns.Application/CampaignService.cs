using Campaigns.Domain;
using Identity.Application;
using SharedKernel;

namespace Campaigns.Application;

public interface ICampaignService
{
    Task<Result<CampaignDetailDto>> CreateAsync(CreateCampaignRequest request, CancellationToken ct);
    Task<IReadOnlyList<CampaignSummaryDto>> ListAsync(CancellationToken ct);
    Task<Result<CampaignDetailDto>> GetAsync(Guid id, CancellationToken ct);
    Task<Result<CampaignDetailDto>> SaveInfoDraftAsync(Guid id, CampaignInfoRequest request, CancellationToken ct);
    Task<Result<CampaignDetailDto>> CompleteInfoAsync(Guid id, CampaignInfoRequest request, CancellationToken ct);
    Task<IReadOnlyList<ProvinceDto>> ListProvincesAsync(CancellationToken ct);
}

/// <summary>
/// All campaign business logic. Controllers only translate HTTP to and from this
/// class; who may call it is decided by the authorization policies on the controller.
/// </summary>
public sealed class CampaignService : ICampaignService
{
    private readonly ICampaignRepository _repository;
    private readonly ICurrentUserService _currentUser;
    private readonly IClock _clock;
    private readonly IReadOnlyDictionary<string, ICampaignCopyPart> _copyParts;

    public CampaignService(
        ICampaignRepository repository,
        ICurrentUserService currentUser,
        IClock clock,
        IEnumerable<ICampaignCopyPart> copyParts)
    {
        _repository = repository;
        _currentUser = currentUser;
        _clock = clock;
        _copyParts = copyParts.ToDictionary(p => p.Key);
    }

    public async Task<Result<CampaignDetailDto>> CreateAsync(CreateCampaignRequest request, CancellationToken ct)
    {
        var user = _currentUser.User;
        if (user is null)
        {
            return Result.Failure<CampaignDetailDto>(Error.Forbidden("campaign.no_user", "You must be signed in."));
        }

        var errors = CampaignValidator.ValidateCreate(request);
        await CheckNameIsUniqueAsync(errors, request.Name, excludingCampaignId: null, ct);

        // Only a source that exists can be copied. Any campaign will do, whatever its status: copying only reads it.
        Campaign? source = null;
        if (CampaignValidator.IsCopy(request) && !errors.ContainsKey(CampaignValidator.CopySourceKey))
        {
            source = await _repository.GetAsync(request.CopyFrom!.SourceCampaignId!.Value, ct);
            if (source is null)
            {
                AddError(errors, CampaignValidator.CopySourceKey, "The campaign to copy from no longer exists.");
            }
        }

        if (errors.Count > 0)
        {
            return Result.Failure<CampaignDetailDto>(CampaignErrors.Invalid(errors));
        }

        var now = _clock.UtcNow;
        var campaign = Campaign.Create(
            request.Name!,
            request.AcademicYear!,
            request.Description,
            user.Subject,
            user.DisplayName,
            now);

        var parts = source is null ? new HashSet<string>() : CampaignValidator.RequestedParts(request.CopyFrom).ToHashSet();
        var results = new List<CopyPartResult>();
        if (source is not null)
        {
            // Provinces and details belong to the campaign itself, so they are saved with it.
            var own = campaign.CopySettingsFrom(source, details: parts.Contains(CopyParts.Details), provinces: parts.Contains(CopyParts.Provinces), now);
            if (own.IsFailure)
            {
                return Result.Failure<CampaignDetailDto>(own.Error);
            }

            if (parts.Contains(CopyParts.Provinces))
            {
                results.Add(CopyPartResult.Copied(CopyParts.Provinces, source.Provinces.Count));
            }

            if (parts.Contains(CopyParts.Details))
            {
                results.Add(CopyPartResult.Copied(CopyParts.Details, 1));
            }
        }

        _repository.Add(campaign);
        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return Result.Failure<CampaignDetailDto>(NameRaceToFieldError(saved.Error));
        }

        if (source is null)
        {
            return CampaignDetailDto.From(campaign);
        }

        // The rest belong to other modules, which save in their own transaction after the campaign exists. A part that
        // fails is reported and does not undo the campaign or the other parts.
        var context = new CopyContext(source.Id, campaign.Id, user.Subject, user.DisplayName);
        foreach (var key in CopyParts.All.Where(k => parts.Contains(k) && k is not (CopyParts.Provinces or CopyParts.Details)))
        {
            results.Add(_copyParts.TryGetValue(key, out var part)
                ? await part.CopyAsync(context, ct)
                : CopyPartResult.Failed(key, "Copying this is not available yet."));
        }

        // Rules and sessions change the campaign's step statuses through their own gateway calls, so read it again.
        var current = await _repository.GetAsync(campaign.Id, ct) ?? campaign;
        return CampaignDetailDto.From(current) with { CopyResults = results };
    }

    public Task<IReadOnlyList<CampaignSummaryDto>> ListAsync(CancellationToken ct) =>
        _repository.ListSummariesAsync(ct);

    public async Task<Result<CampaignDetailDto>> GetAsync(Guid id, CancellationToken ct)
    {
        var campaign = await _repository.GetAsync(id, ct);
        return campaign is null
            ? Result.Failure<CampaignDetailDto>(CampaignErrors.NotFound)
            : CampaignDetailDto.From(campaign);
    }

    public Task<Result<CampaignDetailDto>> SaveInfoDraftAsync(Guid id, CampaignInfoRequest request, CancellationToken ct) =>
        SaveInfoAsync(id, request, complete: false, ct);

    public Task<Result<CampaignDetailDto>> CompleteInfoAsync(Guid id, CampaignInfoRequest request, CancellationToken ct) =>
        SaveInfoAsync(id, request, complete: true, ct);

    public async Task<IReadOnlyList<ProvinceDto>> ListProvincesAsync(CancellationToken ct)
    {
        var provinces = await _repository.ListProvincesAsync(ct);
        return provinces.Select(p => new ProvinceDto(p.Id, p.Code, p.NameEn)).ToList();
    }

    private async Task<Result<CampaignDetailDto>> SaveInfoAsync(
        Guid id,
        CampaignInfoRequest request,
        bool complete,
        CancellationToken ct)
    {
        var campaign = await _repository.GetAsync(id, ct);
        if (campaign is null)
        {
            return Result.Failure<CampaignDetailDto>(CampaignErrors.NotFound);
        }

        if (!campaign.IsEditable)
        {
            return Result.Failure<CampaignDetailDto>(CampaignErrors.NotEditable);
        }

        if (request.Version is { } version && version != campaign.Version)
        {
            return Result.Failure<CampaignDetailDto>(CampaignErrors.ConcurrentEdit);
        }

        var errors = CampaignValidator.ValidateInfo(request, complete);
        await CheckNameIsUniqueAsync(errors, request.Name, campaign.Id, ct);

        var provinceIds = (request.ProvinceIds ?? []).Distinct().ToArray();
        var existing = await _repository.ExistingProvinceIdsAsync(provinceIds, ct);
        if (provinceIds.Any(p => !existing.Contains(p)))
        {
            AddError(errors, CampaignValidator.ProvinceIdsKey, "One of the selected provinces does not exist.");
        }

        if (errors.Count > 0)
        {
            return Result.Failure<CampaignDetailDto>(CampaignErrors.Invalid(errors));
        }

        var info = new CampaignInfo(
            request.Name!,
            request.AcademicYear!,
            request.Description,
            request.StartDate,
            request.EndDate,
            request.ExpectedCandidates,
            request.SeatsAvailable,
            provinceIds);

        var applied = complete
            ? campaign.CompleteInfo(info, _clock.UtcNow)
            : campaign.SaveInfoDraft(info, _clock.UtcNow);
        if (applied.IsFailure)
        {
            return Result.Failure<CampaignDetailDto>(applied.Error);
        }

        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure
            ? Result.Failure<CampaignDetailDto>(NameRaceToFieldError(saved.Error))
            : CampaignDetailDto.From(campaign);
    }

    private async Task CheckNameIsUniqueAsync(
        Dictionary<string, string[]> errors,
        string? name,
        Guid? excludingCampaignId,
        CancellationToken ct)
    {
        // Skip the lookup when the name already failed its own checks.
        if (string.IsNullOrWhiteSpace(name) || errors.ContainsKey(CampaignValidator.NameKey))
        {
            return;
        }

        if (await _repository.NameExistsAsync(Campaign.Normalize(name), excludingCampaignId, ct))
        {
            AddError(errors, CampaignValidator.NameKey, DuplicateNameMessage);
        }
    }

    private const string DuplicateNameMessage = "A campaign with this name already exists.";

    /// <summary>Turns the repository's duplicate-name failure into the same field error the pre-check gives.</summary>
    private static Error NameRaceToFieldError(Error error) =>
        error.Code == CampaignRepositoryErrors.DuplicateName.Code
            ? CampaignErrors.Invalid(new Dictionary<string, string[]>
            {
                [CampaignValidator.NameKey] = [DuplicateNameMessage],
            })
            : error;

    private static void AddError(Dictionary<string, string[]> errors, string field, string message) =>
        errors[field] = errors.TryGetValue(field, out var existing) ? [.. existing, message] : [message];
}
