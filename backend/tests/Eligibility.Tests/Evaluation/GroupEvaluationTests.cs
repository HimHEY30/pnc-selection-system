using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Evaluation;

/// <summary>ALL/ANY grouping, mandatory vs optional, and the top-level ALL.</summary>
public sealed class GroupEvaluationTests
{
    // A 20-year-old woman from Siem Reap with Grade 12 who did attend a session.
    private static readonly CandidateData Candidate = new(new Dictionary<string, string?>
    {
        ["date_of_birth"] = "2006-06-01",
        ["gender"] = "female",
        ["province"] = "17",
        ["highest_grade"] = "grade_12",
        ["attended_info_session"] = "true",
        ["family_income"] = "150",
    });

    private static EligibilityResult Run(params GroupContent[] groups) =>
        EligibilityEvaluator.Evaluate(R.Set(groups), R.Catalogue, Candidate);

    private static readonly RuleContent Passing = R.Rule("gender", "is", "female");
    private static readonly RuleContent Failing = R.Rule("gender", "is", "male");

    // ---------- ALL ----------

    [Fact]
    public void AllGroup_Passes_WhenEveryMandatoryRulePasses()
    {
        var result = Run(R.All(Passing, R.Rule("age", "between", "17", "23"), R.Rule("province", "is_one_of", "2", "17")));

        Assert.True(result.Eligible);
        Assert.All(result.Rules, r => Assert.Equal(RuleOutcome.Passed, r.Outcome));
    }

    [Fact]
    public void AllGroup_Fails_WhenOneMandatoryRuleFails()
    {
        var result = Run(R.All(Passing, Failing));

        Assert.False(result.Eligible);
        Assert.Equal(1, result.FailedMandatory);
    }

    // ---------- ANY ----------

    [Fact]
    public void AnyGroup_Passes_WhenOneMandatoryRulePasses()
    {
        var result = Run(R.Any(Failing, Passing, R.Rule("province", "is", "2")));

        Assert.True(result.Eligible);
    }

    [Fact]
    public void AnyGroup_Fails_WhenNoMandatoryRulePasses()
    {
        var result = Run(R.Any(Failing, R.Rule("province", "is", "2")));

        Assert.False(result.Eligible);
    }

    // ---------- Groups combine with ALL ----------

    [Fact]
    public void Groups_MustAllPass()
    {
        Assert.True(Run(R.All(Passing), R.Any(Failing, R.Rule("province", "is", "17"))).Eligible);
        Assert.False(Run(R.All(Passing), R.Any(Failing, R.Rule("province", "is", "2"))).Eligible);
        Assert.False(Run(R.All(Failing), R.All(Passing)).Eligible);
    }

    [Fact]
    public void EachGroupReportsItsOwnResult()
    {
        var good = R.All(Passing);
        var bad = R.Any(Failing);

        var result = Run(good, bad);

        Assert.Equal([true, false], result.Groups.Select(g => g.Passed));
        Assert.Equal([good.Id, bad.Id], result.Groups.Select(g => g.GroupId));
        Assert.Equal([GroupLogic.All, GroupLogic.Any], result.Groups.Select(g => g.Logic));
    }

    // ---------- Mandatory vs optional ----------

    [Fact]
    public void AFailedOptionalRule_DoesNotBlock_ButIsCountedAsAWarning()
    {
        var result = Run(R.All(Passing, R.Optional("gender", "is", "male")));

        Assert.True(result.Eligible);
        Assert.Equal(1, result.Warnings);
        Assert.Equal(0, result.FailedMandatory);
    }

    [Fact]
    public void APassedOptionalRule_IsNotAWarning()
    {
        var result = Run(R.All(Passing, R.Optional("gender", "is", "female")));

        Assert.Equal(0, result.Warnings);
    }

    [Fact]
    public void OptionalRules_DoNotCountTowardsAnAnyGroup()
    {
        // The only rule that passes is optional, so the ANY group has no passing mandatory rule.
        var result = Run(R.Any(Failing, R.Optional("gender", "is", "female")));

        Assert.False(result.Eligible);
    }

    [Fact]
    public void AGroupOfOnlyOptionalRules_HasNoSay()
    {
        var result = Run(R.All(Passing), R.All(R.Optional("gender", "is", "male")));

        Assert.True(result.Eligible);
        Assert.Equal([true, false], result.Groups.Select(g => g.Counted));
        Assert.Equal(1, result.Warnings);
    }

    [Fact]
    public void OptionalFailures_StillCarryTheirMessage()
    {
        var optional = R.Optional("gender", "is", "male") with { Message = "Preferably male." };

        var result = Run(R.All(Passing, optional));

        Assert.Equal("Preferably male.", result.Rules.Single(r => r.RuleId == optional.Id).Message);
    }

    // ---------- Inactive rules ----------

    [Fact]
    public void AnInactiveRule_IsSkipped_AndCannotBlock()
    {
        var result = Run(R.All(Passing, Failing.Inactive()));

        Assert.True(result.Eligible);
        Assert.Equal(RuleOutcome.Skipped, result.Rules[1].Outcome);
        Assert.Null(result.Rules[1].Message);
    }

    [Fact]
    public void AnInactiveRule_DoesNotCountTowardsAnAnyGroup()
    {
        var result = Run(R.Any(Failing, Passing.Inactive()));

        Assert.False(result.Eligible);
    }

    [Fact]
    public void AGroupWhoseRulesAreAllInactive_HasNoSay()
    {
        var result = Run(R.All(Passing), R.All(Failing.Inactive()));

        Assert.True(result.Eligible);
        Assert.False(result.Groups[1].Counted);
    }

    // ---------- Messages ----------

    [Fact]
    public void AFailedRule_ShowsItsMessage_APassedRuleShowsNone()
    {
        var failing = Failing with { Message = "Applicants must be male." };
        var passing = Passing with { Message = "Never shown." };

        var result = Run(R.All(passing, failing));

        Assert.Null(result.Rules.Single(r => r.RuleId == passing.Id).Message);
        Assert.Equal("Applicants must be male.", result.Rules.Single(r => r.RuleId == failing.Id).Message);
    }

    // ---------- Edge cases ----------

    [Fact]
    public void ARuleSetWithNoRules_IsEligibleByDefault()
    {
        Assert.True(Run().Eligible);
        Assert.True(Run(R.All()).Eligible);
    }

    [Fact]
    public void AnUnknownField_CanNeverPass()
    {
        var result = Run(R.All(R.Rule("shoe_size", "equals", "40")));

        Assert.False(result.Eligible);
    }

    [Fact]
    public void AnOperatorOfTheWrongType_CanNeverPass()
    {
        var result = Run(R.All(R.Rule("gender", "between", "1", "2")));

        Assert.False(result.Eligible);
    }

    [Fact]
    public void ACandidateWithNoData_FailsEveryMandatoryRule()
    {
        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(Passing, R.Rule("age", "at_least", "17"))), R.Catalogue, CandidateData.Empty);

        Assert.False(result.Eligible);
        Assert.All(result.Rules, r => Assert.True(r.DataMissing));
    }

    [Fact]
    public void TheSameRuleSet_CanBeCheckedAgainstManyCandidates()
    {
        var rules = R.Set(R.All(R.Rule("age", "between", "17", "23")));
        bool Eligible(string birth) => EligibilityEvaluator
            .Evaluate(rules, R.Catalogue, new CandidateData(new Dictionary<string, string?> { ["date_of_birth"] = birth }))
            .Eligible;

        Assert.True(Eligible("2006-01-01"));
        Assert.False(Eligible("1990-01-01"));
        Assert.False(Eligible("2015-01-01"));
    }

    [Fact]
    public void ARealisticRuleSet_PassesAndFailsForTheRightReasons()
    {
        var rules = R.Set(
            R.All(
                R.Rule("age", "between", "17", "23"),
                R.Rule("highest_grade", "is_one_of", "grade_12", "diploma_or_higher"),
                R.Rule("family_income", "at_most", "300")),
            R.Any(R.Rule("province", "is", "2"), R.Rule("province", "is", "17")),
            R.All(R.Optional("attended_info_session", "is_yes")));

        var eligible = EligibilityEvaluator.Evaluate(rules, R.Catalogue, Candidate);
        var failing = EligibilityEvaluator.Evaluate(
            rules, R.Catalogue,
            new CandidateData(new Dictionary<string, string?>
            {
                ["date_of_birth"] = "2006-06-01", ["highest_grade"] = "grade_12", ["family_income"] = "900",
                ["province"] = "21", ["attended_info_session"] = "false",
            }));

        Assert.True(eligible.Eligible);
        Assert.False(failing.Eligible);
        Assert.Equal(3, failing.FailedMandatory); // income, and both province rules
        Assert.Equal(2, failing.Groups.Count(g => !g.Passed)); // the first group and the province group
        Assert.Equal(1, failing.Warnings);
    }
}
