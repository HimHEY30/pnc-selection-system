using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Rules;

public sealed class SuggestedRulesTests
{
    private static readonly string[] Provinces = ["17", "2", "21"];

    private static RuleSetContent Create(string[]? provinces = null, DateOnly? start = null) =>
        SuggestedRules.Create(provinces ?? Provinces, start ?? new DateOnly(2026, 11, 2));

    [Fact]
    public void OffersOneAllGroupWithTheFourStarterRules()
    {
        var set = Create();

        var group = Assert.Single(set.Groups);
        Assert.Equal("Basic requirements", group.Name);
        Assert.Equal(GroupLogic.All, group.Logic);
        Assert.Equal(["age", "highest_grade", "province", "attended_info_session"], group.Rules.Select(r => r.FieldKey));
    }

    [Fact]
    public void TheFirstThreeAreMandatory_TheInfoSessionOneIsOptional()
    {
        var rules = Create().Groups[0].Rules;

        Assert.Equal(
            [RuleType.Mandatory, RuleType.Mandatory, RuleType.Mandatory, RuleType.Optional],
            rules.Select(r => r.Type));
        Assert.All(rules, r => Assert.True(r.IsActive));
    }

    [Fact]
    public void AgeIsBetween17And23()
    {
        var age = Create().Groups[0].Rules[0];

        Assert.Equal("between", age.OperatorKey);
        Assert.Equal(["17", "23"], age.Values);
    }

    [Fact]
    public void TheProvinceRuleUsesTheCampaignsTargetProvinces_SortedAndDistinct()
    {
        var province = Create(["17", "2", "21", "17"]).Groups[0].Rules.Single(r => r.FieldKey == "province");

        Assert.Equal("is_one_of", province.OperatorKey);
        Assert.Equal(["17", "2", "21"], province.Values.Order(StringComparer.Ordinal));
        Assert.Equal(province.Values.Order(StringComparer.Ordinal), province.Values);
    }

    [Fact]
    public void WithNoTargetProvinces_TheProvinceRuleIsLeftOut()
    {
        var fields = Create([]).Groups[0].Rules.Select(r => r.FieldKey);

        Assert.DoesNotContain("province", fields);
        Assert.Equal(3, fields.Count());
    }

    [Fact]
    public void TheAgeReferenceDate_DefaultsToTheCampaignStartDate()
    {
        Assert.Equal(new DateOnly(2026, 11, 2), Create(start: new DateOnly(2026, 11, 2)).AgeReferenceDate);
        Assert.Null(SuggestedRules.Create(Provinces, null).AgeReferenceDate);
    }

    [Fact]
    public void EveryRuleHasAMessage_AndEveryIdIsNew()
    {
        var set = Create();

        Assert.All(set.AllRules, r => Assert.False(string.IsNullOrWhiteSpace(r.Message)));
        var ids = set.AllRules.Select(r => r.Id).Append(set.Groups[0].Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
        Assert.NotEqual(Create().Groups[0].Id, set.Groups[0].Id);
    }

    [Fact]
    public void TheSuggestedRules_AreValidAndNotContradictory()
    {
        var set = Create();

        Assert.Empty(RuleConflicts.FindContradictions(set, R.Catalogue));
        Assert.Empty(RuleConflicts.FindDuplicates(set));
        foreach (var rule in set.AllRules)
        {
            var field = R.Catalogue.FindField(rule.FieldKey)!;
            var op = R.Catalogue.FindOperator(rule.OperatorKey)!;
            Assert.True(R.Catalogue.IsAllowed(field, op), rule.FieldKey);
            Assert.True(RuleValueParser.Parse(field, op, rule.Values).IsValid, rule.FieldKey);
        }
    }

    [Fact]
    public void TheSuggestedRules_WorkWithTheEvaluator()
    {
        var set = Create();
        var fits = new CandidateData(new Dictionary<string, string?>
        {
            ["date_of_birth"] = "2006-06-01", ["highest_grade"] = "grade_12", ["province"] = "17", ["attended_info_session"] = "true",
        });
        var tooOld = new CandidateData(new Dictionary<string, string?>
        {
            ["date_of_birth"] = "1990-06-01", ["highest_grade"] = "grade_12", ["province"] = "17", ["attended_info_session"] = "true",
        });

        Assert.True(EligibilityEvaluator.Evaluate(set, R.Catalogue, fits).Eligible);
        Assert.False(EligibilityEvaluator.Evaluate(set, R.Catalogue, tooOld).Eligible);
    }

    [Fact]
    public void TheIdsCanBeSuppliedForTests()
    {
        var next = 0;
        var set = SuggestedRules.Create(Provinces, null, () => new Guid(++next, 0, 0, new byte[8]));

        Assert.Equal(new Guid(1, 0, 0, new byte[8]), set.Groups[0].Rules[0].Id);
    }
}
