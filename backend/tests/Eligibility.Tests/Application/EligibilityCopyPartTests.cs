using Campaigns.Application;
using Campaigns.Domain;
using Eligibility.Application;
using Eligibility.Tests.Support;
using static Eligibility.Tests.Support.ServiceHarness;

namespace Eligibility.Tests.Application;

public sealed class EligibilityCopyPartTests
{
    private readonly ServiceHarness _h = new();
    private readonly EligibilityCopyPart _part;

    public EligibilityCopyPartTests()
    {
        _part = new EligibilityCopyPart(_h.Repository, _h.Service, _h.Gateway);
    }

    private Guid NewCampaign(params (string Id, string Name)[] provinces) => _h.Gateway.AddCampaign(provinces: provinces).CampaignId;

    private static CopyContext Context(Guid source, Guid target) => new(source, target, "user-1", "Sreyneang Chea");

    [Fact]
    public void ItIsTheEligibilityRulesPart()
    {
        Assert.Equal(CopyParts.EligibilityRules, _part.Key);
    }

    [Fact]
    public async Task Describe_CountsTheRules_AndSaysTheExamSubjectsComeAlong()
    {
        var source = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Request(null, Group(rules: [Rule("gender", "is", ["female"]), Rule("age", "at_least", ["17"])])), default);
        await _h.Subjects.GetAsync(source, default); // sets up Math, Logic and English

        var preview = await _part.DescribeAsync(source, default);

        Assert.True(preview.Available);
        Assert.Equal(2, preview.Count);
        Assert.Equal("Eligibility rules", preview.Label);
        Assert.Equal("Includes the 3 exam subjects the rules use.", preview.Note);
    }

    [Fact]
    public async Task Describe_SaysSoWhenThereAreNoRules()
    {
        var preview = await _part.DescribeAsync(NewCampaign(), default);

        Assert.False(preview.Available);
        Assert.Equal(0, preview.Count);
        Assert.NotNull(preview.Note);
    }

    [Fact]
    public async Task Copy_CopiesTheRules_ReportsTheCount_AndLeavesTheStepInProgress()
    {
        var source = NewCampaign();
        var target = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Request(null, Group(rules: [Rule("gender", "is", ["female"]), Rule("age", "at_least", ["17"])])), default);

        var result = await _part.CopyAsync(Context(source, target), default);

        Assert.Equal(new CopyPartResult(CopyParts.EligibilityRules, CopyOutcomes.Copied, 2, []), result);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(target));
        Assert.Equal(2, (await _h.Service.GetAsync(target, default)).Value.Groups.Sum(g => g.Rules.Count));
    }

    [Fact]
    public async Task Copy_FromACampaignWithNoRules_IsReportedAsFailed_NotThrown()
    {
        var result = await _part.CopyAsync(Context(NewCampaign(), NewCampaign()), default);

        Assert.Equal(CopyOutcomes.Failed, result.Outcome);
        Assert.Equal(0, result.Count);
        Assert.Equal([EligibilityErrors.NothingToCopy.Message], result.Issues);
    }

    [Fact]
    public async Task Copy_IntoACampaignThatIsNotADraft_IsReportedAsFailed()
    {
        var source = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Completable(), default);
        var target = _h.Gateway.AddCampaign(editable: false).CampaignId;

        var result = await _part.CopyAsync(Context(source, target), default);

        Assert.Equal(CopyOutcomes.Failed, result.Outcome);
        Assert.Equal([CampaignErrors.NotEditable.Message], result.Issues);
    }

    [Fact]
    public async Task Copy_RulesOnProvincesTheNewCampaignDoesNotTarget_AreCopiedAndFlagged()
    {
        var source = NewCampaign(("17", "Siem Reap"));
        var target = NewCampaign(("2", "Battambang"));
        await _h.Service.SaveDraftAsync(source, Request(null, Group(rules: [Rule("province", "is", ["17"]), Rule("gender", "is", ["female"])])), default);

        var result = await _part.CopyAsync(Context(source, target), default);

        Assert.Equal(CopyOutcomes.Partly, result.Outcome);
        Assert.Equal(2, result.Count);
        Assert.Contains("1 rule(s) name provinces", Assert.Single(result.Issues));
    }

    [Fact]
    public async Task Copy_RulesOnProvincesTheNewCampaignTargets_AreNotFlagged()
    {
        var source = NewCampaign(("17", "Siem Reap"));
        var target = NewCampaign(("17", "Siem Reap"));
        await _h.Service.SaveDraftAsync(source, Request(null, Group(rules: Rule("province", "is", ["17"]))), default);

        var result = await _part.CopyAsync(Context(source, target), default);

        Assert.Equal(CopyOutcomes.Copied, result.Outcome);
    }
}
