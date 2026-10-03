using System.Net;
using System.Net.Http.Json;
using Campaigns.Application;
using Eligibility.Application;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>Creating a campaign from a copy, with the eligibility rules ticked, through the real API and database.</summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class CopyOnCreateTests
{
    private readonly HttpClient _manager;

    public CopyOnCreateTests(EligibilityApiFixture fixture)
    {
        _manager = fixture.CreateManagerClient("Sreyneang Chea");
    }

    /// <summary>A campaign with rules, one of them on a province, and the three default exam subjects with a rule on Math.</summary>
    private async Task<Guid> SourceWithRulesAsync()
    {
        var source = await _manager.CreateCampaignAsync(2, 17);
        var subjects = await _manager.LoadSubjectsAsync(source.Id);
        var math = subjects.Subjects.Single(s => s.Name == "Math").Key;
        var request = Request(ReferenceDate, null,
            Group("All", "Basics", null, Rule("age", "between", ["17", "23"]), Rule(math, "at_least", ["50"])),
            Group("Any", "Where from", null, Rule("province", "is", ["2"])));
        (await _manager.SaveDraftAsync(source.Id, request)).EnsureSuccessStatusCode();
        return source.Id;
    }

    private async Task<HttpResponseMessage> CopyAsync(Guid source, params string[] parts) =>
        await _manager.PostAsJsonAsync("/api/campaigns", new CreateCampaignRequest(
            $"Selection {Guid.NewGuid():N}", "2027–2028", null, StartModes.Copy, new CopyFromRequest(source, parts)));

    [Fact]
    public async Task Preview_CountsTheRulesAndSaysTheSubjectsComeAlong()
    {
        var source = await SourceWithRulesAsync();

        var preview = await _manager.GetFromJsonAsync<CopyPreviewDto>($"/api/campaigns/{source}/copy-preview");

        var rules = preview!.Parts.Single(p => p.Key == CopyParts.EligibilityRules);
        Assert.True(rules.Available);
        Assert.Equal(3, rules.Count);
        Assert.Equal("Includes the 3 exam subjects the rules use.", rules.Note);
    }

    [Fact]
    public async Task Create_ByCopyingRulesAndProvinces_BringsBothAndLeavesTheStepInProgress()
    {
        var source = await SourceWithRulesAsync();

        var response = await CopyAsync(source, CopyParts.Provinces, CopyParts.EligibilityRules);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied", $"{CopyParts.EligibilityRules}:Copied"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}"));
        Assert.Equal("InProgress", copy.StepStatus());
        Assert.Equal("InProgress", (await _manager.GetCampaignAsync(copy.Id)).StepStatus());

        var rules = await _manager.LoadRulesAsync(copy.Id);
        Assert.Equal(3, rules.Groups.Sum(g => g.Rules.Count));
        Assert.Equal(["Basics", "Where from"], rules.Groups.Select(g => g.Name));

        // The Math rule points at the copy's own Math subject, not the source's.
        var subjects = await _manager.LoadSubjectsAsync(copy.Id);
        var copyMath = subjects.Subjects.Single(s => s.Name == "Math");
        Assert.Equal(1, copyMath.RuleCount);
        Assert.Equal(3, subjects.Subjects.Count);
    }

    [Fact]
    public async Task Create_ByCopyingRulesWithoutProvinces_CopiesThemAndFlagsTheProvinceRule()
    {
        var source = await SourceWithRulesAsync();

        var copy = (await (await CopyAsync(source, CopyParts.EligibilityRules)).Content.ReadFromJsonAsync<CampaignDetailDto>())!;

        var result = Assert.Single(copy.CopyResults!);
        Assert.Equal(CopyOutcomes.Partly, result.Outcome);
        Assert.Equal(3, result.Count);
        Assert.Contains("1 rule(s) name provinces", Assert.Single(result.Issues));
        Assert.Empty(copy.ProvinceIds);
        Assert.Equal(3, (await _manager.LoadRulesAsync(copy.Id)).Groups.Sum(g => g.Rules.Count));
    }

    [Fact]
    public async Task Create_ByCopyingRulesFromACampaignWithNone_StillCreatesTheCampaign_AndReportsTheFailure()
    {
        var source = await _manager.CreateCampaignAsync();

        var response = await CopyAsync(source.Id, CopyParts.Provinces, CopyParts.EligibilityRules);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied", $"{CopyParts.EligibilityRules}:Failed"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}"));
        Assert.Equal(2, copy.ProvinceIds.Count);
        Assert.Equal("NotStarted", copy.StepStatus());
        Assert.Equal(HttpStatusCode.OK, (await _manager.GetAsync($"/api/campaigns/{copy.Id}")).StatusCode);
    }

    [Fact]
    public async Task Create_ByCopyingWithoutTickingRules_LeavesTheRulesAlone()
    {
        var source = await SourceWithRulesAsync();

        var copy = (await (await CopyAsync(source, CopyParts.Provinces)).Content.ReadFromJsonAsync<CampaignDetailDto>())!;

        Assert.Empty((await _manager.LoadRulesAsync(copy.Id)).Groups);
        Assert.Equal("NotStarted", copy.StepStatus());
    }

    [Fact]
    public async Task Create_ByCopying_LeavesTheSourceRulesUntouched()
    {
        var source = await SourceWithRulesAsync();
        var before = await _manager.LoadRulesAsync(source);

        await CopyAsync(source, CopyParts.Provinces, CopyParts.EligibilityRules);

        var after = await _manager.LoadRulesAsync(source);
        Assert.Equal(before.Version, after.Version);
        Assert.Equal(before.Groups.SelectMany(g => g.Rules).Select(r => r.Id), after.Groups.SelectMany(g => g.Rules).Select(r => r.Id));
    }
}
