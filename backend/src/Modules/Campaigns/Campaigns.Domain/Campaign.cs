using SharedKernel;

namespace Campaigns.Domain;

/// <summary>
/// One selection cycle (for example "Selection 2027"). Owns its five setup steps
/// and its target provinces. All state changes go through this class so the step
/// statuses can never drift from the data they describe.
/// </summary>
public sealed class Campaign : BaseEntity<Guid>
{
    private readonly List<SetupStep> _steps = [];
    private readonly List<CampaignProvince> _provinces = [];

    public string Name { get; private set; } = string.Empty;

    /// <summary>Trimmed, case-folded name. Backs the unique index.</summary>
    public string NameNormalized { get; private set; } = string.Empty;

    public string AcademicYear { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public CampaignStatus Status { get; private set; }
    public DateOnly? StartDate { get; private set; }
    public DateOnly? EndDate { get; private set; }
    public int? ExpectedCandidates { get; private set; }
    public int? SeatsAvailable { get; private set; }

    /// <summary>Keycloak subject of the creator.</summary>
    public string CreatedById { get; private set; } = string.Empty;

    /// <summary>Display name at creation time. Keycloak owns users, so this is a snapshot.</summary>
    public string CreatedByName { get; private set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>PostgreSQL xmin. Detects two people saving the same campaign at once.</summary>
    public uint Version { get; private set; }

    public IReadOnlyCollection<SetupStep> Steps => _steps;
    public IReadOnlyCollection<CampaignProvince> Provinces => _provinces;

    private Campaign() { }

    public static string Normalize(string name) => name.Trim().ToLowerInvariant();

    /// <summary>
    /// Creates a Draft campaign. Step 1 starts In progress because the name and
    /// academic year already belong to it; steps 2-5 start Not started.
    /// </summary>
    public static Campaign Create(
        string name,
        string academicYear,
        string? description,
        string createdById,
        string createdByName,
        DateTimeOffset now)
    {
        var campaign = new Campaign
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            NameNormalized = Normalize(name),
            AcademicYear = academicYear.Trim(),
            Description = NullIfBlank(description),
            Status = CampaignStatus.Draft,
            CreatedById = createdById,
            CreatedByName = createdByName,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var key in Enum.GetValues<SetupStepKey>())
        {
            var status = key == SetupStepKey.CampaignInfo ? StepStatus.InProgress : StepStatus.NotStarted;
            campaign._steps.Add(new SetupStep(campaign.Id, key, status, now));
        }

        return campaign;
    }

    public bool IsEditable => Status == CampaignStatus.Draft;

    public SetupStep GetStep(SetupStepKey key) => _steps.Single(s => s.Step == key);

    /// <summary>True when the campaign is a Draft and all five steps are Complete.</summary>
    public bool CanActivate => IsEditable && _steps.All(s => s.Status == StepStatus.Complete);

    /// <summary>
    /// Sets the stored status of a setup step. Steps 2-5 call this (through the setup
    /// gateway) when their own page saves; step 1 sets its own status through
    /// <see cref="SaveInfoDraft"/> and <see cref="CompleteInfo"/>.
    /// </summary>
    public Result SetStepStatus(SetupStepKey key, StepStatus status, DateTimeOffset now)
    {
        if (!IsEditable)
        {
            return Result.Failure(CampaignErrors.NotEditable);
        }

        GetStep(key).SetStatus(status, now);
        UpdatedAt = now;
        return Result.Success();
    }

    /// <summary>Stores partial Step 1 data and marks the step In progress.</summary>
    public Result SaveInfoDraft(CampaignInfo info, DateTimeOffset now) => ApplyInfo(info, StepStatus.InProgress, now);

    /// <summary>Stores complete Step 1 data and marks the step Complete.</summary>
    public Result CompleteInfo(CampaignInfo info, DateTimeOffset now) => ApplyInfo(info, StepStatus.Complete, now);

    private Result ApplyInfo(CampaignInfo info, StepStatus resultingStatus, DateTimeOffset now)
    {
        if (!IsEditable)
        {
            return Result.Failure(CampaignErrors.NotEditable);
        }

        Name = info.Name.Trim();
        NameNormalized = Normalize(info.Name);
        AcademicYear = info.AcademicYear.Trim();
        Description = NullIfBlank(info.Description);
        StartDate = info.StartDate;
        EndDate = info.EndDate;
        ExpectedCandidates = info.ExpectedCandidates;
        SeatsAvailable = info.SeatsAvailable;

        var wanted = info.ProvinceIds.ToHashSet();
        _provinces.RemoveAll(p => !wanted.Contains(p.ProvinceId));
        foreach (var id in wanted.Where(id => _provinces.All(p => p.ProvinceId != id)))
        {
            _provinces.Add(new CampaignProvince(Id, id));
        }

        GetStep(SetupStepKey.CampaignInfo).SetStatus(resultingStatus, now);
        UpdatedAt = now;
        return Result.Success();
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
