using Campaigns.Application;
using Campaigns.Domain;
using Candidates.Application;
using Candidates.Domain;
using Identity.Application;
using Identity.Domain;
using Sessions.Application;
using SharedKernel;

namespace Candidates.Tests.Support;

/// <summary>In-memory stand-ins, so the service's rules can be tested without a database.</summary>
public sealed class FakeCandidateRepository : ICandidateRepository
{
    public Dictionary<Guid, Candidate> Candidates { get; } = [];
    public List<CandidateAuditEntry> Audit { get; } = [];
    public int SaveCount { get; private set; }
    public CandidateQuery? LastQuery { get; private set; }

    public void ResetSaves() => SaveCount = 0;

    /// <summary>Set to make the next save fail with this error (for example a taken phone).</summary>
    public Error? FailNextSave { get; set; }

    public Task<Candidate?> GetAsync(Guid campaignId, Guid candidateId, CancellationToken ct) =>
        Task.FromResult(Candidates.GetValueOrDefault(candidateId) is { } c && c.CampaignId == campaignId ? c : null);

    public Task<PagedResult<Candidate>> ListAsync(Guid campaignId, CandidateQuery query, CancellationToken ct)
    {
        LastQuery = query;
        var all = Candidates.Values.Where(c => c.CampaignId == campaignId).OrderByDescending(c => c.CreatedAt).ToList();
        var page = all.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToList();
        return Task.FromResult(new PagedResult<Candidate>(page, query.Page, query.PageSize, all.Count));
    }

    public Task<Candidate?> FindByPhoneAsync(Guid campaignId, string phone, Guid? exceptCandidateId, CancellationToken ct) =>
        Task.FromResult(Candidates.Values.FirstOrDefault(c => c.CampaignId == campaignId && c.Phone == phone && c.Id != exceptCandidateId));

    public Task<IReadOnlyList<string>> ListProvinceNamesAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<string>>(
            Candidates.Values.Where(c => c.CampaignId == campaignId).Select(c => c.ProvinceName).Distinct().Order().ToList());

    public void Add(Candidate candidate) => Candidates[candidate.Id] = candidate;

    public void Remove(Candidate candidate) => Candidates.Remove(candidate.Id);

    public void AddAudit(CandidateAuditEntry entry) => Audit.Add(entry);

    public Task<Result> SaveChangesAsync(CancellationToken ct)
    {
        SaveCount++;
        if (FailNextSave is { } error)
        {
            FailNextSave = null;
            return Task.FromResult(Result.Failure(error));
        }

        return Task.FromResult(Result.Success());
    }
}

public sealed class FakeGateway : ICampaignSetupGateway
{
    public Dictionary<Guid, CampaignSetupContext> Campaigns { get; } = [];

    /// <summary>Adds a campaign. Status is "Draft", "Active" or "Closed".</summary>
    public CampaignSetupContext AddCampaign(string status = "Active")
    {
        var context = new CampaignSetupContext(
            Guid.NewGuid(),
            "Selection 2027",
            status,
            status == "Draft",
            new DateOnly(2026, 11, 2),
            [new TargetProvince("2", "Battambang")],
            Enum.GetValues<SetupStepKey>().ToDictionary(k => k, _ => StepStatus.NotStarted));
        Campaigns[context.CampaignId] = context;
        return context;
    }

    public Task<CampaignSetupContext?> GetContextAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(Campaigns.GetValueOrDefault(campaignId));

    public Task<Result> SetStepStatusAsync(Guid campaignId, SetupStepKey step, StepStatus status, CancellationToken ct) =>
        Task.FromResult(Result.Success());
}

public sealed class FakeSessionChoices : ISessionChoices
{
    private readonly List<(Guid CampaignId, SessionChoice Choice)> _sessions = [];

    public SessionChoice Add(Guid campaignId, string title = "Open day", string status = "Planned", DateOnly? date = null)
    {
        var choice = new SessionChoice(
            Guid.NewGuid(), title, status == "Unscheduled" ? null : date ?? new DateOnly(2027, 3, 1), status, status is "Planned" or "Done");
        _sessions.Add((campaignId, choice));
        return choice;
    }

    /// <summary>Changes a session's status afterwards, for example when it is called off.</summary>
    public void SetStatus(Guid sessionId, string status)
    {
        var index = _sessions.FindIndex(s => s.Choice.Id == sessionId);
        var (campaignId, choice) = _sessions[index];
        _sessions[index] = (campaignId, choice with { Status = status, CanBeChosen = status is "Planned" or "Done" });
    }

    public Task<IReadOnlyList<SessionChoice>> ForCampaignAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SessionChoice>>(_sessions.Where(s => s.CampaignId == campaignId).Select(s => s.Choice).ToList());

    public Task<SessionChoice?> FindAsync(Guid campaignId, Guid sessionId, CancellationToken ct) =>
        Task.FromResult(_sessions.Where(s => s.CampaignId == campaignId && s.Choice.Id == sessionId).Select(s => s.Choice).FirstOrDefault());
}

public sealed class FakeSchoolDirectory : ISchoolDirectory
{
    public List<SchoolChoice> Active { get; } = [];

    public SchoolChoice Add(string name)
    {
        var school = new SchoolChoice(Guid.NewGuid(), name);
        Active.Add(school);
        return school;
    }

    public Task<IReadOnlyList<SchoolChoice>> ListActiveAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SchoolChoice>>(Active.OrderBy(s => s.Name).ToList());

    public Task<SchoolChoice?> FindActiveAsync(Guid hostId, CancellationToken ct) =>
        Task.FromResult(Active.FirstOrDefault(s => s.Id == hostId));
}

public sealed class FakeCurrentUser : ICurrentUserService
{
    public AuthenticatedUser? User { get; set; } =
        new("officer-1", "sokha", [Group.SelectionOfficer], "Sokha Officer");
}

public sealed class FakeClock : IClock
{
    /// <summary>2027-03-10 12:00 in Cambodia.</summary>
    public DateTimeOffset UtcNow { get; set; } = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
}
