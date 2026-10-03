using Eligibility.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;
using SharedKernel;
using static Eligibility.Tests.Support.ServiceHarness;

namespace Eligibility.Tests.Application;

/// <summary>Rules on a campaign's exam subjects, through the service: saving, testing and copying.</summary>
public sealed class ExamRuleServiceTests
{
    private readonly ServiceHarness _h = new();

    private async Task<(Guid Id, ExamSetupDto Setup)> CampaignWithSubjectsAsync()
    {
        var id = _h.Gateway.AddCampaign().CampaignId;
        return (id, (await _h.Subjects.GetAsync(id, default)).Value);
    }

    private static string[] ErrorsAt(Result<RuleSetDto> result, RuleInput rule, string part) =>
        result.Error.FieldErrors![RuleSetValidator.RuleKey(rule.Id, part)];

    // ---------- Saving ----------

    [Fact]
    public async Task ARuleOnASubject_IsSaved()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var rule = Rule(setup.Subjects[0].Key, "at_least", ["50"]);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal(setup.Subjects[0].Key, result.Value.Groups[0].Rules[0].FieldKey);
        Assert.Equal(["50"], result.Value.Groups[0].Rules[0].Values);
    }

    [Fact]
    public async Task ARuleOnASubject_CanBeCompleted()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();

        var result = await _h.Service.CompleteAsync(id, Completable(Rule(setup.Subjects[0].Key, "at_least", ["50"])), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal("Complete", result.Value.StepStatus);
    }

    [Theory]
    [InlineData("at_least", new[] { "0" }, true)]
    [InlineData("at_least", new[] { "100" }, true)]
    [InlineData("at_least", new[] { "99.99" }, true)]
    [InlineData("between", new[] { "0", "100" }, true)]
    [InlineData("at_least", new[] { "-0.01" }, false)]
    [InlineData("at_least", new[] { "100.01" }, false)]
    [InlineData("at_least", new[] { "50.123" }, false)]
    [InlineData("at_least", new[] { "fifty" }, false)]
    [InlineData("at_least", new string[0], false)]
    [InlineData("between", new[] { "60", "40" }, false)]
    public async Task ASubjectScoreInARule_MustBeBetweenZeroAndOneHundredWithTwoDecimals(string op, string[] values, bool valid)
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var rule = Rule(setup.Subjects[0].Key, op, values);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.Equal(valid, result.IsSuccess);
    }

    [Theory]
    [InlineData("101", "Enter 100 or less.")]
    [InlineData("-5", "Enter 0 or more.")]
    [InlineData("50.555", "Use at most 2 decimal places.")]
    public async Task ABadScore_SaysWhatIsWrongUnderTheValue(string value, string message)
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var rule = Rule(setup.Subjects[0].Key, "at_least", [value]);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.Equal([message], ErrorsAt(result, rule, "values"));
    }

    [Fact]
    public async Task ASubjectOfAnotherCampaign_IsNotAChoice()
    {
        var (id, _) = await CampaignWithSubjectsAsync();
        var (_, other) = await CampaignWithSubjectsAsync();
        var rule = Rule(other.Subjects[0].Key, "at_least", ["50"]);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.Equal(["Choose a field."], ErrorsAt(result, rule, "field"));
    }

    [Fact]
    public async Task ARemovedSubject_IsNoLongerAChoice()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        await _h.Subjects.RemoveAsync(id, setup.Subjects[0].Key, default);
        var rule = Rule(setup.Subjects[0].Key, "at_least", ["50"]);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.Equal(["Choose a field."], ErrorsAt(result, rule, "field"));
    }

    [Theory]
    [InlineData("exam_total")]
    [InlineData("exam_average")]
    public async Task TheTotalAndAverage_NeedTwoSubjects(string field)
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        await _h.Subjects.RemoveAsync(id, setup.Subjects[0].Key, default);
        await _h.Subjects.RemoveAsync(id, setup.Subjects[1].Key, default); // one left
        var rule = Rule(field, "at_least", ["50"]);

        var result = await _h.Service.SaveDraftAsync(id, Completable(rule), default);

        Assert.Equal(["Choose a field."], ErrorsAt(result, rule, "field"));
    }

    [Fact]
    public async Task TheTotal_IsNotCappedAtOneHundred_ButTheAverageIs()
    {
        var (id, _) = await CampaignWithSubjectsAsync();
        var total = Rule(ExamSubjects.TotalKey, "at_least", ["250"]);
        var average = Rule(ExamSubjects.AverageKey, "at_least", ["250"]);

        var result = await _h.Service.SaveDraftAsync(id, Request(null, Group(rules: [total, average])), default);

        Assert.False(result.IsSuccess);
        Assert.False(result.Error.FieldErrors!.ContainsKey(RuleSetValidator.RuleKey(total.Id, "values")));
        Assert.Equal(["Enter 100 or less."], ErrorsAt(result, average, "values"));
    }

    [Fact]
    public async Task ContradictoryScoreRules_AreRefusedLikeAnyOther()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var key = setup.Subjects[0].Key;
        var low = Rule(key, "at_least", ["80"]);
        var high = Rule(key, "at_most", ["60"]);

        var result = await _h.Service.SaveDraftAsync(id, Request(null, Group(rules: [low, high])), default);

        Assert.Contains("can never all be true together", result.Error.FieldErrors![$"rules.{low.Id}"].Single());
        Assert.Contains("can never all be true together", result.Error.FieldErrors![$"rules.{high.Id}"].Single());
    }

    [Fact]
    public async Task TheSameScoreRuleTwiceInAGroup_IsRefused()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var first = Rule(setup.Subjects[0].Key, "at_least", ["50"]);
        var second = Rule(setup.Subjects[0].Key, "at_least", ["50"]);

        var result = await _h.Service.SaveDraftAsync(id, Request(null, Group(rules: [first, second])), default);

        Assert.Equal(["The same rule already exists in this group."], result.Error.FieldErrors![$"rules.{second.Id}"]);
    }

    // ---------- Testing a sample candidate ----------

    [Fact]
    public async Task TheTestPanel_UsesTheScoresOfTheSampleCandidate()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var (math, english) = (setup.Subjects[0].Key, setup.Subjects[2].Key);
        var rules = Request(null, Group(rules: [Rule(math, "at_least", ["50"]), Rule(english, "at_least", ["60"])]));
        var candidate = new Dictionary<string, string?> { [math] = "70", [english] = "55" };

        var result = await _h.Service.TestAsync(id, new TestRequest(rules, candidate), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.False(result.Value.Eligible);
        Assert.Equal(["Passed", "Failed"], result.Value.Rules.Select(r => r.Outcome));
    }

    [Fact]
    public async Task TheTestPanel_FlagsAScoreThatWasNotGiven()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var rules = Request(null, Group(rules: Rule(setup.Subjects[0].Key, "at_least", ["50"])));

        var result = await _h.Service.TestAsync(id, new TestRequest(rules, new Dictionary<string, string?>()), default);

        Assert.True(result.Value.Rules[0].DataMissing);
    }

    [Fact]
    public async Task TheTestPanel_WorksOutTheTotalAndAverageFromTheScores()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        var rules = Request(null, Group(rules:
        [
            Rule(ExamSubjects.TotalKey, "at_least", ["200"]),
            Rule(ExamSubjects.AverageKey, "between", ["65", "70"]),
        ]));
        var candidate = setup.Subjects.Zip(new[] { "80", "60", "65" }).ToDictionary(p => p.First.Key, p => (string?)p.Second);

        var result = await _h.Service.TestAsync(id, new TestRequest(rules, candidate), default);

        Assert.True(result.Value.Eligible);
        Assert.Equal(["Passed", "Passed"], result.Value.Rules.Select(r => r.Outcome));
    }

    [Fact]
    public async Task TheTestPanel_IgnoresASubjectTheCampaignRemoved()
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        await _h.Subjects.RemoveAsync(id, setup.Subjects[2].Key, default);
        var rules = Request(null, Group(rules: Rule(ExamSubjects.TotalKey, "equals", ["140"])));
        var candidate = new Dictionary<string, string?>
        {
            [setup.Subjects[0].Key] = "80",
            [setup.Subjects[1].Key] = "60",
            [setup.Subjects[2].Key] = "100",
        };

        var result = await _h.Service.TestAsync(id, new TestRequest(rules, candidate), default);

        Assert.True(result.Value.Eligible);
    }

    // ---------- Copying rules between campaigns ----------

    private async Task<Guid> CopySourceAsync(params string[] extraSubjects)
    {
        var (id, setup) = await CampaignWithSubjectsAsync();
        foreach (var name in extraSubjects)
        {
            await _h.Subjects.AddAsync(id, new SubjectRequest(name), default);
        }

        var subjects = (await _h.Subjects.GetAsync(id, default)).Value.Subjects;
        var rules = Request(null, Group(rules:
        [
            Rule(subjects[0].Key, "at_least", ["50"]),
            Rule(subjects[^1].Key, "at_least", ["40"]),
            Rule(ExamSubjects.AverageKey, "at_least", ["60"]),
        ]));
        await _h.Service.SaveDraftAsync(id, rules, default);
        return id;
    }

    [Fact]
    public async Task Copy_PointsTheCopiedRulesAtTheNewCampaignsOwnSubjects()
    {
        var source = await CopySourceAsync();
        var target = _h.Gateway.AddCampaign().CampaignId;

        var result = await _h.Service.CopyRulesAsync(source, target, default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        var targetSubjects = (await _h.Subjects.GetAsync(target, default)).Value.Subjects;
        var sourceSubjects = (await _h.Subjects.GetAsync(source, default)).Value.Subjects;
        var copied = (await _h.Service.GetAsync(target, default)).Value.Groups[0].Rules;
        Assert.Equal([targetSubjects[0].Key, targetSubjects[^1].Key, ExamSubjects.AverageKey], copied.Select(r => r.FieldKey));
        Assert.Empty(targetSubjects.Select(s => s.Key).Intersect(sourceSubjects.Select(s => s.Key)));
    }

    [Fact]
    public async Task Copy_ReusesASubjectWithTheSameName_AndAddsTheOthers()
    {
        var source = await CopySourceAsync("Physics");
        var target = _h.Gateway.AddCampaign().CampaignId;

        await _h.Service.CopyRulesAsync(source, target, default);

        var names = (await _h.Subjects.GetAsync(target, default)).Value.Subjects.Select(s => s.Name);
        Assert.Equal(["Math", "Logic", "English", "Physics"], names);
    }

    [Fact]
    public async Task Copy_AuditsTheSubjectsItAdds_ButNotTheOnesThatWereAlreadyThere()
    {
        var source = await CopySourceAsync("Physics");
        var target = _h.Gateway.AddCampaign().CampaignId;

        await _h.Service.CopyRulesAsync(source, target, default);

        var lines = _h.Repository.Audit.Where(a => a.CampaignId == target && a.Entity == AuditEntity.Subject).ToList();
        Assert.Equal("""{"name":"Physics"}""", Assert.Single(lines).AfterJson);
    }

    [Fact]
    public async Task Copy_IsRefusedIfTheTargetWouldNeedMoreSubjectsThanAllowed()
    {
        var source = await CopySourceAsync("A", "B", "C", "D", "E", "F", "G", "H", "I"); // 12 subjects
        var target = _h.Gateway.AddCampaign().CampaignId;
        await _h.Subjects.GetAsync(target, default);
        await _h.Subjects.RenameAsync(target, (await _h.Subjects.GetAsync(target, default)).Value.Subjects[0].Key, new SubjectRequest("Chemistry"), default);

        var result = await _h.Service.CopyRulesAsync(source, target, default);

        Assert.Equal("eligibility.invalid_subject", result.Error.Code);
    }
}
