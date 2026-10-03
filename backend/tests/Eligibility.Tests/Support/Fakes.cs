using Campaigns.Application;
using Campaigns.Domain;
using Eligibility.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Identity.Application;
using Identity.Domain;
using SharedKernel;

namespace Eligibility.Tests.Support;

/// <summary>In-memory stand-ins, so the service's rules can be tested without a database.</summary>
public sealed class FakeRepository : IEligibilityRepository
{
    public Dictionary<Guid, RuleSet> RuleSets { get; } = [];
    public List<EligibilityAuditEntry> Audit { get; } = [];
    public int SaveCount { get; private set; }

    /// <summary>Set to make the next save fail like a concurrent edit.</summary>
    public bool FailNextSave { get; set; }

    public Dictionary<Guid, List<FieldDefinition>> Subjects { get; } = [];
    public HashSet<Guid> Setups { get; } = [];

    public Task<FieldCatalogue> GetCatalogueAsync(CancellationToken ct) => Task.FromResult(LaunchCatalogue.Create());

    public Task<FieldCatalogue> GetCatalogueAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(LaunchCatalogue.Create([.. SubjectsOf(campaignId)]));

    public Task<List<FieldDefinition>> GetSubjectsAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(SubjectsOf(campaignId).OrderBy(s => s.Position).ToList());

    public Task<bool> HasExamSetupAsync(Guid campaignId, CancellationToken ct) => Task.FromResult(Setups.Contains(campaignId));

    public Task<IReadOnlyDictionary<string, int>> CountRulesByFieldAsync(
        Guid campaignId, IReadOnlyCollection<string> fieldKeys, CancellationToken ct)
    {
        var rules = RuleSets.GetValueOrDefault(campaignId)?.Groups.SelectMany(g => g.Rules) ?? [];
        IReadOnlyDictionary<string, int> counts = rules
            .Where(r => fieldKeys.Contains(r.FieldKey))
            .GroupBy(r => r.FieldKey)
            .ToDictionary(g => g.Key, g => g.Count());
        return Task.FromResult(counts);
    }

    public void AddExamSetup(ExamSetup setup) => Setups.Add(setup.CampaignId);

    public void AddSubject(FieldDefinition subject) => SubjectsOf(subject.CampaignId!.Value).Add(subject);

    public void RemoveSubject(FieldDefinition subject) => SubjectsOf(subject.CampaignId!.Value).Remove(subject);

    public List<FieldDefinition> SubjectsOf(Guid campaignId)
    {
        if (!Subjects.TryGetValue(campaignId, out var list))
        {
            Subjects[campaignId] = list = [];
        }

        return list;
    }

    public Task<RuleSet?> GetRuleSetAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(RuleSets.GetValueOrDefault(campaignId));

    public void Add(RuleSet ruleSet) => RuleSets[ruleSet.CampaignId] = ruleSet;

    public void AddAudit(IEnumerable<EligibilityAuditEntry> entries) => Audit.AddRange(entries);

    public Task<Result> SaveChangesAsync(CancellationToken ct)
    {
        SaveCount++;
        if (FailNextSave)
        {
            FailNextSave = false;
            return Task.FromResult(Result.Failure(EligibilityErrors.ConcurrentEdit));
        }

        return Task.FromResult(Result.Success());
    }
}

public sealed class FakeGateway : ICampaignSetupGateway
{
    public Dictionary<Guid, CampaignSetupContext> Campaigns { get; } = [];
    public List<(Guid CampaignId, SetupStepKey Step, StepStatus Status)> StatusCalls { get; } = [];

    public CampaignSetupContext AddCampaign(
        bool editable = true,
        DateOnly? startDate = null,
        params (string Id, string Name)[] provinces)
    {
        var context = new CampaignSetupContext(
            Guid.NewGuid(),
            "Selection 2027",
            editable ? "Draft" : "Active",
            editable,
            startDate ?? new DateOnly(2026, 11, 2),
            (provinces.Length == 0 ? [("2", "Battambang"), ("17", "Siem Reap")] : provinces)
                .Select(p => new TargetProvince(p.Id, p.Name)).ToList(),
            Enum.GetValues<SetupStepKey>().ToDictionary(
                k => k,
                k => k == SetupStepKey.CampaignInfo ? StepStatus.Complete : StepStatus.NotStarted));
        Campaigns[context.CampaignId] = context;
        return context;
    }

    public StepStatus StepStatusOf(Guid campaignId) => Campaigns[campaignId].StepStatuses[SetupStepKey.EligibilityRules];

    public Task<CampaignSetupContext?> GetContextAsync(Guid campaignId, CancellationToken ct) =>
        Task.FromResult(Campaigns.GetValueOrDefault(campaignId));

    public Task<Result> SetStepStatusAsync(Guid campaignId, SetupStepKey step, StepStatus status, CancellationToken ct)
    {
        StatusCalls.Add((campaignId, step, status));
        if (!Campaigns.TryGetValue(campaignId, out var context))
        {
            return Task.FromResult(Result.Failure(CampaignErrors.NotFound));
        }

        var statuses = new Dictionary<SetupStepKey, StepStatus>(context.StepStatuses) { [step] = status };
        Campaigns[campaignId] = context with { StepStatuses = statuses };
        return Task.FromResult(Result.Success());
    }
}

public sealed class FakeCurrentUser : ICurrentUserService
{
    public AuthenticatedUser? User { get; set; } =
        new("user-1", "sreyneang", [Group.SelectionManager], "Sreyneang Chea");
}

public sealed class FakeClock : IClock
{
    public DateTimeOffset UtcNow { get; set; } = new(2026, 10, 3, 9, 12, 0, TimeSpan.Zero);
}

/// <summary>Wires the service to the fakes and offers short helpers for building requests.</summary>
public sealed class ServiceHarness
{
    public FakeRepository Repository { get; } = new();
    public FakeGateway Gateway { get; } = new();
    public FakeCurrentUser User { get; } = new();
    public FakeClock Clock { get; } = new();
    public EligibilityService Service { get; }

    public ServiceHarness()
    {
        Service = new EligibilityService(Repository, Gateway, User, Clock);
    }

    public static RuleInput Rule(
        string field,
        string op,
        string[]? values = null,
        string type = "Mandatory",
        string? message = "Message.",
        bool active = true,
        Guid? id = null) => new(id ?? Guid.NewGuid(), field, op, values ?? [], type, message, active);

    public static GroupInput Group(string logic = "All", string name = "Group", params RuleInput[] rules) =>
        new(Guid.NewGuid(), name, logic, [.. rules]);

    public static RuleSetRequest Request(DateOnly? referenceDate = null, params GroupInput[] groups) =>
        new(referenceDate, [.. groups], null);

    /// <summary>The smallest request that can be completed: one mandatory rule.</summary>
    public static RuleSetRequest Completable(RuleInput? rule = null) =>
        Request(new DateOnly(2026, 11, 2), Group(rules: rule ?? Rule("gender", "is", ["female"])));
}
