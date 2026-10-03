using System.Net;
using System.Net.Http.Json;
using Eligibility.Application;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>Exam subjects through the real API and database: the list, the rules on it, and what is kept.</summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class ExamSubjectFlowTests
{
    private readonly EligibilityApiFixture _fixture;
    private readonly HttpClient _manager;

    public ExamSubjectFlowTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
        _manager = fixture.CreateManagerClient("Sreyneang Chea");
    }

    private async Task<Guid> NewCampaignAsync() => (await _manager.CreateCampaignAsync()).Id;

    private static string[] Names(ExamSetupDto setup) => setup.Subjects.Select(s => s.Name).ToArray();

    // ---------- Opening ----------

    [Fact]
    public async Task OpeningANewCampaign_GivesMathLogicAndEnglish_ThatStayTheSame()
    {
        var id = await NewCampaignAsync();

        var first = await _manager.LoadSubjectsAsync(id);
        var second = await _manager.LoadSubjectsAsync(id);

        Assert.Equal(["Math", "Logic", "English"], Names(first));
        Assert.Equal(first.Subjects.Select(s => s.Key), second.Subjects.Select(s => s.Key));
        Assert.Equal(3, await _fixture.ScalarAsync<long>("select count(*) from eligibility.fields where campaign_id = @id", ("id", id)));
    }

    [Fact]
    public async Task TheCatalogue_HasTheCampaignsSubjectsAndTheTotals_WithNumberOperators()
    {
        var setup = await _manager.LoadSubjectsAsync(await NewCampaignAsync());

        var keys = setup.Catalogue.Fields.Select(f => f.Key).ToList();
        Assert.Equal(13, keys.Count); // 8 shared + 3 subjects + total + average
        Assert.Equal(
            [.. setup.Subjects.Select(s => s.Key), "exam_total", "exam_average"],
            keys.Skip(8));
        var math = setup.Catalogue.Fields.Single(f => f.Key == setup.Subjects[0].Key);
        Assert.Equal("Math score", math.Label);
        Assert.Equal("Number", math.ValueType);
        Assert.Equal("points", math.Unit);
        Assert.Equal(2, math.Decimals);
        Assert.Equal(0m, math.MinValue);
        Assert.Equal(100m, math.MaxValue);
        Assert.Equal(["equals", "less_than", "at_most", "greater_than", "at_least", "between"], math.Operators.Select(o => o.Key));
        Assert.Equal("ExamTotal", setup.Catalogue.Fields.Single(f => f.Key == "exam_total").Derivation);
    }

    [Fact]
    public async Task ManyPeopleOpeningTheSameNewCampaignAtOnce_StillGetExactlyThreeSubjects()
    {
        var id = await NewCampaignAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => _manager.GetSubjectsAsync(id)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(3, await _fixture.ScalarAsync<long>("select count(*) from eligibility.fields where campaign_id = @id", ("id", id)));
        Assert.Equal(1, await _fixture.ScalarAsync<long>("select count(*) from eligibility.exam_setups where campaign_id = @id", ("id", id)));
    }

    [Fact]
    public async Task EachCampaignHasItsOwnSubjects()
    {
        var first = await NewCampaignAsync();
        var second = await NewCampaignAsync();
        var firstSetup = await _manager.LoadSubjectsAsync(first);
        var secondSetup = await _manager.LoadSubjectsAsync(second);

        await _manager.AddSubjectAsync(first, "Physics");

        Assert.Equal(4, (await _manager.LoadSubjectsAsync(first)).Subjects.Count);
        Assert.Equal(3, (await _manager.LoadSubjectsAsync(second)).Subjects.Count);
        Assert.Empty(firstSetup.Subjects.Select(s => s.Key).Intersect(secondSetup.Subjects.Select(s => s.Key)));
    }

    [Fact]
    public async Task AnUnknownCampaign_Is404()
    {
        var response = await _manager.GetSubjectsAsync(Guid.NewGuid());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Add, rename, remove ----------

    [Fact]
    public async Task AddingASubject_ShowsItLast_InTheCatalogueToo_AndIsAudited()
    {
        var id = await NewCampaignAsync();
        await _manager.LoadSubjectsAsync(id);

        var setup = await (await _manager.AddSubjectAsync(id, "  Khmer   literature ")).ReadSetupAsync();

        var added = setup.Subjects[^1];
        Assert.Equal("Khmer literature", added.Name);
        Assert.Contains(setup.Catalogue.Fields, f => f.Key == added.Key && f.Label == "Khmer literature score");
        Assert.Equal(1, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.audit_log where campaign_id = @id and entity = 3 and action = 0 and changed_by_name = 'Sreyneang Chea' and after->>'name' = 'Khmer literature'",
            ("id", id)));
    }

    [Theory]
    [InlineData("", "Enter the subject's name.")]
    [InlineData("   ", "Enter the subject's name.")]
    [InlineData("math", "This campaign already has a subject with this name.")]
    [InlineData("MATH ", "This campaign already has a subject with this name.")]
    public async Task ABadName_Is400_WithTheMessageUnderTheName(string name, string message)
    {
        var id = await NewCampaignAsync();

        var response = await _manager.AddSubjectAsync(id, name);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal([message], (await response.ReadProblemAsync()).Errors!["name"]);
        Assert.Equal(3, (await _manager.LoadSubjectsAsync(id)).Subjects.Count);
    }

    [Fact]
    public async Task AMissingBody_IsAnErrorUnderTheNameToo()
    {
        var id = await NewCampaignAsync();

        var response = await _manager.PostAsJsonAsync($"/api/campaigns/{id}/eligibility/exam-subjects", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["Enter the subject's name."], (await response.ReadProblemAsync()).Errors!["name"]);
    }

    [Fact]
    public async Task ATooLongName_And_ATooManySubjects_AreRefused()
    {
        var id = await NewCampaignAsync();

        var tooLong = await _manager.AddSubjectAsync(id, new string('x', 41));
        for (var i = 0; i < 9; i++)
        {
            (await _manager.AddSubjectAsync(id, $"Extra {i}")).EnsureSuccessStatusCode();
        }

        var tooMany = await _manager.AddSubjectAsync(id, "One too many");

        Assert.Equal(["The name must be 40 characters or fewer."], (await tooLong.ReadProblemAsync()).Errors!["name"]);
        Assert.Equal(["A campaign can have at most 12 subjects."], (await tooMany.ReadProblemAsync()).Errors!["name"]);
        Assert.Equal(12, (await _manager.LoadSubjectsAsync(id)).Subjects.Count);
    }

    [Fact]
    public async Task Renaming_KeepsTheKey_ChangesTheLabel_AndIsAudited()
    {
        var id = await NewCampaignAsync();
        var math = (await _manager.LoadSubjectsAsync(id)).Subjects[0];

        var setup = await (await _manager.RenameSubjectAsync(id, math.Key, "Mathematics")).ReadSetupAsync();

        Assert.Equal(math.Key, setup.Subjects[0].Key);
        Assert.Equal("Mathematics", setup.Subjects[0].Name);
        Assert.Equal("Mathematics score", setup.Catalogue.Fields.Single(f => f.Key == math.Key).Label);
        Assert.Equal(1, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.audit_log where campaign_id = @id and entity = 3 and action = 1 and before->>'name' = 'Math' and after->>'name' = 'Mathematics'",
            ("id", id)));
    }

    [Fact]
    public async Task ARuleOnARenamedSubject_KeepsWorking()
    {
        var id = await NewCampaignAsync();
        var math = (await _manager.LoadSubjectsAsync(id)).Subjects[0];
        await _manager.SaveDraftAsync(id, Completable(null, Rule(math.Key, "at_least", ["50"])));

        await _manager.RenameSubjectAsync(id, math.Key, "Mathematics");

        var rules = await _manager.LoadRulesAsync(id);
        Assert.Equal(math.Key, rules.Groups[0].Rules[0].FieldKey);
        Assert.Equal(1, (await _manager.LoadSubjectsAsync(id)).Subjects[0].RuleCount);
    }

    [Fact]
    public async Task Removing_TakesTheSubjectOutOfTheListAndTheCatalogue()
    {
        var id = await NewCampaignAsync();
        var logic = (await _manager.LoadSubjectsAsync(id)).Subjects[1];

        var setup = await (await _manager.RemoveSubjectAsync(id, logic.Key)).ReadSetupAsync();

        Assert.Equal(["Math", "English"], Names(setup));
        Assert.DoesNotContain(setup.Catalogue.Fields, f => f.Key == logic.Key);
        Assert.Equal(0, await _fixture.ScalarAsync<long>("select count(*) from eligibility.fields where key = @k", ("k", logic.Key)));
        Assert.Equal(1, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.audit_log where campaign_id = @id and entity = 3 and action = 2 and before->>'name' = 'Logic'",
            ("id", id)));
    }

    [Fact]
    public async Task ASubjectASavedRuleUses_CannotBeRemoved_UntilTheRuleIsGone()
    {
        var id = await NewCampaignAsync();
        var math = (await _manager.LoadSubjectsAsync(id)).Subjects[0];
        var saved = await (await _manager.SaveDraftAsync(id, Completable(null, Rule(math.Key, "at_least", ["50"])))).ReadRuleSetAsync();

        var refused = await _manager.RemoveSubjectAsync(id, math.Key);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.ReadProblemAsync();
        Assert.Equal("eligibility.subject_in_use", problem.Code);
        Assert.Equal(1, (await _manager.LoadSubjectsAsync(id)).Subjects[0].RuleCount);

        await _manager.SaveDraftAsync(id, Completable(saved.Version, Rule("gender", "is", ["female"])));

        Assert.True((await _manager.RemoveSubjectAsync(id, math.Key)).IsSuccessStatusCode);
    }

    [Fact]
    public async Task AnUnknownOrSharedKey_Is404_ForRenameAndRemove()
    {
        var id = await NewCampaignAsync();
        var theirs = (await _manager.LoadSubjectsAsync(await NewCampaignAsync())).Subjects[0];

        foreach (var key in new[] { "gender", "exam_total", "nope", theirs.Key })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await _manager.RenameSubjectAsync(id, key, "X")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await _manager.RemoveSubjectAsync(id, key)).StatusCode);
        }

        Assert.Equal(3, (await _manager.LoadSubjectsAsync(id)).Subjects.Count);
    }

    // ---------- Rules on subjects ----------

    [Fact]
    public async Task ARuleOnASubject_IsSaved_Completed_AndTestedWithScores()
    {
        var id = await NewCampaignAsync();
        var subjects = (await _manager.LoadSubjectsAsync(id)).Subjects;
        var (math, english) = (subjects[0].Key, subjects[2].Key);
        var rules = Completable(null, Rule(math, "at_least", ["50"]));
        rules = rules with { Groups = [rules.Groups![0] with { Rules = [.. rules.Groups[0].Rules!, Rule(english, "between", ["40", "90"])] }] };

        var completed = await (await _manager.CompleteAsync(id, rules)).ReadRuleSetAsync();
        var pass = await (await _manager.TestAsync(id, new TestRequest(rules, new() { [math] = "50", [english] = "40" }))).Content.ReadFromJsonAsync<TestResultDto>();
        var fail = await (await _manager.TestAsync(id, new TestRequest(rules, new() { [math] = "49.99", [english] = "91" }))).Content.ReadFromJsonAsync<TestResultDto>();
        var missing = await (await _manager.TestAsync(id, new TestRequest(rules, new() { [math] = "70" }))).Content.ReadFromJsonAsync<TestResultDto>();

        Assert.Equal("Complete", completed.StepStatus);
        Assert.True(pass!.Eligible);
        Assert.False(fail!.Eligible);
        Assert.Equal(2, fail.FailedMandatory);
        Assert.False(missing!.Eligible);
        Assert.Equal([false, true], missing.Rules.Select(r => r.DataMissing));
    }

    [Fact]
    public async Task TheTotalAndAverage_AreWorkedOutFromTheScoresGiven()
    {
        var id = await NewCampaignAsync();
        var subjects = (await _manager.LoadSubjectsAsync(id)).Subjects;
        var rules = Request(ReferenceDate, null, Group(rules: [Rule("exam_total", "at_least", ["200"]), Rule("exam_average", "at_least", ["70"])]));
        TestRequest Candidate(string a, string b, string? c) => new(rules, new()
        {
            [subjects[0].Key] = a,
            [subjects[1].Key] = b,
            [subjects[2].Key] = c,
        });

        var good = await (await _manager.TestAsync(id, Candidate("80", "70", "60"))).Content.ReadFromJsonAsync<TestResultDto>();
        var lowAverage = await (await _manager.TestAsync(id, Candidate("80", "70", "59"))).Content.ReadFromJsonAsync<TestResultDto>();
        var absent = await (await _manager.TestAsync(id, Candidate("100", "100", null))).Content.ReadFromJsonAsync<TestResultDto>();

        Assert.True(good!.Eligible);
        Assert.Equal(["Passed", "Failed"], lowAverage!.Rules.Select(r => r.Outcome)); // total 209, average 69.67
        Assert.False(lowAverage.Eligible);
        Assert.False(absent!.Eligible);
        Assert.All(absent.Rules, r => Assert.True(r.DataMissing));
    }

    [Fact]
    public async Task ASubjectOfAnotherCampaign_IsRefusedInARule()
    {
        var mine = await NewCampaignAsync();
        var theirs = (await _manager.LoadSubjectsAsync(await NewCampaignAsync())).Subjects[0];
        var rule = Rule(theirs.Key, "at_least", ["50"]);

        var response = await _manager.SaveDraftAsync(mine, Completable(null, rule));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["Choose a field."], (await response.ReadProblemAsync()).Errors![$"rules.{rule.Id}.field"]);
    }

    [Fact]
    public async Task AScoreOutsideZeroToOneHundred_IsRefused()
    {
        var id = await NewCampaignAsync();
        var math = (await _manager.LoadSubjectsAsync(id)).Subjects[0];
        var rule = Rule(math.Key, "at_least", ["120"]);

        var response = await _manager.SaveDraftAsync(id, Completable(null, rule));

        Assert.Equal(["Enter 100 or less."], (await response.ReadProblemAsync()).Errors![$"rules.{rule.Id}.values"]);
    }

    [Fact]
    public async Task TheDatabaseKeepsSubjectsApart_EvenForTheSameName()
    {
        var first = await NewCampaignAsync();
        var second = await NewCampaignAsync();
        await _manager.LoadSubjectsAsync(first);
        await _manager.LoadSubjectsAsync(second);

        Assert.Equal(2, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.fields where lower(subject_name) = 'math' and campaign_id in (@a, @b)", ("a", first), ("b", second)));
    }
}
