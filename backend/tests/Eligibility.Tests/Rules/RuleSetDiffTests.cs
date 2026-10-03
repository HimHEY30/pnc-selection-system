using System.Text.Json;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Rules;

public sealed class RuleSetDiffTests
{
    private static readonly Guid Campaign = Guid.NewGuid();

    private static IReadOnlyList<AuditChange> Diff(RuleSetContent before, RuleSetContent after) =>
        RuleSetDiff.Compare(Campaign, before, after);

    private static (AuditEntity, AuditAction)[] Kinds(IEnumerable<AuditChange> changes) =>
        changes.Select(c => (c.Entity, c.Action)).ToArray();

    [Fact]
    public void NoChange_ListsNothing()
    {
        var set = R.Set(R.All(R.Rule("age", "at_least", "17"), R.Rule("gender", "is", "female")));

        Assert.Empty(Diff(set, set));
    }

    // ---------- Rules ----------

    [Fact]
    public void ANewRule_IsAdded_WithAnAfterAndNoBefore()
    {
        var group = R.All(R.Rule("age", "at_least", "17"));
        var added = R.Rule("gender", "is", "female");

        var change = Assert.Single(Diff(R.Set(group), R.Set(group with { Rules = [.. group.Rules, added] })));

        Assert.Equal((AuditEntity.Rule, AuditAction.Added), (change.Entity, change.Action));
        Assert.Equal(added.Id, change.EntityId);
        Assert.Null(change.BeforeJson);
        Assert.Contains("gender", change.AfterJson);
    }

    [Fact]
    public void ARemovedRule_IsDeleted_WithABeforeAndNoAfter()
    {
        var keep = R.Rule("age", "at_least", "17");
        var drop = R.Rule("gender", "is", "female");
        var group = R.All(keep, drop);

        var change = Assert.Single(Diff(R.Set(group), R.Set(group with { Rules = [keep] })));

        Assert.Equal((AuditEntity.Rule, AuditAction.Deleted), (change.Entity, change.Action));
        Assert.Equal(drop.Id, change.EntityId);
        Assert.Contains("female", change.BeforeJson);
        Assert.Null(change.AfterJson);
    }

    [Fact]
    public void DeletingARule_DoesNotMakeTheOnesBelowItCountAsReordered()
    {
        var a = R.Rule("age", "at_least", "17");
        var b = R.Rule("gender", "is", "female");
        var c = R.Rule("province", "is", "17");
        var group = R.All(a, b, c);

        var changes = Diff(R.Set(group), R.Set(group with { Rules = [a, c] }));

        Assert.Equal([(AuditEntity.Rule, AuditAction.Deleted)], Kinds(changes));
    }

    [Theory]
    [InlineData("message")]
    [InlineData("values")]
    [InlineData("operator")]
    [InlineData("type")]
    public void EditingARule_IsAnUpdate_WithBothVersions(string what)
    {
        var rule = R.Rule("age", "at_least", "17");
        var edited = what switch
        {
            "message" => rule with { Message = "Something else." },
            "values" => rule with { Values = ["18"] },
            "operator" => rule with { OperatorKey = "greater_than" },
            _ => rule with { Type = RuleType.Optional },
        };

        var group = R.All(rule);

        var change = Assert.Single(Diff(R.Set(group), R.Set(group with { Rules = [edited] })));

        Assert.Equal(AuditAction.Updated, change.Action);
        Assert.NotNull(change.BeforeJson);
        Assert.NotNull(change.AfterJson);
        Assert.NotEqual(change.BeforeJson, change.AfterJson);
    }

    [Fact]
    public void SwitchingARuleOffAndOn_IsAToggle_NotAnUpdate()
    {
        var rule = R.Rule("age", "at_least", "17");
        var group = R.All(rule);

        var off = Assert.Single(Diff(R.Set(group), R.Set(group with { Rules = [rule.Inactive()] })));
        var on = Assert.Single(Diff(R.Set(group with { Rules = [rule.Inactive()] }), R.Set(group)));

        Assert.Equal(AuditAction.Toggled, off.Action);
        Assert.Equal(AuditAction.Toggled, on.Action);
    }

    [Fact]
    public void ToggleAndEditTogether_IsAnUpdate()
    {
        var rule = R.Rule("age", "at_least", "17");
        var group = R.All(rule);

        var change = Assert.Single(Diff(R.Set(group), R.Set(group with { Rules = [rule.Inactive() with { Message = "New" }] })));

        Assert.Equal(AuditAction.Updated, change.Action);
    }

    [Fact]
    public void SwappingTwoRules_IsReportedForBoth()
    {
        var a = R.Rule("age", "at_least", "17");
        var b = R.Rule("gender", "is", "female");
        var group = R.All(a, b);

        var changes = Diff(R.Set(group), R.Set(group with { Rules = [b, a] }));

        Assert.Equal(2, changes.Count);
        Assert.All(changes, c => Assert.Equal(AuditAction.Reordered, c.Action));
        Assert.Equal(new[] { a.Id, b.Id }.Order(), changes.Select(c => c.EntityId).Order());
    }

    [Fact]
    public void MovingARuleToAnotherGroup_IsReordered()
    {
        var moving = R.Rule("age", "at_least", "17");
        var source = R.All(moving, R.Rule("gender", "is", "female"));
        var target = R.Any(R.Rule("province", "is", "17"));

        var changes = Diff(
            R.Set(source, target),
            R.Set(source with { Rules = [source.Rules[1]] }, target with { Rules = [.. target.Rules, moving] }));

        var change = Assert.Single(changes);
        Assert.Equal(moving.Id, change.EntityId);
        Assert.Equal(AuditAction.Reordered, change.Action);
    }

    // ---------- Groups ----------

    [Fact]
    public void ANewGroup_IsAdded_AndItsRulesAreAddedToo()
    {
        var existing = R.All(R.Rule("age", "at_least", "17"));
        var added = R.Any(R.Rule("gender", "is", "female"));

        var changes = Diff(R.Set(existing), R.Set(existing, added));

        Assert.Equal(
            [(AuditEntity.Group, AuditAction.Added), (AuditEntity.Rule, AuditAction.Added)],
            Kinds(changes));
    }

    [Fact]
    public void ARemovedGroup_IsDeleted_AndItsRulesAreDeletedToo()
    {
        var keep = R.All(R.Rule("age", "at_least", "17"));
        var drop = R.Any(R.Rule("gender", "is", "female"));

        var changes = Diff(R.Set(keep, drop), R.Set(keep));

        Assert.Equal(
            [(AuditEntity.Group, AuditAction.Deleted), (AuditEntity.Rule, AuditAction.Deleted)],
            Kinds(changes));
    }

    [Fact]
    public void RenamingAGroup_OrChangingItsLogic_IsAnUpdate()
    {
        var group = R.All(R.Rule("age", "at_least", "17"));

        var renamed = Assert.Single(Diff(R.Set(group), R.Set(group with { Name = "Other name" })));
        var logic = Assert.Single(Diff(R.Set(group), R.Set(group with { Logic = GroupLogic.Any })));

        Assert.Equal((AuditEntity.Group, AuditAction.Updated), (renamed.Entity, renamed.Action));
        Assert.Contains("Other name", renamed.AfterJson);
        Assert.Contains("Any", logic.AfterJson);
    }

    [Fact]
    public void ReorderingGroups_IsReportedForBothGroups()
    {
        var first = R.All(R.Rule("age", "at_least", "17"));
        var second = R.All(R.Rule("gender", "is", "female"));

        var changes = Diff(R.Set(first, second), R.Set(second, first));

        Assert.Equal(2, changes.Count(c => c.Entity == AuditEntity.Group && c.Action == AuditAction.Reordered));
    }

    // ---------- Reference date ----------

    [Fact]
    public void ChangingTheAgeReferenceDate_IsARuleSetUpdate()
    {
        var group = R.All(R.Rule("age", "at_least", "17"));
        var before = new RuleSetContent(new DateOnly(2026, 11, 2), [group]);
        var after = new RuleSetContent(new DateOnly(2027, 1, 1), [group]);

        var change = Assert.Single(Diff(before, after));

        Assert.Equal((AuditEntity.RuleSet, AuditAction.Updated), (change.Entity, change.Action));
        Assert.Equal(Campaign, change.EntityId);
        Assert.Contains("2026-11-02", change.BeforeJson);
        Assert.Contains("2027-01-01", change.AfterJson);
    }

    [Fact]
    public void AuditJson_IsValidJson()
    {
        var rule = R.Rule("age", "between", "17", "23");

        var change = Assert.Single(Diff(R.Set(), R.Set(R.All(rule))), c => c.Entity == AuditEntity.Rule);

        using var document = JsonDocument.Parse(change.AfterJson!);
        Assert.Equal("age", document.RootElement.GetProperty("fieldKey").GetString());
        Assert.Equal(2, document.RootElement.GetProperty("values").GetArrayLength());
    }
}
