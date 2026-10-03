using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Evaluation;

/// <summary>Rules on exam subjects: one subject's score, and the total and average of all of them.</summary>
public sealed class ExamEvaluationTests
{
    private static readonly Guid Campaign = Guid.NewGuid();
    private static readonly FieldDefinition Math = ExamSubjects.CreateField(Guid.NewGuid(), Campaign, "Math", ExamSubjects.FirstPosition);
    private static readonly FieldDefinition Logic = ExamSubjects.CreateField(Guid.NewGuid(), Campaign, "Logic", ExamSubjects.FirstPosition + 1);
    private static readonly FieldDefinition English = ExamSubjects.CreateField(Guid.NewGuid(), Campaign, "English", ExamSubjects.FirstPosition + 2);

    private static readonly FieldCatalogue Catalogue = LaunchCatalogue.Create(Math, Logic, English);

    private static CandidateData Scores(string? math = null, string? logic = null, string? english = null) => new(
        new Dictionary<string, string?> { [Math.Key] = math, [Logic.Key] = logic, [English.Key] = english });

    private static RuleOutcome Outcome(string field, string op, string[] ruleValues, CandidateData candidate) =>
        EligibilityEvaluator.Evaluate(R.Set(R.All(R.Rule(field, op, ruleValues))), Catalogue, candidate).Rules.Single().Outcome;

    // ---------- One subject ----------

    [Theory]
    [InlineData("at_least", new[] { "50" }, "50", true)]
    [InlineData("at_least", new[] { "50" }, "49.99", false)]
    [InlineData("at_most", new[] { "90" }, "90", true)]
    [InlineData("greater_than", new[] { "50" }, "50", false)]
    [InlineData("between", new[] { "40", "60" }, "60", true)]
    [InlineData("between", new[] { "40", "60" }, "60.01", false)]
    public void ASubjectScore_IsComparedLikeAnyNumber(string op, string[] ruleValues, string score, bool expected)
    {
        var outcome = Outcome(Math.Key, op, ruleValues, Scores(math: score));

        Assert.Equal(expected ? RuleOutcome.Passed : RuleOutcome.Failed, outcome);
    }

    [Fact]
    public void ARuleOnOneSubject_IgnoresTheOtherSubjects()
    {
        var outcome = Outcome(Math.Key, "at_least", ["50"], Scores(math: "70"));

        Assert.Equal(RuleOutcome.Passed, outcome);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("absent")]
    public void AMissingOrUnreadableScore_FailsTheRuleAndIsFlaggedAsNotProvided(string? score)
    {
        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(Math.Key, "at_least", "50"))), Catalogue, Scores(math: score));

        var rule = result.Rules.Single();
        Assert.Equal(RuleOutcome.Failed, rule.Outcome);
        Assert.True(rule.DataMissing);
        Assert.False(result.Eligible);
    }

    [Fact]
    public void AScoreOfZero_IsAScoreNotAMissingValue()
    {
        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(Math.Key, "at_most", "10"))), Catalogue, Scores(math: "0"));

        Assert.Equal(RuleOutcome.Passed, result.Rules.Single().Outcome);
        Assert.False(result.Rules.Single().DataMissing);
    }

    [Fact]
    public void SubjectsOfAnotherCampaign_AreNotInThisCatalogue()
    {
        var other = ExamSubjects.CreateField(Guid.NewGuid(), Guid.NewGuid(), "Math", ExamSubjects.FirstPosition);

        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(other.Key, "at_least", "50"))), Catalogue,
            new CandidateData(new Dictionary<string, string?> { [other.Key] = "99" }));

        // Validation stops this being saved; if it gets here it cannot pass.
        Assert.Equal(RuleOutcome.Failed, result.Rules.Single().Outcome);
    }

    // ---------- Total ----------

    [Theory]
    [InlineData("at_least", new[] { "210" }, true)]
    [InlineData("at_least", new[] { "210.01" }, false)]
    [InlineData("equals", new[] { "210" }, true)]
    [InlineData("between", new[] { "200", "210" }, true)]
    [InlineData("less_than", new[] { "210" }, false)]
    public void TheTotal_IsTheSumOfEverySubject(string op, string[] ruleValues, bool expected)
    {
        var outcome = Outcome(ExamSubjects.TotalKey, op, ruleValues, Scores("80", "60.5", "69.5"));

        Assert.Equal(expected ? RuleOutcome.Passed : RuleOutcome.Failed, outcome);
    }

    [Fact]
    public void TheTotal_DoesNotCountASubjectTheCampaignDoesNotHave()
    {
        var catalogue = LaunchCatalogue.Create(Math, Logic);
        var candidate = Scores("50", "40", "100");

        var result = EligibilityEvaluator.Evaluate(R.Set(R.All(R.Rule(ExamSubjects.TotalKey, "equals", "90"))), catalogue, candidate);

        Assert.Equal(RuleOutcome.Passed, result.Rules.Single().Outcome);
    }

    // ---------- Average ----------

    [Theory]
    [InlineData("at_least", new[] { "70" }, true)]
    [InlineData("at_least", new[] { "70.01" }, false)]
    [InlineData("equals", new[] { "70" }, true)]
    [InlineData("at_most", new[] { "69.99" }, false)]
    public void TheAverage_IsTheTotalDividedByTheNumberOfSubjects(string op, string[] ruleValues, bool expected)
    {
        var outcome = Outcome(ExamSubjects.AverageKey, op, ruleValues, Scores("80", "60", "70"));

        Assert.Equal(expected ? RuleOutcome.Passed : RuleOutcome.Failed, outcome);
    }

    [Fact]
    public void TheAverage_IsRoundedToTwoDecimalsSoARuleCanReachIt()
    {
        // (50 + 50 + 51) / 3 = 50.3333...
        var equal = Outcome(ExamSubjects.AverageKey, "equals", ["50.33"], Scores("50", "50", "51"));
        var atLeast = Outcome(ExamSubjects.AverageKey, "at_least", ["50.34"], Scores("50", "50", "51"));

        Assert.Equal(RuleOutcome.Passed, equal);
        Assert.Equal(RuleOutcome.Failed, atLeast);
    }

    [Fact]
    public void TheAverage_RoundsAHalfUp()
    {
        // (0.01 + 0) / 2 = 0.005, which is shown as 0.01.
        var catalogue = LaunchCatalogue.Create(Math, Logic);
        var candidate = Scores("0.01", "0");

        var result = EligibilityEvaluator.Evaluate(R.Set(R.All(R.Rule(ExamSubjects.AverageKey, "equals", "0.01"))), catalogue, candidate);

        Assert.Equal(RuleOutcome.Passed, result.Rules.Single().Outcome);
    }

    // ---------- Missing subjects ----------

    [Theory]
    [InlineData(ExamSubjects.TotalKey)]
    [InlineData(ExamSubjects.AverageKey)]
    public void ATotalOrAverage_IsMissingWhenAnySubjectHasNoScore(string field)
    {
        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(field, "at_least", "0"))), Catalogue, Scores("100", "100", null));

        var rule = result.Rules.Single();
        Assert.Equal(RuleOutcome.Failed, rule.Outcome);
        Assert.True(rule.DataMissing);
        Assert.False(result.Eligible);
    }

    [Fact]
    public void ATotalOrAverage_IsMissingWhenAScoreIsNotANumber()
    {
        var result = EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(ExamSubjects.TotalKey, "at_least", "0"))), Catalogue, Scores("100", "lots", "100"));

        Assert.True(result.Rules.Single().DataMissing);
    }

    [Fact]
    public void ATotalSuppliedDirectly_IsIgnored()
    {
        var candidate = new CandidateData(new Dictionary<string, string?> { [ExamSubjects.TotalKey] = "300", [Math.Key] = "10" });

        var result = EligibilityEvaluator.Evaluate(R.Set(R.All(R.Rule(ExamSubjects.TotalKey, "at_least", "300"))), Catalogue, candidate);

        Assert.True(result.Rules.Single().DataMissing);
    }

    // ---------- With the other rules ----------

    [Fact]
    public void SubjectRules_CombineWithOtherRulesInGroupsAndStayOptionalWhenOptional()
    {
        var set = R.Set(
            R.All(R.Rule("age", "at_least", "17"), R.Rule(Math.Key, "at_least", "50")),
            R.Any(R.Rule(Logic.Key, "at_least", "60"), R.Rule(English.Key, "at_least", "60")),
            R.All(R.Optional(ExamSubjects.AverageKey, "at_least", "90")));
        var candidate = new CandidateData(new Dictionary<string, string?>
        {
            ["date_of_birth"] = "2008-01-01",
            [Math.Key] = "55",
            [Logic.Key] = "40",
            [English.Key] = "75",
        });

        var result = EligibilityEvaluator.Evaluate(set, Catalogue, candidate);

        Assert.True(result.Eligible);
        Assert.Equal(1, result.Warnings);
    }
}
