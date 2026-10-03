using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Rules;

public sealed class RuleConflictsTests
{
    private static readonly FieldCatalogue Catalogue = new(
        [.. LaunchCatalogue.Fields, new FieldDefinition("graduation_date", "Graduation date", FieldValueType.Date, 9)],
        OperatorDefinition.Defaults);

    private static IReadOnlyList<Contradiction> Contradictions(params GroupContent[] groups) =>
        RuleConflicts.FindContradictions(R.Set(groups), Catalogue);

    // ---------- Numbers ----------

    [Fact]
    public void AgeAtLeast20_AndAtMost18_Contradict()
    {
        var atLeast = R.Rule("age", "at_least", "20");
        var atMost = R.Rule("age", "at_most", "18");

        var found = Contradictions(R.All(atLeast, atMost));

        var contradiction = Assert.Single(found);
        Assert.Equal("age", contradiction.FieldKey);
        Assert.Equal(new[] { atLeast.Id, atMost.Id }.Order(), contradiction.RuleIds.Order());
    }

    [Theory]
    [InlineData("at_least", "20", "at_most", "20")]   // exactly 20: possible
    [InlineData("at_least", "17", "at_most", "23")]
    [InlineData("greater_than", "17", "less_than", "19")] // 18 fits
    [InlineData("equals", "20", "at_least", "18")]
    [InlineData("equals", "20", "at_most", "20")]
    public void CompatibleNumberRules_AreNotContradictions(string op1, string v1, string op2, string v2)
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", op1, v1), R.Rule("age", op2, v2))));
    }

    [Theory]
    [InlineData("at_least", "20", "at_most", "19")]
    [InlineData("greater_than", "20", "less_than", "21")]  // no whole age between 20 and 21
    [InlineData("greater_than", "17", "less_than", "18")]
    [InlineData("equals", "20", "less_than", "20")]
    [InlineData("equals", "20", "greater_than", "20")]
    [InlineData("equals", "20", "equals", "21")]
    [InlineData("equals", "20", "at_most", "19")]
    public void IncompatibleNumberRules_AreContradictions(string op1, string v1, string op2, string v2)
    {
        Assert.Single(Contradictions(R.All(R.Rule("age", op1, v1), R.Rule("age", op2, v2))));
    }

    [Fact]
    public void Between_AgainstAnotherRange_IsCheckedForOverlap()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", "between", "17", "23"), R.Rule("age", "between", "20", "30"))));
        Assert.Single(Contradictions(R.All(R.Rule("age", "between", "17", "19"), R.Rule("age", "between", "20", "30"))));
    }

    [Fact]
    public void Money_HasCentsSoGreaterThanAndLessThanCanFit()
    {
        // 100.01 fits between "greater than 100" and "less than 100.02" at two decimals.
        Assert.Empty(Contradictions(R.All(R.Rule("family_income", "greater_than", "100"), R.Rule("family_income", "less_than", "100.02"))));
        Assert.Single(Contradictions(R.All(R.Rule("family_income", "greater_than", "100"), R.Rule("family_income", "less_than", "100.01"))));
    }

    // ---------- Choices ----------

    [Fact]
    public void TwoDifferentIsRules_Contradict()
    {
        Assert.Single(Contradictions(R.All(R.Rule("gender", "is", "female"), R.Rule("gender", "is", "male"))));
    }

    [Fact]
    public void IsAndIsNotTheSameValue_Contradict()
    {
        Assert.Single(Contradictions(R.All(R.Rule("gender", "is", "female"), R.Rule("gender", "is_not", "female"))));
    }

    [Fact]
    public void IsOneOf_AgainstADisjointIsOneOf_Contradicts()
    {
        Assert.Single(Contradictions(R.All(
            R.Rule("highest_grade", "is_one_of", "grade_9", "grade_10"),
            R.Rule("highest_grade", "is_one_of", "grade_12", "diploma_or_higher"))));
    }

    [Fact]
    public void IsOneOf_AgainstOverlappingIsOneOf_IsFine()
    {
        Assert.Empty(Contradictions(R.All(
            R.Rule("highest_grade", "is_one_of", "grade_9", "grade_12"),
            R.Rule("highest_grade", "is_one_of", "grade_12", "diploma_or_higher"))));
    }

    [Fact]
    public void IsOneOf_WhoseEveryValueIsExcluded_Contradicts()
    {
        Assert.Single(Contradictions(R.All(
            R.Rule("highest_grade", "is_one_of", "grade_9", "grade_10"),
            R.Rule("highest_grade", "is_none_of", "grade_9", "grade_10"))));
    }

    [Fact]
    public void IsOneOf_WithOneValueLeftAfterExclusions_IsFine()
    {
        Assert.Empty(Contradictions(R.All(
            R.Rule("highest_grade", "is_one_of", "grade_9", "grade_10"),
            R.Rule("highest_grade", "is_not", "grade_9"))));
    }

    [Fact]
    public void ExclusionsAlone_AreNeverAContradiction()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("gender", "is_not", "female"), R.Rule("gender", "is_not", "male"))));
    }

    [Fact]
    public void ChoiceContradictions_IgnoreCase()
    {
        Assert.Single(Contradictions(R.All(R.Rule("gender", "is", "female"), R.Rule("gender", "is_not", "FEMALE"))));
    }

    // ---------- Yes / no and dates ----------

    [Fact]
    public void IsYesAndIsNo_Contradict()
    {
        Assert.Single(Contradictions(R.All(R.Rule("attended_info_session", "is_yes"), R.Rule("attended_info_session", "is_no"))));
    }

    [Fact]
    public void TwoIsYes_AreFine()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("attended_info_session", "is_yes"), R.Rule("attended_info_session", "is_yes"))));
    }

    [Fact]
    public void DatesAreCheckedLikeNumbers()
    {
        Assert.Single(Contradictions(R.All(R.Rule("graduation_date", "before", "2026-01-01"), R.Rule("graduation_date", "after", "2026-06-01"))));
        Assert.Empty(Contradictions(R.All(R.Rule("graduation_date", "after", "2026-01-01"), R.Rule("graduation_date", "before", "2026-06-01"))));
        Assert.Single(Contradictions(R.All(R.Rule("graduation_date", "after", "2026-01-01"), R.Rule("graduation_date", "before", "2026-01-02"))));
    }

    // ---------- Which rules take part ----------

    [Fact]
    public void ContradictionsAreFoundAcrossAllGroups_BecauseGroupsCombineWithAll()
    {
        var found = Contradictions(R.All(R.Rule("age", "at_least", "20")), R.All(R.Rule("age", "at_most", "18")));

        Assert.Single(found);
    }

    [Fact]
    public void RulesInAnAnyGroup_AreNotChecked()
    {
        Assert.Empty(Contradictions(R.Any(R.Rule("age", "at_least", "20"), R.Rule("age", "at_most", "18"))));
    }

    [Fact]
    public void AnAnyGroupDoesNotContradictAnAllGroup()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", "at_least", "20")), R.Any(R.Rule("age", "at_most", "18"))));
    }

    [Fact]
    public void OptionalAndInactiveRules_AreNotChecked()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", "at_least", "20"), R.Optional("age", "at_most", "18"))));
        Assert.Empty(Contradictions(R.All(R.Rule("age", "at_least", "20"), R.Rule("age", "at_most", "18").Inactive())));
    }

    [Fact]
    public void RulesAboutDifferentFields_DoNotInterfere()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", "at_least", "20"), R.Rule("family_income", "at_most", "18"))));
    }

    [Fact]
    public void RulesThatAreThemselvesInvalid_AreLeftToTheirOwnValidation()
    {
        Assert.Empty(Contradictions(R.All(R.Rule("age", "at_least", "abc"), R.Rule("age", "at_most", "18"))));
        Assert.Empty(Contradictions(R.All(R.Rule("shoe_size", "equals", "40"), R.Rule("shoe_size", "equals", "41"))));
    }

    [Fact]
    public void TheReportedSet_IsTheSmallestThatStillContradicts()
    {
        var a = R.Rule("age", "at_least", "20");
        var b = R.Rule("age", "at_most", "18");
        var unrelated = R.Rule("age", "at_least", "10"); // not part of the conflict

        var contradiction = Assert.Single(Contradictions(R.All(a, unrelated, b)));

        Assert.Equal(new[] { a.Id, b.Id }.Order(), contradiction.RuleIds.Order());
    }

    [Fact]
    public void ThreeRulesThatOnlyContradictTogether_AreAllReported()
    {
        // Each pair overlaps, but no value is in all three.
        var one = R.Rule("highest_grade", "is_one_of", "grade_9", "grade_10");
        var two = R.Rule("highest_grade", "is_not", "grade_9");
        var three = R.Rule("highest_grade", "is_not", "grade_10");

        var contradiction = Assert.Single(Contradictions(R.All(one, two, three)));

        Assert.Equal(3, contradiction.RuleIds.Count);
    }

    [Fact]
    public void EachFieldWithAConflict_IsReportedOnce()
    {
        var found = Contradictions(R.All(
            R.Rule("age", "at_least", "20"), R.Rule("age", "at_most", "18"),
            R.Rule("gender", "is", "female"), R.Rule("gender", "is", "male")));

        Assert.Equal(["age", "gender"], found.Select(c => c.FieldKey).Order());
    }

    // ---------- Duplicates ----------

    [Fact]
    public void TheSameRuleTwiceInOneGroup_IsADuplicate()
    {
        var first = R.Rule("age", "between", "17", "23");
        var second = R.Rule("age", "between", "17", "23");
        var group = R.All(first, second);

        var duplicate = Assert.Single(RuleConflicts.FindDuplicates(R.Set(group)));

        Assert.Equal(group.Id, duplicate.GroupId);
        Assert.Equal([first.Id, second.Id], duplicate.RuleIds);
    }

    [Fact]
    public void TheSameRuleInDifferentGroups_IsNotADuplicate()
    {
        Assert.Empty(RuleConflicts.FindDuplicates(R.Set(
            R.All(R.Rule("age", "at_least", "17")), R.All(R.Rule("age", "at_least", "17")))));
    }

    [Fact]
    public void RulesThatDifferInFieldOperatorOrValue_AreNotDuplicates()
    {
        Assert.Empty(RuleConflicts.FindDuplicates(R.Set(R.All(
            R.Rule("age", "at_least", "17"),
            R.Rule("age", "at_least", "18"),
            R.Rule("age", "at_most", "17"),
            R.Rule("family_income", "at_least", "17")))));
    }

    [Fact]
    public void ADuplicate_IsFoundEvenIfOneCopyIsOptionalOrInactive()
    {
        Assert.Single(RuleConflicts.FindDuplicates(R.Set(R.All(
            R.Rule("age", "at_least", "17"), R.Optional("age", "at_least", "17").Inactive()))));
    }

    [Fact]
    public void ThreeCopies_AreReportedAsOneDuplicate()
    {
        var duplicate = Assert.Single(RuleConflicts.FindDuplicates(R.Set(R.All(
            R.Rule("gender", "is", "female"), R.Rule("gender", "is", "female"), R.Rule("gender", "is", "female")))));

        Assert.Equal(3, duplicate.RuleIds.Count);
    }
}
