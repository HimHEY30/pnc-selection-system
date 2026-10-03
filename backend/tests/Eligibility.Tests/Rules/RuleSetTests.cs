using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Rules;

public sealed class RuleSetTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 3, 9, 12, 0, TimeSpan.Zero);

    private static RuleSet NewSet() => RuleSet.Create(Guid.NewGuid(), Now);

    [Fact]
    public void ANewRuleSet_IsEmpty()
    {
        var set = NewSet();

        Assert.Empty(set.Groups);
        Assert.Null(set.AgeReferenceDate);
        Assert.Equal(RuleSetContent.Empty.Groups, set.ToContent().Groups);
    }

    [Fact]
    public void Apply_StoresGroupsAndRulesInOrder_AndReadsThemBack()
    {
        var content = R.Set(
            R.All(R.Rule("age", "between", "17", "23"), R.Rule("gender", "is", "female")),
            R.Any(R.Rule("province", "is", "17")));
        var set = NewSet();

        set.Apply(content, Now, "u1", "Sreyneang Chea");

        var read = set.ToContent();
        Assert.Equal(content.AgeReferenceDate, read.AgeReferenceDate);
        Assert.Equal(content.Groups.Select(g => g.Id), read.Groups.Select(g => g.Id));
        Assert.Equal(content.Groups[0].Rules.Select(r => r.Id), read.Groups[0].Rules.Select(r => r.Id));
        Assert.Equal(["17", "23"], read.Groups[0].Rules[0].Values);
        Assert.Equal(GroupLogic.Any, read.Groups[1].Logic);
    }

    [Fact]
    public void Apply_RecordsWhoChangedItAndWhen()
    {
        var set = NewSet();

        set.Apply(R.Set(R.All(R.Rule("age", "at_least", "17"))), Now.AddHours(1), "u1", "Sreyneang Chea");

        Assert.Equal("u1", set.UpdatedById);
        Assert.Equal("Sreyneang Chea", set.UpdatedByName);
        Assert.Equal(Now.AddHours(1), set.UpdatedAt);
    }

    [Fact]
    public void Apply_KeepsTheSameInstancesForRulesThatContinue()
    {
        var rule = R.Rule("age", "at_least", "17");
        var group = R.All(rule);
        var set = NewSet();
        set.Apply(R.Set(group), Now, null, null);
        var before = set.Groups[0].Rules[0];

        set.Apply(R.Set(group with { Rules = [rule with { Message = "New text" }] }), Now, null, null);

        Assert.Same(before, set.Groups[0].Rules[0]);
        Assert.Equal("New text", before.Message);
    }

    [Fact]
    public void Apply_RemovesRulesAndGroupsThatAreNoLongerThere()
    {
        var keep = R.Rule("age", "at_least", "17");
        var drop = R.Rule("gender", "is", "female");
        var keepGroup = R.All(keep, drop);
        var dropGroup = R.Any(R.Rule("province", "is", "17"));
        var set = NewSet();
        set.Apply(R.Set(keepGroup, dropGroup), Now, null, null);

        set.Apply(R.Set(keepGroup with { Rules = [keep] }), Now, null, null);

        var read = set.ToContent();
        Assert.Single(read.Groups);
        Assert.Equal([keep.Id], read.Groups[0].Rules.Select(r => r.Id));
    }

    [Fact]
    public void Apply_CanReorderRulesAndGroups()
    {
        var a = R.Rule("age", "at_least", "17");
        var b = R.Rule("gender", "is", "female");
        var first = R.All(a, b);
        var second = R.All(R.Rule("province", "is", "17"));
        var set = NewSet();
        set.Apply(R.Set(first, second), Now, null, null);

        set.Apply(R.Set(second, first with { Rules = [b, a] }), Now, null, null);

        var read = set.ToContent();
        Assert.Equal([second.Id, first.Id], read.Groups.Select(g => g.Id));
        Assert.Equal([b.Id, a.Id], read.Groups[1].Rules.Select(r => r.Id));
    }

    [Fact]
    public void Apply_CanMoveARuleToAnotherGroup_WithoutLosingIt()
    {
        var moving = R.Rule("age", "at_least", "17");
        var source = R.All(moving, R.Rule("gender", "is", "female"));
        var target = R.Any(R.Rule("province", "is", "17"));
        var set = NewSet();
        set.Apply(R.Set(source, target), Now, null, null);
        var instance = set.Groups[0].Rules.Single(r => r.Id == moving.Id);

        set.Apply(R.Set(source with { Rules = [source.Rules[1]] }, target with { Rules = [.. target.Rules, moving] }), Now, null, null);

        var read = set.ToContent();
        Assert.DoesNotContain(read.Groups[0].Rules, r => r.Id == moving.Id);
        Assert.Contains(read.Groups[1].Rules, r => r.Id == moving.Id);
        Assert.Same(instance, set.Groups.Single(g => g.Id == target.Id).Rules.Single(r => r.Id == moving.Id));
        Assert.Equal(target.Id, instance.GroupId);
    }

    [Fact]
    public void Apply_CanMoveARuleOutOfAGroupThatIsBeingRemoved()
    {
        var moving = R.Rule("age", "at_least", "17");
        var doomed = R.All(moving);
        var survivor = R.All(R.Rule("gender", "is", "female"));
        var set = NewSet();
        set.Apply(R.Set(doomed, survivor), Now, null, null);

        set.Apply(R.Set(survivor with { Rules = [.. survivor.Rules, moving] }), Now, null, null);

        var read = set.ToContent();
        Assert.Single(read.Groups);
        Assert.Contains(read.Groups[0].Rules, r => r.Id == moving.Id);
    }

    [Fact]
    public void Apply_UpdatesTheReferenceDate()
    {
        var set = NewSet();

        set.Apply(new RuleSetContent(new DateOnly(2027, 1, 1), []), Now, null, null);

        Assert.Equal(new DateOnly(2027, 1, 1), set.AgeReferenceDate);
    }

    [Fact]
    public void AllRules_ListsEveryRuleAcrossGroups()
    {
        var content = R.Set(R.All(R.Rule("age", "at_least", "17")), R.Any(R.Rule("gender", "is", "female"), R.Rule("province", "is", "2")));

        Assert.Equal(3, content.AllRules.Count());
    }

    // ---------- Canonical values ----------

    [Theory]
    [InlineData("17.0", "17")]
    [InlineData("17", "17")]
    [InlineData("250.50", "250.5")]
    [InlineData("250.75", "250.75")]
    public void Numbers_GetOneSpelling(string typed, string expected)
    {
        var field = R.Catalogue.FindField("family_income")!;
        var op = R.Catalogue.FindOperator("equals")!;
        var parsed = RuleValueParser.Parse(field, op, [typed]).Value!;

        Assert.Equal([expected], RuleValueCanonicalizer.Canonicalize(field, op, parsed));
    }

    [Fact]
    public void ListValues_AreSortedAndDeduplicated()
    {
        var field = R.Catalogue.FindField("highest_grade")!;
        var op = R.Catalogue.FindOperator("is_one_of")!;
        var parsed = RuleValueParser.Parse(field, op, ["grade_12", "grade_10", "grade_12"]).Value!;

        Assert.Equal(["grade_10", "grade_12"], RuleValueCanonicalizer.Canonicalize(field, op, parsed));
    }

    [Fact]
    public void YesNoRules_HaveNoValues()
    {
        var field = R.Catalogue.FindField("attended_info_session")!;
        var op = R.Catalogue.FindOperator("is_yes")!;

        Assert.Empty(RuleValueCanonicalizer.Canonicalize(field, op, ParsedValue.Empty));
    }
}
