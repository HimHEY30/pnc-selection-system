using System.Text.Json;
using Campaigns.Application;
using Campaigns.Domain;
using Candidates.Domain;
using Identity.Application;
using Identity.Domain;
using Sessions.Application;
using SharedKernel;

namespace Candidates.Application;

public interface ICandidateService
{
    /// <summary>A page of the campaign's candidates, newest first, with the filter's province list.</summary>
    Task<Result<CandidateListDto>> ListAsync(Guid campaignId, CandidateListRequest request, CancellationToken ct);

    Task<Result<CandidateDto>> GetAsync(Guid campaignId, Guid candidateId, CancellationToken ct);

    Task<Result<CandidateDto>> CreateAsync(Guid campaignId, CandidateRequest request, CancellationToken ct);

    Task<Result<CandidateDto>> UpdateAsync(Guid campaignId, Guid candidateId, CandidateRequest request, CancellationToken ct);

    Task<Result> DeleteAsync(Guid campaignId, Guid candidateId, CancellationToken ct);

    /// <summary>The campaign's sessions that a candidate can be said to have come to.</summary>
    Task<Result<IReadOnlyList<SessionChoice>>> ListSessionChoicesAsync(Guid campaignId, CancellationToken ct);

    /// <summary>The high schools in the partner directory that are switched on.</summary>
    Task<IReadOnlyList<SchoolChoice>> ListSchoolsAsync(CancellationToken ct);
}

/// <summary>
/// Candidates of a campaign: add, change, delete, look up. Every change is audited. Which role may call what is decided
/// by the API; the rules about the candidate's own fields live in <see cref="Candidate"/>, and the rules that need
/// other data (open campaign, one phone per campaign, the school and session being real and allowed) are here.
/// </summary>
public sealed class CandidateService : ICandidateService
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ICandidateRepository _repository;
    private readonly ICampaignSetupGateway _campaigns;
    private readonly ISessionChoices _sessions;
    private readonly ISchoolDirectory _schools;
    private readonly ICurrentUserService _currentUser;
    private readonly IClock _clock;

    public CandidateService(
        ICandidateRepository repository,
        ICampaignSetupGateway campaigns,
        ISessionChoices sessions,
        ISchoolDirectory schools,
        ICurrentUserService currentUser,
        IClock clock)
    {
        _repository = repository;
        _campaigns = campaigns;
        _sessions = sessions;
        _schools = schools;
        _currentUser = currentUser;
        _clock = clock;
    }

    // ---------- Reading ----------

    public async Task<Result<CandidateListDto>> ListAsync(Guid campaignId, CandidateListRequest request, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<CandidateListDto>(CampaignErrors.NotFound);
        }

        var pageSize = request.PageSize is { } size and > 0 ? Math.Min(size, MaxPageSize) : DefaultPageSize;
        var page = request.Page is { } number and > 0 ? number : 1;
        var query = new CandidateQuery(request.Search, request.Province, request.SessionId, request.NgoSupport, page, pageSize);

        var found = await _repository.ListAsync(campaignId, query, ct);
        var provinces = await _repository.ListProvinceNamesAsync(campaignId, ct);
        var sessions = await SessionsByIdAsync(campaignId, ct);

        return new CandidateListDto(
            campaignId,
            context.Name,
            context.Status,
            CanChange(context),
            provinces,
            found.Items.Select(c => ToDto(c, sessions)).ToList(),
            found.PageNumber,
            found.PageSize,
            found.TotalCount,
            found.TotalPages);
    }

    public async Task<Result<CandidateDto>> GetAsync(Guid campaignId, Guid candidateId, CancellationToken ct)
    {
        if (await _campaigns.GetContextAsync(campaignId, ct) is null)
        {
            return Result.Failure<CandidateDto>(CampaignErrors.NotFound);
        }

        var candidate = await _repository.GetAsync(campaignId, candidateId, ct);
        return candidate is null
            ? Result.Failure<CandidateDto>(CandidateErrors.NotFound)
            : ToDto(candidate, await SessionsByIdAsync(campaignId, ct));
    }

    public async Task<Result<IReadOnlyList<SessionChoice>>> ListSessionChoicesAsync(Guid campaignId, CancellationToken ct)
    {
        if (await _campaigns.GetContextAsync(campaignId, ct) is null)
        {
            return Result.Failure<IReadOnlyList<SessionChoice>>(CampaignErrors.NotFound);
        }

        var all = await _sessions.ForCampaignAsync(campaignId, ct);
        return Result.Success<IReadOnlyList<SessionChoice>>(all.Where(s => s.CanBeChosen).ToList());
    }

    public Task<IReadOnlyList<SchoolChoice>> ListSchoolsAsync(CancellationToken ct) => _schools.ListActiveAsync(ct);

    // ---------- Adding, changing, deleting ----------

    public async Task<Result<CandidateDto>> CreateAsync(Guid campaignId, CandidateRequest request, CancellationToken ct)
    {
        var opened = await OpenCampaignAsync(campaignId, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<CandidateDto>(opened.Error);
        }

        var (context, user) = opened.Value;
        var prepared = await PrepareAsync(campaignId, request, existing: null, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<CandidateDto>(prepared.Error);
        }

        var created = Candidate.Create(campaignId, prepared.Value, user.Subject, user.DisplayName, _clock.UtcNow);
        if (created.IsFailure)
        {
            return Result.Failure<CandidateDto>(created.Error);
        }

        var candidate = created.Value;
        _repository.Add(candidate);
        AddAudit(candidate.CampaignId, candidate.Id, AuditAction.Created, null, Snapshot(candidate), user);

        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure
            ? Result.Failure<CandidateDto>(saved.Error)
            : ToDto(candidate, await SessionsByIdAsync(campaignId, ct));
    }

    public async Task<Result<CandidateDto>> UpdateAsync(Guid campaignId, Guid candidateId, CandidateRequest request, CancellationToken ct)
    {
        var opened = await OpenAsync(campaignId, candidateId, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<CandidateDto>(opened.Error);
        }

        var (_, candidate, user) = opened.Value;

        // The person was looking at an older copy: somebody saved in between.
        if (request.Version is not { } version || version != candidate.Version)
        {
            return Result.Failure<CandidateDto>(CandidateErrors.ConcurrentEdit);
        }

        var prepared = await PrepareAsync(campaignId, request, candidate, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<CandidateDto>(prepared.Error);
        }

        var before = Snapshot(candidate);
        var changed = candidate.Change(prepared.Value, _clock.UtcNow);
        if (changed.IsFailure)
        {
            return Result.Failure<CandidateDto>(changed.Error);
        }

        var after = Snapshot(candidate);
        if (before != after)
        {
            AddAudit(candidate.CampaignId, candidate.Id, AuditAction.Updated, before, after, user);

            var saved = await _repository.SaveChangesAsync(ct);
            if (saved.IsFailure)
            {
                return Result.Failure<CandidateDto>(saved.Error);
            }
        }

        return ToDto(candidate, await SessionsByIdAsync(campaignId, ct));
    }

    public async Task<Result> DeleteAsync(Guid campaignId, Guid candidateId, CancellationToken ct)
    {
        var opened = await OpenAsync(campaignId, candidateId, ct);
        if (opened.IsFailure)
        {
            return Result.Failure(opened.Error);
        }

        var (_, candidate, user) = opened.Value;
        _repository.Remove(candidate);
        AddAudit(candidate.CampaignId, candidate.Id, AuditAction.Deleted, Snapshot(candidate), null, user);

        return await _repository.SaveChangesAsync(ct);
    }

    // ---------- Shared steps ----------

    private sealed record OpenedCampaign(CampaignSetupContext Context, AuthenticatedUser User);

    private sealed record Opened(CampaignSetupContext Context, Candidate Candidate, AuthenticatedUser User);

    /// <summary>Checks the caller is signed in and the campaign exists and has not been closed.</summary>
    private async Task<Result<OpenedCampaign>> OpenCampaignAsync(Guid campaignId, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<OpenedCampaign>(CandidateErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<OpenedCampaign>(CampaignErrors.NotFound);
        }

        return CanChange(context)
            ? new OpenedCampaign(context, user)
            : Result.Failure<OpenedCampaign>(CandidateErrors.CampaignClosed);
    }

    private async Task<Result<Opened>> OpenAsync(Guid campaignId, Guid candidateId, CancellationToken ct)
    {
        var opened = await OpenCampaignAsync(campaignId, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<Opened>(opened.Error);
        }

        var candidate = await _repository.GetAsync(campaignId, candidateId, ct);
        return candidate is null
            ? Result.Failure<Opened>(CandidateErrors.NotFound)
            : new Opened(opened.Value.Context, candidate, opened.Value.User);
    }

    /// <summary>Candidates can be added and changed while a campaign is a draft or running, not once it is closed.</summary>
    private static bool CanChange(CampaignSetupContext context) =>
        !string.Equals(context.Status, nameof(CampaignStatus.Closed), StringComparison.Ordinal);

    /// <summary>
    /// Reads a form into checked details: parses the gender, looks up the school and the session, applies the domain's
    /// rules and makes sure the phone is not another candidate's. Every field problem is reported at once.
    /// </summary>
    private async Task<Result<CandidateDetails>> PrepareAsync(Guid campaignId, CandidateRequest request, Candidate? existing, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();

        Gender? gender = null;
        if (!string.IsNullOrWhiteSpace(request.Gender) && Enum.TryParse<Gender>(request.Gender.Trim(), ignoreCase: true, out var parsed)
            && Enum.IsDefined(parsed) && !char.IsDigit(request.Gender.Trim()[0]))
        {
            gender = parsed;
        }

        // A school picked from the directory: its name comes from there, not from the form.
        Guid? schoolHostId = null;
        var schoolName = request.SchoolName;
        if (request.SchoolHostId is { } hostId)
        {
            if (existing?.SchoolHostId == hostId)
            {
                // Unchanged: it stays even if the school has been switched off since.
                schoolHostId = hostId;
                schoolName = existing.SchoolName;
            }
            else if (await _schools.FindActiveAsync(hostId, ct) is { } school)
            {
                schoolHostId = school.Id;
                schoolName = school.Name;
            }
            else
            {
                errors["schoolHostId"] = ["Choose a high school from the list, or type its name."];
            }
        }

        if (request.SessionId is { } sessionId && !(existing?.SessionId == sessionId))
        {
            var session = await _sessions.FindAsync(campaignId, sessionId, ct);
            if (session is null)
            {
                errors["sessionId"] = ["This session is not one of this campaign's sessions."];
            }
            else if (!session.CanBeChosen)
            {
                errors["sessionId"] = ["This session was cancelled or has no date yet, so it cannot be chosen."];
            }
        }

        var address = request.Address;
        var details = new CandidateDetails(
            request.NameKm,
            request.NameEn,
            gender,
            request.DateOfBirth,
            request.Phone,
            address is null ? null : new CandidateAddress(ToPlace(address.Province), ToPlace(address.District), ToPlace(address.Commune), ToPlace(address.Village)),
            schoolHostId,
            schoolName,
            request.SessionId,
            request.HasNgoSupport ?? false,
            request.NgoName);

        var validated = Candidate.Validate(details, _clock.UtcNow);
        if (validated.IsFailure)
        {
            foreach (var (field, messages) in validated.Error.FieldErrors ?? new Dictionary<string, string[]>())
            {
                errors[field] = [.. errors.GetValueOrDefault(field, []), .. messages];
            }
        }

        if (errors.Count > 0)
        {
            return Result.Failure<CandidateDetails>(CandidateErrors.Invalid(errors));
        }

        var clash = await _repository.FindByPhoneAsync(campaignId, validated.Value.Phone!, existing?.Id, ct);
        return clash is not null
            ? Result.Failure<CandidateDetails>(CandidateErrors.DuplicatePhone(clash.NameEn))
            : validated;
    }

    private static Place? ToPlace(PlaceDto? place) => place is null ? null : new Place(place.Code, place.Name);

    private async Task<IReadOnlyDictionary<Guid, SessionChoice>> SessionsByIdAsync(Guid campaignId, CancellationToken ct) =>
        (await _sessions.ForCampaignAsync(campaignId, ct)).ToDictionary(s => s.Id);

    private void AddAudit(Guid campaignId, Guid candidateId, AuditAction action, string? before, string? after, AuthenticatedUser user) =>
        _repository.AddAudit(CandidateAuditEntry.Record(
            campaignId, candidateId, action, before, after, user.Subject, user.DisplayName, _clock.UtcNow));

    /// <summary>What an audit line keeps of a candidate: everything a person can type or choose.</summary>
    internal static string Snapshot(Candidate c) => JsonSerializer.Serialize(
        new
        {
            nameKm = c.NameKm,
            nameEn = c.NameEn,
            gender = c.Gender.ToString(),
            dateOfBirth = c.DateOfBirth.ToString("yyyy-MM-dd"),
            phone = c.Phone,
            province = new { code = c.ProvinceCode, name = c.ProvinceName },
            district = new { code = c.DistrictCode, name = c.DistrictName },
            commune = new { code = c.CommuneCode, name = c.CommuneName },
            village = new { code = c.VillageCode, name = c.VillageName },
            schoolHostId = c.SchoolHostId,
            schoolName = c.SchoolName,
            sessionId = c.SessionId,
            hasNgoSupport = c.HasNgoSupport,
            ngoName = c.NgoName,
        },
        Json);

    private static CandidateDto ToDto(Candidate c, IReadOnlyDictionary<Guid, SessionChoice> sessions) => new(
        c.Id,
        c.CampaignId,
        c.NameKm,
        c.NameEn,
        c.Gender.ToString(),
        c.DateOfBirth,
        c.Phone,
        new AddressDto(
            new PlaceDto(c.ProvinceCode, c.ProvinceName),
            new PlaceDto(c.DistrictCode, c.DistrictName),
            new PlaceDto(c.CommuneCode, c.CommuneName),
            c.VillageName is null ? null : new PlaceDto(c.VillageCode, c.VillageName)),
        c.SchoolHostId,
        c.SchoolName,
        c.SessionId is { } id && sessions.TryGetValue(id, out var s) ? new CandidateSessionDto(s.Id, s.Title, s.Date, s.Status) : null,
        c.HasNgoSupport,
        c.NgoName,
        c.CreatedByName,
        c.CreatedAt,
        c.UpdatedAt,
        c.Version);
}
