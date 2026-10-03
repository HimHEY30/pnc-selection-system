using System.Net;
using System.Net.Http.Json;
using Eligibility.Application;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>The test panel's endpoint, the suggested starter rules and the field catalogue.</summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class TestEndpointTests
{
    private readonly EligibilityApiFixture _fixture;
    private readonly HttpClient _client;

    public TestEndpointTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.CreateManagerClient();
    }

    private static async Task<TestResultDto> ReadAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<TestResultDto>())!;
    }

    // ---------- Test a sample candidate ----------

    [Fact]
    public async Task AnEligibleCandidate_PassesEveryRule()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rules = Request(ReferenceDate, null, Group(rules:
        [
            Rule("age", "between", ["17", "23"]),
            Rule("highest_grade", "is_one_of", ["grade_12", "diploma_or_higher"]),
            Rule("province", "is_one_of", ["2", "17"]),
        ]));
        var candidate = new Dictionary<string, string?>
        {
            ["date_of_birth"] = "2006-06-01", ["highest_grade"] = "grade_12", ["province"] = "17",
        };

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(rules, candidate)));

        Assert.True(result.Eligible);
        Assert.Equal(3, result.Rules.Count(r => r.Outcome == "Passed"));
        Assert.Equal(0, result.FailedMandatory);
    }

    [Fact]
    public async Task ACandidateWhoFails_GetsTheMessageOfEachFailedRule()
    {
        var campaign = await _client.CreateCampaignAsync();
        var tooOld = Rule("age", "between", ["17", "23"], message: "Applicants must be 17 to 23.");
        var grade = Rule("highest_grade", "is", ["grade_12"], message: "Needs Grade 12.");
        var rules = Request(ReferenceDate, null, Group(rules: [tooOld, grade]));
        var candidate = new Dictionary<string, string?> { ["date_of_birth"] = "1990-01-01", ["highest_grade"] = "grade_12" };

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(rules, candidate)));

        Assert.False(result.Eligible);
        var failed = result.Rules.Single(r => r.RuleId == tooOld.Id);
        Assert.Equal("Failed", failed.Outcome);
        Assert.Equal("Applicants must be 17 to 23.", failed.Message);
        Assert.Equal("Passed", result.Rules.Single(r => r.RuleId == grade.Id).Outcome);
        Assert.Null(result.Rules.Single(r => r.RuleId == grade.Id).Message);
    }

    [Fact]
    public async Task AnOptionalFailure_IsAWarning_NotABlock()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rules = Request(ReferenceDate, null, Group(rules:
        [
            Rule("gender", "is", ["female"]),
            Rule("attended_info_session", "is_yes", type: "Optional", message: "Please attend a session."),
        ]));
        var candidate = new Dictionary<string, string?> { ["gender"] = "female", ["attended_info_session"] = "false" };

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(rules, candidate)));

        Assert.True(result.Eligible);
        Assert.Equal(1, result.Warnings);
        Assert.Contains(result.Rules, r => r.Outcome == "Failed" && r.Type == "Optional" && r.Message == "Please attend a session.");
    }

    [Fact]
    public async Task MissingInformation_IsFlaggedAsNotProvided()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rules = Request(ReferenceDate, null, Group(rules: Rule("gender", "is", ["female"])));

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(rules, new())));

        Assert.False(result.Eligible);
        Assert.True(result.Rules.Single().DataMissing);
    }

    [Fact]
    public async Task AnyAndAllGroups_AreEvaluatedAsTheyAreOnScreen()
    {
        var campaign = await _client.CreateCampaignAsync();
        var anyGroup = Group("Any", "Province", null, Rule("province", "is", ["2"]), Rule("province", "is", ["17"]));
        var allGroup = Group("All", "Basics", null, Rule("gender", "is", ["female"]));
        var candidate = new Dictionary<string, string?> { ["province"] = "17", ["gender"] = "female" };

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(Request(ReferenceDate, null, anyGroup, allGroup), candidate)));

        Assert.True(result.Eligible);
        Assert.Equal([true, true], result.Groups.Select(g => g.Passed));
        Assert.Equal(["Any", "All"], result.Groups.Select(g => g.Logic));
    }

    [Fact]
    public async Task TheTest_UsesTheRulesSentNotTheSavedOnes_AndSavesNothing()
    {
        var campaign = await _client.CreateCampaignAsync();
        await _client.SaveDraftAsync(campaign.Id, Completable(null, Rule("gender", "is", ["male"])));
        var before = await _client.LoadRulesAsync(campaign.Id);

        var result = await ReadAsync(await _client.TestAsync(campaign.Id,
            new TestRequest(Completable(null, Rule("gender", "is", ["female"])), new() { ["gender"] = "female" })));

        Assert.True(result.Eligible);
        var after = await _client.LoadRulesAsync(campaign.Id);
        Assert.Equal(["male"], after.Groups[0].Rules[0].Values);
        Assert.Equal(before.Version, after.Version);
    }

    [Fact]
    public async Task AMalformedRule_IsReportedUnderItsInput()
    {
        var campaign = await _client.CreateCampaignAsync();
        var bad = Rule("age", "at_least", ["abc"]);

        var response = await _client.TestAsync(campaign.Id, new TestRequest(Request(ReferenceDate, null, Group(rules: bad)), new()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["Enter a number."], (await response.ReadProblemAsync()).Errors![$"rules.{bad.Id}.values"]);
    }

    [Fact]
    public async Task ContradictoryRules_CanStillBeTested()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rules = Request(ReferenceDate, null, Group(rules: [Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"])]));

        var result = await ReadAsync(await _client.TestAsync(campaign.Id,
            new TestRequest(rules, new() { ["date_of_birth"] = "2006-06-01" })));

        Assert.False(result.Eligible);
    }

    [Fact]
    public async Task ARequestWithNoRulesAtAll_IsEligibleByDefault()
    {
        var campaign = await _client.CreateCampaignAsync();

        var result = await ReadAsync(await _client.TestAsync(campaign.Id, new TestRequest(null, null)));

        Assert.True(result.Eligible);
        Assert.Empty(result.Rules);
    }

    // ---------- Suggested rules ----------

    [Fact]
    public async Task TheSuggestedRules_UseTheCampaignsProvincesAndStartDate()
    {
        var campaign = await _client.CreateCampaignAsync(17, 2, 21);

        var suggested = (await _client.GetFromJsonAsync<SuggestedDto>($"/api/campaigns/{campaign.Id}/eligibility/suggested"))!;

        Assert.Equal(new DateOnly(2026, 11, 2), suggested.AgeReferenceDate);
        var group = Assert.Single(suggested.Groups);
        Assert.Equal(["age", "highest_grade", "province", "attended_info_session"], group.Rules.Select(r => r.FieldKey));
        Assert.Equal(["17", "2", "21"], group.Rules.Single(r => r.FieldKey == "province").Values.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task AskingForSuggestions_SavesNothing()
    {
        var campaign = await _client.CreateCampaignAsync();

        await _client.GetAsync($"/api/campaigns/{campaign.Id}/eligibility/suggested");

        Assert.Empty((await _client.LoadRulesAsync(campaign.Id)).Groups);
        Assert.Equal("NotStarted", (await _client.GetCampaignAsync(campaign.Id)).StepStatus());
    }

    [Fact]
    public async Task TheSuggestedRules_CanBeSavedAndCompletedAsTheyAre()
    {
        var campaign = await _client.CreateCampaignAsync();
        var suggested = (await _client.GetFromJsonAsync<SuggestedDto>($"/api/campaigns/{campaign.Id}/eligibility/suggested"))!;
        var request = new RuleSetRequest(
            suggested.AgeReferenceDate,
            suggested.Groups.Select(g => new GroupInput(g.Id, g.Name, g.Logic,
                g.Rules.Select(r => new RuleInput(r.Id, r.FieldKey, r.OperatorKey, r.Values, r.Type, r.Message, r.IsActive)).ToList())).ToList(),
            null);

        var saved = await (await _client.CompleteAsync(campaign.Id, request)).ReadRuleSetAsync();

        Assert.Equal("Complete", saved.StepStatus);
        Assert.Equal(4, saved.Groups[0].Rules.Count);
    }

    // ---------- Catalogue ----------

    [Fact]
    public async Task TheSharedCatalogue_ListsTheEightFields_WithTheirOperatorsAndOptions()
    {
        var catalogue = (await _client.GetFromJsonAsync<CatalogueDto>("/api/eligibility/catalogue"))!;

        Assert.Equal(
            ["age", "gender", "province", "highest_grade", "grade12_result", "family_income", "marital_status", "attended_info_session"],
            catalogue.Fields.Select(f => f.Key));

        var age = catalogue.Fields.Single(f => f.Key == "age");
        Assert.Equal("Number", age.ValueType);
        Assert.Equal(0, age.Decimals);
        Assert.Equal(["equals", "less_than", "at_most", "greater_than", "at_least", "between"], age.Operators.Select(o => o.Key));

        var grade = catalogue.Fields.Single(f => f.Key == "highest_grade");
        Assert.Equal(["grade_9", "grade_10", "grade_11", "grade_12", "diploma_or_higher"], grade.Options.Select(o => o.Key));
        Assert.Equal(["is", "is_not", "is_one_of", "is_none_of"], grade.Operators.Select(o => o.Key));

        Assert.Equal("AgeFromBirthDate", age.Derivation);
        Assert.Equal("date_of_birth", age.CandidateAttribute);
        var gender = catalogue.Fields.Single(f => f.Key == "gender");
        Assert.Equal("None", gender.Derivation);
        Assert.Equal("gender", gender.CandidateAttribute);

        Assert.Equal("CampaignProvinces", catalogue.Fields.Single(f => f.Key == "province").OptionsSource);
        Assert.Equal("USD", catalogue.Fields.Single(f => f.Key == "family_income").Unit);
        Assert.Equal(["is_yes", "is_no"], catalogue.Fields.Single(f => f.Key == "attended_info_session").Operators.Select(o => o.Key));
    }
}
