using System.Net;
using System.Net.Http.Json;
using Eligibility.Application;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>Saving, completing and reading rules through the real API and database.</summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class RuleSetFlowTests
{
    private readonly EligibilityApiFixture _fixture;
    private readonly HttpClient _client;

    public RuleSetFlowTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.CreateManagerClient("Sreyneang Chea");
    }

    // ---------- Reading ----------

    [Fact]
    public async Task ANewCampaign_HasNoRulesYet_AndShowsItsTargetProvinces()
    {
        var campaign = await _client.CreateCampaignAsync();

        var rules = await _client.LoadRulesAsync(campaign.Id);

        Assert.Empty(rules.Groups);
        Assert.False(rules.IsLocked);
        Assert.Equal("Draft", rules.CampaignStatus);
        Assert.Equal("NotStarted", rules.StepStatus);
        Assert.Equal(0u, rules.Version);
        Assert.Null(rules.UpdatedAt);
        Assert.Equal(new DateOnly(2026, 11, 2), rules.CampaignStartDate);
        Assert.Equal([("2", "Battambang"), ("17", "Siem Reap")], rules.TargetProvinces.Select(p => (p.Id, p.Name)));
    }

    [Fact]
    public async Task AnUnknownCampaign_Is404_ForEveryEndpoint()
    {
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetRulesAsync(id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.SaveDraftAsync(id, Completable())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.CompleteAsync(id, Completable())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.TestAsync(id, new TestRequest(Completable(), null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/campaigns/{id}/eligibility/suggested")).StatusCode);
    }

    // ---------- Save draft ----------

    [Fact]
    public async Task SaveDraft_StoresTheRules_AndStep2BecomesInProgress()
    {
        var campaign = await _client.CreateCampaignAsync();
        var request = Request(ReferenceDate, null,
            Group("All", "Basics", null,
                Rule("age", "between", ["17", "23"], message: "Must be 17 to 23."),
                Rule("highest_grade", "is_one_of", ["grade_12", "diploma_or_higher"])));

        var saved = await (await _client.SaveDraftAsync(campaign.Id, request)).ReadRuleSetAsync();

        Assert.Equal("InProgress", saved.StepStatus);
        Assert.Equal("Sreyneang Chea", saved.UpdatedByName);
        Assert.NotNull(saved.UpdatedAt);
        Assert.NotEqual(0u, saved.Version);
        var reloaded = await _client.LoadRulesAsync(campaign.Id);
        Assert.Equal("Basics", reloaded.Groups.Single().Name);
        Assert.Equal(["age", "highest_grade"], reloaded.Groups[0].Rules.Select(r => r.FieldKey));
        Assert.Equal(["17", "23"], reloaded.Groups[0].Rules[0].Values);
        Assert.Equal("Must be 17 to 23.", reloaded.Groups[0].Rules[0].Message);
        Assert.Equal(ReferenceDate, reloaded.AgeReferenceDate);
        Assert.Equal("InProgress", (await _client.GetCampaignAsync(campaign.Id)).StepStatus());
    }

    [Fact]
    public async Task SavingStep2_DoesNotTouchStep1()
    {
        var campaign = await _client.CreateCampaignAsync();
        Assert.Equal("Complete", campaign.StepStatus("CampaignInfo"));

        await _client.SaveDraftAsync(campaign.Id, Completable());

        var after = await _client.GetCampaignAsync(campaign.Id);
        Assert.Equal("Complete", after.StepStatus("CampaignInfo"));
        Assert.Equal("NotStarted", after.StepStatus("Candidates"));
    }

    [Fact]
    public async Task Values_AreStoredInCanonicalForm()
    {
        var campaign = await _client.CreateCampaignAsync();
        var request = Request(ReferenceDate, null, Group(rules:
        [
            Rule("age", "between", ["17.0", "23"]),
            Rule("highest_grade", "is_one_of", ["grade_12", "grade_10", "grade_12"]),
        ]));

        await _client.SaveDraftAsync(campaign.Id, request);

        var rules = (await _client.LoadRulesAsync(campaign.Id)).Groups[0].Rules;
        Assert.Equal(["17", "23"], rules[0].Values);
        Assert.Equal(["grade_10", "grade_12"], rules[1].Values);
    }

    [Fact]
    public async Task AnEmptyDraft_IsFine()
    {
        var campaign = await _client.CreateCampaignAsync();

        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request())).ReadRuleSetAsync();

        Assert.Empty(saved.Groups);
        Assert.Equal("InProgress", saved.StepStatus);
    }

    // ---------- Order, moving and deleting ----------

    [Fact]
    public async Task TheOrderOfGroupsAndRules_IsKept()
    {
        var campaign = await _client.CreateCampaignAsync();
        var a = Rule("age", "at_least", ["17"]);
        var b = Rule("gender", "is", ["female"]);
        var c = Rule("family_income", "at_most", ["300"]);
        var first = Group("All", "First", null, a, b);
        var second = Group("Any", "Second", null, c);
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, first, second))).ReadRuleSetAsync();

        // Reverse everything.
        var reordered = Request(ReferenceDate, saved.Version, second, first with { Rules = [b, a] });
        await _client.SaveDraftAsync(campaign.Id, reordered);

        var rules = await _client.LoadRulesAsync(campaign.Id);
        Assert.Equal(["Second", "First"], rules.Groups.Select(g => g.Name));
        Assert.Equal([b.Id, a.Id], rules.Groups[1].Rules.Select(r => r.Id));
    }

    [Fact]
    public async Task ARuleCanBeMovedToAnotherGroup()
    {
        var campaign = await _client.CreateCampaignAsync();
        var moving = Rule("age", "at_least", ["17"]);
        var source = Group("All", "Source", null, moving, Rule("gender", "is", ["female"]));
        var target = Group("Any", "Target", null, Rule("family_income", "at_most", ["300"]));
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, source, target))).ReadRuleSetAsync();

        var moved = Request(ReferenceDate, saved.Version,
            source with { Rules = [source.Rules![1]] },
            target with { Rules = [.. target.Rules!, moving] });
        var result = await _client.SaveDraftAsync(campaign.Id, moved);

        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        var rules = await _client.LoadRulesAsync(campaign.Id);
        Assert.DoesNotContain(rules.Groups[0].Rules, r => r.Id == moving.Id);
        Assert.Contains(rules.Groups[1].Rules, r => r.Id == moving.Id);
    }

    [Fact]
    public async Task DeletingARule_AndAGroup_RemovesThemForGood()
    {
        var campaign = await _client.CreateCampaignAsync();
        var keep = Rule("age", "at_least", ["17"]);
        var dropRule = Rule("gender", "is", ["female"]);
        var keepGroup = Group("All", "Keep", null, keep, dropRule);
        var dropGroup = Group("Any", "Drop", null, Rule("family_income", "at_most", ["300"]));
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, keepGroup, dropGroup))).ReadRuleSetAsync();

        await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, saved.Version, keepGroup with { Rules = [keep] }));

        var rules = await _client.LoadRulesAsync(campaign.Id);
        Assert.Equal([keep.Id], rules.Groups.Single().Rules.Select(r => r.Id));
        Assert.Equal(0, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.rule_groups where id = @id", ("id", dropGroup.Id)));
        Assert.Equal(0, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.rules where id = @id", ("id", dropRule.Id)));
    }

    [Fact]
    public async Task DeletingARuleAndAddingTheSameCheckAgain_InOneSave_Works()
    {
        // The database refuses the same check twice in a group, so the delete must happen before the insert.
        var campaign = await _client.CreateCampaignAsync();
        var original = Rule("gender", "is", ["female"]);
        var group = Group("All", "G", null, original);
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, group))).ReadRuleSetAsync();

        var replacement = Rule("gender", "is", ["female"]); // new id, same check
        var result = await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, saved.Version, group with { Rules = [replacement] }));

        Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        Assert.Equal([replacement.Id], (await _client.LoadRulesAsync(campaign.Id)).Groups[0].Rules.Select(r => r.Id));
    }

    // ---------- Save and continue ----------

    [Fact]
    public async Task Complete_MarksStep2Complete()
    {
        var campaign = await _client.CreateCampaignAsync();

        var saved = await (await _client.CompleteAsync(campaign.Id, Completable())).ReadRuleSetAsync();

        Assert.Equal("Complete", saved.StepStatus);
        var after = await _client.GetCampaignAsync(campaign.Id);
        Assert.Equal("Complete", after.StepStatus());
        Assert.Equal(2, after.Progress.Complete);
    }

    [Fact]
    public async Task SavingADraftAfterCompleting_MovesStep2BackToInProgress()
    {
        var campaign = await _client.CreateCampaignAsync();
        var done = await (await _client.CompleteAsync(campaign.Id, Completable())).ReadRuleSetAsync();

        await _client.SaveDraftAsync(campaign.Id, Completable(done.Version, Rule("gender", "is", ["male"])));

        Assert.Equal("InProgress", (await _client.GetCampaignAsync(campaign.Id)).StepStatus());
    }

    [Fact]
    public async Task Complete_NeedsAnActiveMandatoryRule_AndChangesNothingOtherwise()
    {
        var campaign = await _client.CreateCampaignAsync();
        var onlyOptional = Request(ReferenceDate, null, Group(rules: Rule("gender", "is", ["female"], type: "Optional")));

        var response = await _client.CompleteAsync(campaign.Id, onlyOptional);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal("eligibility.invalid", problem.Code);
        Assert.Equal(["Add at least one active mandatory rule."], problem.Errors!["rules"]);
        Assert.Empty((await _client.LoadRulesAsync(campaign.Id)).Groups);
        Assert.Equal("NotStarted", (await _client.GetCampaignAsync(campaign.Id)).StepStatus());
    }

    [Fact]
    public async Task Complete_NeedsTheReferenceDate_WhenAnAgeRuleIsActive()
    {
        var campaign = await _client.CreateCampaignAsync();
        var request = Request(null, null, Group(rules: Rule("age", "at_least", ["17"])));

        var problem = await (await _client.CompleteAsync(campaign.Id, request)).ReadProblemAsync();

        Assert.Equal(["Choose the date ages are calculated on."], problem.Errors!["ageReferenceDate"]);
        Assert.True((await _client.SaveDraftAsync(campaign.Id, request)).IsSuccessStatusCode);
    }

    [Fact]
    public async Task AProvinceThatIsNotATarget_IsAllowedInADraft_ButBlocksCompleting()
    {
        var campaign = await _client.CreateCampaignAsync(2, 17);
        var rule = Rule("province", "is_one_of", ["2", "21"]); // Takeo (21) is not a target
        var request = Request(ReferenceDate, null, Group(rules: rule));

        var draft = await _client.SaveDraftAsync(campaign.Id, request);
        var saved = await draft.ReadRuleSetAsync();
        var complete = await _client.CompleteAsync(campaign.Id, request with { Version = saved.Version });

        Assert.Equal(HttpStatusCode.BadRequest, complete.StatusCode);
        var problem = await complete.ReadProblemAsync();
        Assert.Contains("Change them in Step 1", problem.Errors![$"rules.{rule.Id}.values"][0]);
        Assert.Equal("InProgress", (await _client.GetCampaignAsync(campaign.Id)).StepStatus());
    }

    // ---------- Validation ----------

    [Fact]
    public async Task ContradictingRules_AreRefused_EvenForADraft_AndNothingIsSaved()
    {
        var campaign = await _client.CreateCampaignAsync();
        var atLeast = Rule("age", "at_least", ["20"]);
        var atMost = Rule("age", "at_most", ["18"]);

        var response = await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, Group(rules: [atLeast, atMost])));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadProblemAsync()).Errors!;
        const string expected = "These rules can never all be true together: Age at least 20; Age at most 18.";
        Assert.Equal([expected], errors[$"rules.{atLeast.Id}"]);
        Assert.Equal([expected], errors[$"rules.{atMost.Id}"]);
        Assert.Empty((await _client.LoadRulesAsync(campaign.Id)).Groups);
    }

    [Fact]
    public async Task ADuplicateRule_IsRefused()
    {
        var campaign = await _client.CreateCampaignAsync();
        var second = Rule("gender", "is", ["female"]);

        var response = await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, Group(rules: [Rule("gender", "is", ["female"]), second])));

        var errors = (await response.ReadProblemAsync()).Errors!;
        Assert.Equal(["The same rule already exists in this group."], errors[$"rules.{second.Id}"]);
    }

    [Fact]
    public async Task ProblemsWithValuesAndMessages_AreReportedUnderTheRightInput()
    {
        var campaign = await _client.CreateCampaignAsync();
        var badValue = Rule("age", "between", ["23", "17"]);
        var noMessage = Rule("gender", "is", ["female"], message: " ");
        var badOperator = Rule("gender", "between", ["1", "2"]);

        var response = await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, Group(rules: [badValue, noMessage, badOperator])));

        var errors = (await response.ReadProblemAsync()).Errors!;
        Assert.Equal(["The first value must be lower than the second."], errors[$"rules.{badValue.Id}.values"]);
        Assert.Equal(["Write the reason shown when a candidate fails this rule."], errors[$"rules.{noMessage.Id}.message"]);
        Assert.Equal(["This comparison does not fit the chosen field."], errors[$"rules.{badOperator.Id}.operator"]);
    }

    // ---------- Versions and concurrent edits ----------

    [Fact]
    public async Task EachChange_GivesANewVersion_ButSavingWithoutChangesDoesNot()
    {
        var campaign = await _client.CreateCampaignAsync();
        var first = await (await _client.SaveDraftAsync(campaign.Id, Completable())).ReadRuleSetAsync();

        var unchanged = await (await _client.SaveDraftAsync(campaign.Id, first.ToRequest())).ReadRuleSetAsync();
        var edited = first.ToRequest() with { AgeReferenceDate = new DateOnly(2027, 1, 1), Version = unchanged.Version };
        var changed = await (await _client.SaveDraftAsync(campaign.Id, edited)).ReadRuleSetAsync();

        Assert.Equal(first.Version, unchanged.Version);
        // The save response holds the in-memory time and the reload what PostgreSQL stored (microseconds).
        Assert.Equal(first.UpdatedAt!.Value.ToUnixTimeMilliseconds(), unchanged.UpdatedAt!.Value.ToUnixTimeMilliseconds());
        Assert.NotEqual(first.Version, changed.Version);
        Assert.Equal(new DateOnly(2027, 1, 1), changed.AgeReferenceDate);
    }

    [Fact]
    public async Task ASaveBasedOnAnOldVersion_IsRefusedWithAConflict()
    {
        var campaign = await _client.CreateCampaignAsync();
        var first = await (await _client.SaveDraftAsync(campaign.Id, Completable())).ReadRuleSetAsync();
        await _client.SaveDraftAsync(campaign.Id, Completable(first.Version, Rule("gender", "is", ["male"])));

        var stale = await _client.SaveDraftAsync(campaign.Id, Completable(first.Version, Rule("gender", "is", ["female"])));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("eligibility.concurrent_edit", (await stale.ReadProblemAsync()).Code);
    }

    [Fact]
    public async Task TwoPeopleSavingTheSameVersionAtOnce_OnlyOneWins()
    {
        var campaign = await _client.CreateCampaignAsync();
        var first = await (await _client.SaveDraftAsync(campaign.Id, Completable())).ReadRuleSetAsync();
        var clients = Enumerable.Range(0, 4).Select(_ => _fixture.CreateManagerClient()).ToArray();

        var responses = await Task.WhenAll(clients.Select((c, i) =>
            c.SaveDraftAsync(campaign.Id, Completable(first.Version, Rule("gender", "is", [i % 2 == 0 ? "male" : "female"], message: $"Writer {i}")))));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    [Fact]
    public async Task TwoPeopleSavingTheFirstRulesAtOnce_OnlyOneWins_AndTheOtherIsToldToReload()
    {
        var campaign = await _client.CreateCampaignAsync();
        var clients = Enumerable.Range(0, 4).Select(_ => _fixture.CreateManagerClient()).ToArray();

        var responses = await Task.WhenAll(clients.Select(c => c.SaveDraftAsync(campaign.Id, Completable(0u))));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    // ---------- Audit ----------

    [Fact]
    public async Task EveryChange_IsRecordedInTheAuditLog_WithWhoAndWhat()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rule = Rule("age", "at_least", ["17"]);
        var other = Rule("gender", "is", ["female"]);
        var group = Group("All", "G", null, rule, other);
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, group))).ReadRuleSetAsync();

        // Edit one rule, switch another off.
        await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, saved.Version,
            group with { Rules = [rule with { Values = ["18"] }, other with { IsActive = false }] }));

        var lines = await AuditLinesAsync(campaign.Id);
        Assert.Equal(1, lines.Count(l => l.Entity == 1 && l.Action == 0));        // group added
        Assert.Equal(2, lines.Count(l => l.Entity == 2 && l.Action == 0));        // two rules added
        Assert.Equal(1, lines.Count(l => l.Entity == 0 && l.Action == 1));        // reference date set
        Assert.Contains(lines, l => l.Entity == 2 && l.Action == 1 && l.EntityId == rule.Id);   // edited
        Assert.Contains(lines, l => l.Entity == 2 && l.Action == 3 && l.EntityId == other.Id);  // toggled
        Assert.All(lines, l => Assert.Equal("Sreyneang Chea", l.ChangedByName));
    }

    [Fact]
    public async Task AnEditedRule_KeepsItsBeforeAndAfterInTheAuditLog()
    {
        var campaign = await _client.CreateCampaignAsync();
        var rule = Rule("age", "at_least", ["17"]);
        var group = Group("All", "G", null, rule);
        var saved = await (await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, group))).ReadRuleSetAsync();
        await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, saved.Version, group with { Rules = [rule with { Values = ["18"] }] }));

        var before = await _fixture.ScalarAsync<string>(
            "select \"before\"::text from eligibility.audit_log where entity_id = @id and action = 1", ("id", rule.Id));
        var after = await _fixture.ScalarAsync<string>(
            "select \"after\"::text from eligibility.audit_log where entity_id = @id and action = 1", ("id", rule.Id));

        Assert.Contains("\"17\"", before);
        Assert.Contains("\"18\"", after);
    }

    [Fact]
    public async Task ARefusedSave_WritesNoAuditLines()
    {
        var campaign = await _client.CreateCampaignAsync();

        await _client.SaveDraftAsync(campaign.Id, Request(ReferenceDate, null, Group(rules: [Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"])])));

        Assert.Empty(await AuditLinesAsync(campaign.Id));
    }

    private record AuditLine(short Entity, short Action, Guid EntityId, string ChangedByName);

    private async Task<List<AuditLine>> AuditLinesAsync(Guid campaignId)
    {
        await using var connection = new Npgsql.NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new Npgsql.NpgsqlCommand(
            "select entity, action, entity_id, changed_by_name from eligibility.audit_log where campaign_id = @id", connection);
        command.Parameters.AddWithValue("id", campaignId);
        var lines = new List<AuditLine>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            lines.Add(new AuditLine(reader.GetInt16(0), reader.GetInt16(1), reader.GetGuid(2), reader.GetString(3)));
        }

        return lines;
    }
}
