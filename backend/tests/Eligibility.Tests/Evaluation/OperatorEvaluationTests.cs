using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Evaluation;

/// <summary>Every operator of every field type, at and around its boundary.</summary>
public sealed class OperatorEvaluationTests
{
    private static readonly FieldDefinition GraduationDate = new("graduation_date", "Graduation date", FieldValueType.Date, 9);

    private static readonly FieldCatalogue Catalogue =
        new([.. LaunchCatalogue.Fields, GraduationDate], OperatorDefinition.Defaults);

    /// <summary>Does one mandatory rule pass for a candidate whose only known value is this one?</summary>
    private static bool Passes(string field, string op, string[] ruleValues, string? candidateValue)
    {
        var def = Catalogue.FindField(field)!;
        var rule = R.Rule(field, op, ruleValues);
        var values = new Dictionary<string, string?> { [def.CandidateAttribute] = candidateValue };

        var result = EligibilityEvaluator.Evaluate(R.Set(R.All(rule)), Catalogue, new CandidateData(values));

        return result.Rules.Single().Outcome == RuleOutcome.Passed;
    }

    // ---------- Number (family income) ----------

    [Theory]
    [InlineData("equals", new[] { "200" }, "200", true)]
    [InlineData("equals", new[] { "200" }, "200.00", true)]
    [InlineData("equals", new[] { "200" }, "200.01", false)]
    [InlineData("less_than", new[] { "200" }, "199.99", true)]
    [InlineData("less_than", new[] { "200" }, "200", false)]
    [InlineData("less_than", new[] { "200" }, "250", false)]
    [InlineData("at_most", new[] { "200" }, "199", true)]
    [InlineData("at_most", new[] { "200" }, "200", true)]
    [InlineData("at_most", new[] { "200" }, "200.01", false)]
    [InlineData("greater_than", new[] { "200" }, "200.01", true)]
    [InlineData("greater_than", new[] { "200" }, "200", false)]
    [InlineData("greater_than", new[] { "200" }, "150", false)]
    [InlineData("at_least", new[] { "200" }, "201", true)]
    [InlineData("at_least", new[] { "200" }, "200", true)]
    [InlineData("at_least", new[] { "200" }, "199.99", false)]
    [InlineData("between", new[] { "100", "300" }, "100", true)]
    [InlineData("between", new[] { "100", "300" }, "300", true)]
    [InlineData("between", new[] { "100", "300" }, "200", true)]
    [InlineData("between", new[] { "100", "300" }, "99.99", false)]
    [InlineData("between", new[] { "100", "300" }, "300.01", false)]
    public void NumberOperators(string op, string[] ruleValues, string candidate, bool expected)
    {
        Assert.Equal(expected, Passes("family_income", op, ruleValues, candidate));
    }

    // ---------- Choice (highest grade) ----------

    [Theory]
    [InlineData("is", new[] { "grade_12" }, "grade_12", true)]
    [InlineData("is", new[] { "grade_12" }, "GRADE_12", true)]
    [InlineData("is", new[] { "grade_12" }, "grade_11", false)]
    [InlineData("is_not", new[] { "grade_9" }, "grade_12", true)]
    [InlineData("is_not", new[] { "grade_9" }, "grade_9", false)]
    [InlineData("is_one_of", new[] { "grade_12", "diploma_or_higher" }, "diploma_or_higher", true)]
    [InlineData("is_one_of", new[] { "grade_12", "diploma_or_higher" }, "grade_12", true)]
    [InlineData("is_one_of", new[] { "grade_12", "diploma_or_higher" }, "grade_10", false)]
    [InlineData("is_none_of", new[] { "grade_9", "grade_10" }, "grade_12", true)]
    [InlineData("is_none_of", new[] { "grade_9", "grade_10" }, "grade_10", false)]
    public void ChoiceOperators(string op, string[] ruleValues, string candidate, bool expected)
    {
        Assert.Equal(expected, Passes("highest_grade", op, ruleValues, candidate));
    }

    [Fact]
    public void ProvinceRules_CompareProvinceIds()
    {
        Assert.True(Passes("province", "is_one_of", ["2", "17"], "17"));
        Assert.False(Passes("province", "is_one_of", ["2", "17"], "21"));
    }

    // ---------- Yes / no ----------

    [Theory]
    [InlineData("is_yes", "true", true)]
    [InlineData("is_yes", "yes", true)]
    [InlineData("is_yes", "YES", true)]
    [InlineData("is_yes", "1", true)]
    [InlineData("is_yes", "false", false)]
    [InlineData("is_yes", "no", false)]
    [InlineData("is_no", "false", true)]
    [InlineData("is_no", "no", true)]
    [InlineData("is_no", "0", true)]
    [InlineData("is_no", "true", false)]
    public void YesNoOperators(string op, string candidate, bool expected)
    {
        Assert.Equal(expected, Passes("attended_info_session", op, [], candidate));
    }

    [Fact]
    public void YesNo_WithAnUnreadableAnswer_CountsAsNotProvided()
    {
        var result = Run("attended_info_session", "is_yes", [], "maybe");

        Assert.True(result.Rules.Single().DataMissing);
        Assert.False(result.Eligible);
    }

    // ---------- Date ----------

    [Theory]
    [InlineData("before", new[] { "2026-06-30" }, "2026-06-29", true)]
    [InlineData("before", new[] { "2026-06-30" }, "2026-06-30", false)]
    [InlineData("before", new[] { "2026-06-30" }, "2026-07-01", false)]
    [InlineData("after", new[] { "2026-06-30" }, "2026-07-01", true)]
    [InlineData("after", new[] { "2026-06-30" }, "2026-06-30", false)]
    [InlineData("after", new[] { "2026-06-30" }, "2026-06-29", false)]
    [InlineData("date_between", new[] { "2026-01-01", "2026-12-31" }, "2026-01-01", true)]
    [InlineData("date_between", new[] { "2026-01-01", "2026-12-31" }, "2026-12-31", true)]
    [InlineData("date_between", new[] { "2026-01-01", "2026-12-31" }, "2026-06-15", true)]
    [InlineData("date_between", new[] { "2026-01-01", "2026-12-31" }, "2025-12-31", false)]
    [InlineData("date_between", new[] { "2026-01-01", "2026-12-31" }, "2027-01-01", false)]
    public void DateOperators(string op, string[] ruleValues, string candidate, bool expected)
    {
        Assert.Equal(expected, Passes("graduation_date", op, ruleValues, candidate));
    }

    [Fact]
    public void ADateThatIsNotYearMonthDay_CountsAsNotProvided()
    {
        Assert.True(Run("graduation_date", "before", ["2026-06-30"], "30/06/2026").Rules.Single().DataMissing);
    }

    // ---------- Age, calculated on the reference date ----------

    private static bool AgePasses(string op, string[] ruleValues, string birthDate, string reference = "2026-11-02") =>
        EligibilityEvaluator.Evaluate(
                new RuleSetContent(DateOnly.Parse(reference), [R.All(R.Rule("age", op, ruleValues))]),
                Catalogue,
                new CandidateData(new Dictionary<string, string?> { ["date_of_birth"] = birthDate }))
            .Rules.Single().Outcome == RuleOutcome.Passed;

    [Theory]
    [InlineData("2009-11-02", 17)] // turns 17 exactly on the reference date
    [InlineData("2009-11-03", 16)] // turns 17 the day after
    [InlineData("2003-11-02", 23)]
    [InlineData("2003-11-01", 23)]
    [InlineData("2003-11-03", 22)]
    [InlineData("2000-02-29", 26)] // born on a leap day, 26 by 2 Nov 2026
    public void Age_CountsWholeYearsCompletedOnTheReferenceDate(string birth, int expectedAge)
    {
        Assert.True(AgePasses("equals", [expectedAge.ToString()], birth));
        Assert.False(AgePasses("equals", [(expectedAge + 1).ToString()], birth));
    }

    [Fact]
    public void Age_UsesTheCampaignsReferenceDate_NotToday()
    {
        // Born 2 Nov 2009: 17 on 2 Nov 2026, but only 16 on 1 Nov 2026.
        Assert.True(AgePasses("at_least", ["17"], "2009-11-02", reference: "2026-11-02"));
        Assert.False(AgePasses("at_least", ["17"], "2009-11-02", reference: "2026-11-01"));
    }

    [Fact]
    public void Age_BetweenIncludesBothEnds()
    {
        Assert.True(AgePasses("between", ["17", "23"], "2009-11-02"));
        Assert.True(AgePasses("between", ["17", "23"], "2003-11-02"));
        Assert.False(AgePasses("between", ["17", "23"], "2009-11-03"));
        Assert.False(AgePasses("between", ["17", "23"], "2002-11-02"));
    }

    [Fact]
    public void Age_WithoutAReferenceDate_CannotBeWorkedOut()
    {
        var content = new RuleSetContent(null, [R.All(R.Rule("age", "at_least", "17"))]);

        var result = EligibilityEvaluator.Evaluate(
            content, Catalogue, new CandidateData(new Dictionary<string, string?> { ["date_of_birth"] = "2000-01-01" }));

        Assert.True(result.Rules.Single().DataMissing);
        Assert.False(result.Eligible);
    }

    [Theory]
    [InlineData("2030-01-01")] // born after the reference date
    [InlineData("not a date")]
    [InlineData("")]
    public void Age_WithAnImpossibleOrUnreadableBirthDate_CountsAsNotProvided(string birth)
    {
        Assert.False(AgePasses("at_least", ["0"], birth));
    }

    // ---------- Missing data ----------

    [Fact]
    public void AMissingValue_FailsTheRuleAndSaysItWasNotProvided()
    {
        var result = Run("gender", "is", ["female"], null);

        var rule = result.Rules.Single();
        Assert.Equal(RuleOutcome.Failed, rule.Outcome);
        Assert.True(rule.DataMissing);
        Assert.False(result.Eligible);
    }

    [Fact]
    public void ABlankValue_IsTheSameAsMissing()
    {
        Assert.True(Run("gender", "is", ["female"], "   ").Rules.Single().DataMissing);
    }

    [Fact]
    public void AWrongAnswer_IsNotReportedAsMissing()
    {
        var rule = Run("gender", "is", ["female"], "male").Rules.Single();

        Assert.Equal(RuleOutcome.Failed, rule.Outcome);
        Assert.False(rule.DataMissing);
    }

    [Fact]
    public void ANumberThatIsNotANumber_CountsAsNotProvided()
    {
        Assert.True(Run("family_income", "at_most", ["200"], "lots").Rules.Single().DataMissing);
    }

    private static EligibilityResult Run(string field, string op, string[] ruleValues, string? candidateValue)
    {
        var def = Catalogue.FindField(field)!;
        return EligibilityEvaluator.Evaluate(
            R.Set(R.All(R.Rule(field, op, ruleValues))),
            Catalogue,
            new CandidateData(new Dictionary<string, string?> { [def.CandidateAttribute] = candidateValue }));
    }
}
