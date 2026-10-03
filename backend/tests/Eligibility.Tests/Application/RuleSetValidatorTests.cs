using Campaigns.Application;
using Eligibility.Application;
using Eligibility.Tests.Support;
using static Eligibility.Tests.Support.ServiceHarness;

namespace Eligibility.Tests.Application;

public sealed class RuleSetValidatorTests
{
    private static readonly IReadOnlyList<TargetProvince> Targets = [new("2", "Battambang"), new("17", "Siem Reap")];

    private static ValidatedRuleSet Validate(RuleSetRequest request, ValidationMode mode = ValidationMode.Draft) =>
        RuleSetValidator.Validate(request, R.Catalogue, Targets, mode);

    private static ValidatedRuleSet ValidateRules(ValidationMode mode, params RuleInput[] rules) =>
        Validate(Request(new DateOnly(2026, 11, 2), Group(rules: rules)), mode);

    private static string[] ErrorsFor(ValidatedRuleSet result, string key) =>
        result.Errors.TryGetValue(key, out var messages) ? messages : [];

    // ---------- A good rule set ----------

    [Fact]
    public void AValidRuleSet_PassesInEveryMode()
    {
        var request = Request(new DateOnly(2026, 11, 2), Group(rules:
        [
            Rule("age", "between", ["17", "23"]),
            Rule("province", "is_one_of", ["2", "17"]),
            Rule("attended_info_session", "is_yes", type: "Optional"),
        ]));

        foreach (var mode in Enum.GetValues<ValidationMode>())
        {
            var result = Validate(request, mode);
            Assert.True(result.IsValid, $"{mode}: {string.Join("; ", result.Errors.Select(e => e.Key + "=" + e.Value[0]))}");
            Assert.NotNull(result.Content);
        }
    }

    [Fact]
    public void ValuesAreStoredInTheirCanonicalForm()
    {
        var result = ValidateRules(ValidationMode.Draft,
            Rule("age", "between", ["17.0", "23"]),
            Rule("highest_grade", "is_one_of", ["grade_12", "grade_10", "grade_12"]));

        var rules = result.Content!.Groups[0].Rules;
        Assert.Equal(["17", "23"], rules[0].Values);
        Assert.Equal(["grade_10", "grade_12"], rules[1].Values);
    }

    [Fact]
    public void TextIsTrimmed_AndTypesAndLogicAreCaseInsensitive()
    {
        var group = new GroupInput(Guid.NewGuid(), "  Basics  ", "any",
            [new RuleInput(Guid.NewGuid(), "gender", "is", ["female"], "optional", "  Because.  ", true)]);

        var result = Validate(new RuleSetRequest(null, [group], null));

        Assert.True(result.IsValid);
        Assert.Equal("Basics", result.Content!.Groups[0].Name);
        Assert.Equal("Because.", result.Content.Groups[0].Rules[0].Message);
    }

    [Fact]
    public void AnEmptyRuleSet_IsValidAsADraft_ButNotComplete()
    {
        Assert.True(Validate(Request(), ValidationMode.Draft).IsValid);
        Assert.True(Validate(Request(), ValidationMode.Test).IsValid);
        Assert.Equal(["Add at least one active mandatory rule."], ErrorsFor(Validate(Request(), ValidationMode.Complete), "rules"));
    }

    [Fact]
    public void MissingGroupsAndRulesLists_AreTreatedAsEmpty()
    {
        Assert.True(Validate(new RuleSetRequest(null, null, null)).IsValid);
        Assert.True(Validate(new RuleSetRequest(null, [new GroupInput(Guid.NewGuid(), "G", "All", null)], null)).IsValid);
    }

    // ---------- One rule ----------

    [Fact]
    public void AnUnknownOrMissingField_AsksToChooseOne()
    {
        var unknown = Rule("shoe_size", "equals", ["40"]);
        var missing = Rule("", "equals", ["40"]) with { FieldKey = null };

        var result = ValidateRules(ValidationMode.Draft, unknown, missing);

        Assert.Equal(["Choose a field."], ErrorsFor(result, $"rules.{unknown.Id}.field"));
        Assert.Equal(["Choose a field."], ErrorsFor(result, $"rules.{missing.Id}.field"));
    }

    [Fact]
    public void AnUnknownOrMissingOperator_AsksHowToCompare()
    {
        var unknown = Rule("age", "sounds_like", ["40"]);
        var missing = Rule("age", "equals", ["40"]) with { OperatorKey = null };

        var result = ValidateRules(ValidationMode.Draft, unknown, missing);

        Assert.Equal(["Choose how to compare."], ErrorsFor(result, $"rules.{unknown.Id}.operator"));
        Assert.Equal(["Choose how to compare."], ErrorsFor(result, $"rules.{missing.Id}.operator"));
    }

    [Fact]
    public void AnOperatorThatDoesNotFitTheField_IsRejected()
    {
        var rule = Rule("age", "is_one_of", ["17"]);

        var result = ValidateRules(ValidationMode.Draft, rule);

        Assert.Equal(["This comparison does not fit the chosen field."], ErrorsFor(result, $"rules.{rule.Id}.operator"));
        Assert.Empty(ErrorsFor(result, $"rules.{rule.Id}.values"));
    }

    [Theory]
    [InlineData("Mandatory")]
    [InlineData("optional")]
    public void BothTypes_AreAccepted(string type)
    {
        Assert.True(ValidateRules(ValidationMode.Draft, Rule("gender", "is", ["female"], type: type)).IsValid);
    }

    [Theory]
    [InlineData("Required")]
    [InlineData("")]
    [InlineData(null)]
    public void AnUnknownType_IsRejected(string? type)
    {
        var rule = Rule("gender", "is", ["female"]) with { Type = type };

        Assert.Equal(["Choose mandatory or optional."], ErrorsFor(ValidateRules(ValidationMode.Draft, rule), $"rules.{rule.Id}.type"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void EveryRuleNeedsAMessage(string? message)
    {
        var rule = Rule("gender", "is", ["female"], message: message);

        var errors = ErrorsFor(ValidateRules(ValidationMode.Draft, rule), $"rules.{rule.Id}.message");

        Assert.Equal(["Write the reason shown when a candidate fails this rule."], errors);
    }

    [Fact]
    public void AMessageOver200Characters_IsRejected()
    {
        var rule = Rule("gender", "is", ["female"], message: new string('a', 201));

        Assert.Equal(
            ["The message must be 200 characters or fewer."],
            ErrorsFor(ValidateRules(ValidationMode.Draft, rule), $"rules.{rule.Id}.message"));
        Assert.True(ValidateRules(ValidationMode.Draft, Rule("gender", "is", ["female"], message: new string('a', 200))).IsValid);
    }

    // ---------- Values ----------

    [Theory]
    [InlineData("age", "at_least", new string[0], "Enter a value.")]
    [InlineData("age", "between", new[] { "17" }, "Enter both values.")]
    [InlineData("gender", "is_one_of", new string[0], "Choose at least one option.")]
    [InlineData("attended_info_session", "is_yes", new[] { "x" }, "This comparison takes no value.")]
    [InlineData("age", "at_least", new[] { "abc" }, "Enter a number.")]
    [InlineData("age", "at_least", new[] { "17.5" }, "Use a whole number.")]
    [InlineData("family_income", "at_most", new[] { "10.555" }, "Use at most 2 decimal places.")]
    [InlineData("age", "at_least", new[] { "-1" }, "Enter 0 or more.")]
    [InlineData("age", "at_most", new[] { "121" }, "Enter 120 or less.")]
    [InlineData("age", "between", new[] { "23", "17" }, "The first value must be lower than the second.")]
    [InlineData("age", "between", new[] { "17", "" }, "Fill in every value.")]
    [InlineData("gender", "is", new[] { "robot" }, "Choose from the list.")]
    [InlineData("highest_grade", "is_one_of", new[] { "grade_12", "grade_13" }, "Choose from the list.")]
    public void ValueProblems_AreExplainedUnderTheValueInput(string field, string op, string[] values, string expected)
    {
        var rule = Rule(field, op, values);

        var errors = ErrorsFor(ValidateRules(ValidationMode.Draft, rule), $"rules.{rule.Id}.values");

        Assert.Equal([expected], errors);
    }

    // ---------- Provinces ----------

    [Fact]
    public void AProvinceOutsideTheTargets_IsAllowedInADraft_ButBlocksCompleting()
    {
        var rule = Rule("province", "is_one_of", ["2", "21"]); // 21 (Takeo) is not a target

        var draft = ValidateRules(ValidationMode.Draft, rule);
        var complete = ValidateRules(ValidationMode.Complete, rule);

        Assert.True(draft.IsValid);
        Assert.Equal(
            ["Choose only target provinces of this campaign. Change them in Step 1."],
            ErrorsFor(complete, $"rules.{rule.Id}.values"));
    }

    [Fact]
    public void TargetProvinces_AreAcceptedWhenCompleting()
    {
        Assert.True(ValidateRules(ValidationMode.Complete, Rule("province", "is_one_of", ["2", "17"])).IsValid);
    }

    // ---------- Groups ----------

    [Fact]
    public void AGroupNeedsANameUpTo60Characters()
    {
        var unnamed = new GroupInput(Guid.NewGuid(), " ", "All", []);
        var tooLong = new GroupInput(Guid.NewGuid(), new string('a', 61), "All", []);

        var result = Validate(new RuleSetRequest(null, [unnamed, tooLong], null));

        Assert.Equal(["Give the group a name."], ErrorsFor(result, $"groups.{unnamed.Id}.name"));
        Assert.Equal(["Group name must be 60 characters or fewer."], ErrorsFor(result, $"groups.{tooLong.Id}.name"));
    }

    [Theory]
    [InlineData("Sometimes")]
    [InlineData("")]
    [InlineData(null)]
    public void AGroupNeedsAllOrAny(string? logic)
    {
        var group = new GroupInput(Guid.NewGuid(), "G", logic, []);

        var result = Validate(new RuleSetRequest(null, [group], null));

        Assert.Equal(["Choose ALL or ANY."], ErrorsFor(result, $"groups.{group.Id}.logic"));
    }

    [Fact]
    public void TooManyGroupsOrRules_AreRejected()
    {
        var manyGroups = Enumerable.Range(0, 21).Select(_ => Group()).ToList();
        var manyRules = Group(rules: [.. Enumerable.Range(0, 51).Select(i => Rule("age", "at_least", [i.ToString()]))]);

        Assert.Equal(["A campaign can have at most 20 groups."], ErrorsFor(Validate(new RuleSetRequest(null, manyGroups, null)), "groups"));
        Assert.Equal(["A group can have at most 50 rules."], ErrorsFor(Validate(new RuleSetRequest(null, [manyRules], null)), $"groups.{manyRules.Id}.rules"));
    }

    [Fact]
    public void EmptyOrRepeatedIds_AreRejected()
    {
        var sameId = Guid.NewGuid();
        var repeated = Request(null, Group(rules: [Rule("age", "at_least", ["17"], id: sameId), Rule("age", "at_least", ["18"], id: sameId)]));
        var empty = Request(null, new GroupInput(Guid.Empty, "G", "All", []));

        Assert.NotEmpty(ErrorsFor(Validate(repeated), "groups"));
        Assert.NotEmpty(ErrorsFor(Validate(empty), "groups"));
    }

    // ---------- Duplicates and contradictions ----------

    [Fact]
    public void ADuplicateRule_IsFlaggedOnTheLaterCopy()
    {
        var first = Rule("age", "between", ["17", "23"]);
        var second = Rule("age", "between", ["17.0", "23"]); // same after canonicalizing

        var result = ValidateRules(ValidationMode.Draft, first, second);

        Assert.Empty(ErrorsFor(result, $"rules.{first.Id}"));
        Assert.Equal(["The same rule already exists in this group."], ErrorsFor(result, $"rules.{second.Id}"));
    }

    [Fact]
    public void ContradictingRules_AreBlocked_NamingBothOnEachRule()
    {
        var atLeast = Rule("age", "at_least", ["20"]);
        var atMost = Rule("age", "at_most", ["18"]);

        var result = ValidateRules(ValidationMode.Draft, atLeast, atMost);

        const string expected = "These rules can never all be true together: Age at least 20; Age at most 18.";
        Assert.Equal([expected], ErrorsFor(result, $"rules.{atLeast.Id}"));
        Assert.Equal([expected], ErrorsFor(result, $"rules.{atMost.Id}"));
        Assert.Null(result.Content);
    }

    [Fact]
    public void ContradictionMessages_UseProvinceAndOptionNames()
    {
        var one = Rule("province", "is", ["2"]);
        var two = Rule("province", "is", ["17"]);

        var result = ValidateRules(ValidationMode.Complete, one, two);

        Assert.Contains("Province is Battambang; Province is Siem Reap", ErrorsFor(result, $"rules.{one.Id}")[0]);
    }

    [Fact]
    public void Contradictions_AreNotCheckedInATest()
    {
        var result = ValidateRules(ValidationMode.Test, Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"]));

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Duplicates_AreNotCheckedInATest()
    {
        Assert.True(ValidateRules(ValidationMode.Test, Rule("age", "at_least", ["20"]), Rule("age", "at_least", ["20"])).IsValid);
    }

    [Fact]
    public void RulesInAnAnyGroup_MayDisagree()
    {
        var request = Request(new DateOnly(2026, 11, 2), Group("Any", rules: [Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"])]));

        Assert.True(Validate(request).IsValid);
    }

    // ---------- Completing ----------

    [Fact]
    public void Completing_NeedsAnActiveMandatoryRule()
    {
        Assert.Equal(
            ["Add at least one active mandatory rule."],
            ErrorsFor(ValidateRules(ValidationMode.Complete, Rule("gender", "is", ["female"], type: "Optional")), "rules"));
        Assert.Equal(
            ["Add at least one active mandatory rule."],
            ErrorsFor(ValidateRules(ValidationMode.Complete, Rule("gender", "is", ["female"], active: false)), "rules"));
        Assert.True(ValidateRules(ValidationMode.Complete, Rule("gender", "is", ["female"])).IsValid);
    }

    [Fact]
    public void Completing_WithAnActiveAgeRule_NeedsTheReferenceDate()
    {
        var request = Request(null, Group(rules: Rule("age", "at_least", ["17"])));

        Assert.Equal(["Choose the date ages are calculated on."], ErrorsFor(Validate(request, ValidationMode.Complete), "ageReferenceDate"));
        Assert.True(Validate(request, ValidationMode.Draft).IsValid);
    }

    [Fact]
    public void Completing_WithAnInactiveAgeRule_DoesNotNeedTheReferenceDate()
    {
        var request = Request(null, Group(rules:
        [
            Rule("age", "at_least", ["17"], active: false),
            Rule("gender", "is", ["female"]),
        ]));

        Assert.True(Validate(request, ValidationMode.Complete).IsValid);
    }

    [Fact]
    public void Completing_ReportsEveryProblemAtOnce()
    {
        var a = Rule("age", "at_least", ["abc"]);
        var b = Rule("gender", "is", ["female"], message: "");
        var c = Rule("gender", "is", ["female"], type: "Optional");

        var result = ValidateRules(ValidationMode.Complete, a, b, c);

        Assert.NotEmpty(ErrorsFor(result, $"rules.{a.Id}.values"));
        Assert.NotEmpty(ErrorsFor(result, $"rules.{b.Id}.message"));
        Assert.NotEmpty(ErrorsFor(result, "rules"));
    }
}
