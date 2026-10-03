using Campaigns.Application;
using Campaigns.Domain;
using Identity.Application;
using Identity.Domain;
using Sessions.Application;
using Sessions.Domain;
using SharedKernel;

namespace Sessions.Tests.Support;

/// <summary>In-memory stand-ins, so the services' rules can be tested without a database.</summary>
public sealed class FakeRepository : ISessionRepository
{
    public Dictionary<Guid, SessionHost> Hosts { get; } = [];
    public Dictionary<Guid, InformationSession> Sessions { get; } = [];
    public List<SessionAuditEntry> Audit { get; } = [];
    public int SaveCount { get; private set; }

    /// <summary>Set to make the next save fail with this error (for example a concurrent edit).</summary>
    public Error? FailNextSave { get; set; }

    public Task<SessionHost?> GetHostAsync(Guid id, CancellationToken ct) => Task.FromResult(Hosts.GetValueOrDefault(id));

    public Task<IReadOnlyList<SessionHost>> ListHostsAsync(HostType? type, bool includeInactive, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SessionHost>>(Hosts.Values
            .Where(h => (type is null || h.Type == type) && (includeInactive || h.IsActive))
            .OrderBy(h => h.NameNormalized)
            .ToList());

    public Task<IReadOnlyDictionary<Guid, SessionHost>> GetHostsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<Guid, SessionHost>>(Hosts.Where(h => ids.Contains(h.Key)).ToDictionary(h => h.Key, h => h.Value));

    public void AddHost(SessionHost host) => Hosts[host.Id] = host;

    public Task<InformationSession?> GetSessionAsync(Guid campaignId, Guid sessionId, CancellationToken ct) =>
        Task.FromResult(Sessions.GetValueOrDefault(sessionId) is { } s && s.CampaignId == campaignId ? s : null);

    public Task<IReadOnlyList<InformationSession>> ListSessionsAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<InformationSession>>(
            Sessions.Values.Where(s => s.CampaignId == campaignId).OrderBy(s => s.Date).ThenBy(s => s.StartTime).ToList());

    public Task<IReadOnlyList<InformationSession>> ListForUserAsync(string userId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<InformationSession>>(
            Sessions.Values.Where(s => s.AssigneeId == userId || s.HostUserId == userId).OrderBy(s => s.Date).ThenBy(s => s.StartTime).ToList());

    public void AddSession(InformationSession session) => Sessions[session.Id] = session;

    public Task<InformationSession?> FindClashAsync(
        Guid? exceptSessionId, DateOnly date, TimeOnly start, TimeOnly end, HostRef host, CancellationToken ct)
    {
        var clash = Sessions.Values
            .Where(s => s.Status != SessionStatus.Cancelled && s.Id != exceptSessionId && s.Date == date && s.StartTime < end && start < s.EndTime)
            .Where(s => host.Type == HostType.Officer
                ? s.HostType == HostType.Officer && s.HostUserId == host.UserId
                : s.HostId == host.HostId)
            .OrderBy(s => s.StartTime)
            .FirstOrDefault();
        return Task.FromResult(clash);
    }

    public void AddAudit(SessionAuditEntry entry) => Audit.Add(entry);

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
    public List<(Guid CampaignId, SetupStepKey Step, StepStatus Status)> StatusCalls { get; } = [];

    /// <summary>Adds a campaign. Status is "Draft", "Active" or "Closed"; only a draft is editable in the Campaigns sense.</summary>
    public CampaignSetupContext AddCampaign(string status = "Draft", params (string Id, string Name)[] provinces)
    {
        var context = new CampaignSetupContext(
            Guid.NewGuid(),
            "Selection 2027",
            status,
            status == "Draft",
            new DateOnly(2026, 11, 2),
            (provinces.Length == 0 ? [("2", "Battambang"), ("17", "Siem Reap")] : provinces)
                .Select(p => new TargetProvince(p.Id, p.Name)).ToList(),
            Enum.GetValues<SetupStepKey>().ToDictionary(
                k => k,
                k => k == SetupStepKey.CampaignInfo ? StepStatus.Complete : StepStatus.NotStarted));
        Campaigns[context.CampaignId] = context;
        return context;
    }

    public StepStatus StepStatusOf(Guid campaignId) => Campaigns[campaignId].StepStatuses[SetupStepKey.InformationSessions];

    public Task<CampaignSetupContext?> GetContextAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(Campaigns.GetValueOrDefault(campaignId));

    public Task<Result> SetStepStatusAsync(Guid campaignId, SetupStepKey step, StepStatus status, CancellationToken ct)
    {
        StatusCalls.Add((campaignId, step, status));
        if (!Campaigns.TryGetValue(campaignId, out var context))
        {
            return Task.FromResult(Result.Failure(CampaignErrors.NotFound));
        }

        if (!context.IsEditable)
        {
            return Task.FromResult(Result.Failure(CampaignErrors.NotEditable));
        }

        var statuses = new Dictionary<SetupStepKey, StepStatus>(context.StepStatuses) { [step] = status };
        Campaigns[campaignId] = context with { StepStatuses = statuses };
        return Task.FromResult(Result.Success());
    }
}

public sealed class FakeCurrentUser : ICurrentUserService
{
    public AuthenticatedUser? User { get; set; } =
        new("manager-1", "dara", [Group.SelectionManager], "Dara Manager");

    public void SignInAs(string subject, string name, params Group[] groups) =>
        User = new AuthenticatedUser(subject, name.ToLowerInvariant(), groups, name);
}

public sealed class FakeClock : IClock
{
    /// <summary>2027-03-10 12:00 in Cambodia.</summary>
    public DateTimeOffset UtcNow { get; set; } = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
}

/// <summary>A staff list the tests control, standing in for Keycloak's admin API.</summary>
public sealed class FakeStaffDirectory : IStaffDirectory
{
    public int Calls { get; private set; }

    /// <summary>Who the pretend Keycloak lists. Set to null to make the directory unavailable.</summary>
    public IReadOnlyList<StaffMember>? Staff { get; set; } =
    [
        new("officer-1", "Sokha Officer", "selection-officer"),
        new("officer-2", "Vanna Officer", "selection-officer"),
        new("manager-1", "Dara Manager", "selection-manager"),
        new("admin-1", "Admin Demo", "system-admin"),
    ];

    public Task<Result<IReadOnlyList<StaffMember>>> ListAsync(CancellationToken ct)
    {
        Calls++;
        return Task.FromResult(Staff is null
            ? Result.Failure<IReadOnlyList<StaffMember>>(IdentityErrors.StaffDirectoryUnavailable)
            : Result.Success(Staff));
    }
}
