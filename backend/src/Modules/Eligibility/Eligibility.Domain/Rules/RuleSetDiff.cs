using System.Text.Json;

namespace Eligibility.Domain.Rules;

public enum AuditEntity
{
    RuleSet,
    Group,
    Rule,
}

public enum AuditAction
{
    Added,
    Updated,
    Deleted,

    /// <summary>A rule was only switched on or off.</summary>
    Toggled,

    /// <summary>A rule or group only changed place (or a rule moved to another group).</summary>
    Reordered,
}

/// <summary>One thing that changed, with the before and after as JSON for the audit log.</summary>
public sealed record AuditChange(AuditEntity Entity, Guid EntityId, AuditAction Action, string? BeforeJson, string? AfterJson);

/// <summary>
/// Compares two versions of a rule set and lists what changed: rules and groups added,
/// removed, edited, switched on or off, or moved. Deleting one rule does not make the rules
/// below it count as "reordered": only the relative order of the survivors is compared.
/// </summary>
public static class RuleSetDiff
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<AuditChange> Compare(Guid campaignId, RuleSetContent before, RuleSetContent after)
    {
        var changes = new List<AuditChange>();

        if (before.AgeReferenceDate != after.AgeReferenceDate)
        {
            changes.Add(new AuditChange(
                AuditEntity.RuleSet, campaignId, AuditAction.Updated,
                Serialize(new { ageReferenceDate = before.AgeReferenceDate }),
                Serialize(new { ageReferenceDate = after.AgeReferenceDate })));
        }

        CompareGroups(before, after, changes);
        CompareRules(before, after, changes);
        return changes;
    }

    private static void CompareGroups(RuleSetContent before, RuleSetContent after, List<AuditChange> changes)
    {
        var beforeById = before.Groups.ToDictionary(g => g.Id);
        var afterById = after.Groups.ToDictionary(g => g.Id);

        foreach (var group in after.Groups.Where(g => !beforeById.ContainsKey(g.Id)))
        {
            changes.Add(new AuditChange(AuditEntity.Group, group.Id, AuditAction.Added, null, Header(group)));
        }

        foreach (var group in before.Groups.Where(g => !afterById.ContainsKey(g.Id)))
        {
            changes.Add(new AuditChange(AuditEntity.Group, group.Id, AuditAction.Deleted, Header(group), null));
        }

        var rankBefore = Ranks(before.Groups.Select(g => g.Id), afterById.ContainsKey);
        var rankAfter = Ranks(after.Groups.Select(g => g.Id), beforeById.ContainsKey);

        foreach (var group in after.Groups.Where(g => beforeById.ContainsKey(g.Id)))
        {
            var old = beforeById[group.Id];
            if (old.Name != group.Name || old.Logic != group.Logic)
            {
                changes.Add(new AuditChange(AuditEntity.Group, group.Id, AuditAction.Updated, Header(old), Header(group)));
            }
            else if (rankBefore[group.Id] != rankAfter[group.Id])
            {
                changes.Add(new AuditChange(AuditEntity.Group, group.Id, AuditAction.Reordered, Header(old), Header(group)));
            }
        }
    }

    private static void CompareRules(RuleSetContent before, RuleSetContent after, List<AuditChange> changes)
    {
        var beforeRules = Locate(before);
        var afterRules = Locate(after);

        foreach (var (id, now) in afterRules.Where(r => !beforeRules.ContainsKey(r.Key)))
        {
            changes.Add(new AuditChange(AuditEntity.Rule, id, AuditAction.Added, null, Serialize(now.Rule)));
        }

        foreach (var (id, was) in beforeRules.Where(r => !afterRules.ContainsKey(r.Key)))
        {
            changes.Add(new AuditChange(AuditEntity.Rule, id, AuditAction.Deleted, Serialize(was.Rule), null));
        }

        foreach (var (id, now) in afterRules.Where(r => beforeRules.ContainsKey(r.Key)))
        {
            var was = beforeRules[id];
            var action = ClassifyRuleChange(was, now, beforeRules, afterRules);
            if (action is { } a)
            {
                changes.Add(new AuditChange(AuditEntity.Rule, id, a, Serialize(was.Rule), Serialize(now.Rule)));
            }
        }
    }

    private static AuditAction? ClassifyRuleChange(
        (Guid GroupId, int Index, RuleContent Rule) wasAt,
        (Guid GroupId, int Index, RuleContent Rule) nowAt,
        Dictionary<Guid, (Guid GroupId, int Index, RuleContent Rule)> allBefore,
        Dictionary<Guid, (Guid GroupId, int Index, RuleContent Rule)> allAfter)
    {
        var was = wasAt.Rule;
        var now = nowAt.Rule;
        var contentChanged = was.FieldKey != now.FieldKey
                             || was.OperatorKey != now.OperatorKey
                             || !was.Values.SequenceEqual(now.Values)
                             || was.Type != now.Type
                             || was.Message != now.Message;
        if (contentChanged)
        {
            return AuditAction.Updated;
        }

        if (was.IsActive != now.IsActive)
        {
            return AuditAction.Toggled;
        }

        if (wasAt.GroupId != nowAt.GroupId)
        {
            return AuditAction.Reordered;
        }

        // Same group: compare place among the siblings that are in both versions.
        var siblingsBefore = allBefore.Values.Where(r => r.GroupId == wasAt.GroupId && allAfter.ContainsKey(r.Rule.Id) && allAfter[r.Rule.Id].GroupId == wasAt.GroupId)
            .OrderBy(r => r.Index).Select(r => r.Rule.Id).ToList();
        var siblingsAfter = allAfter.Values.Where(r => r.GroupId == nowAt.GroupId && allBefore.ContainsKey(r.Rule.Id) && allBefore[r.Rule.Id].GroupId == nowAt.GroupId)
            .OrderBy(r => r.Index).Select(r => r.Rule.Id).ToList();

        return siblingsBefore.IndexOf(was.Id) != siblingsAfter.IndexOf(now.Id) ? AuditAction.Reordered : null;
    }

    private static Dictionary<Guid, (Guid GroupId, int Index, RuleContent Rule)> Locate(RuleSetContent content)
    {
        var map = new Dictionary<Guid, (Guid, int, RuleContent)>();
        foreach (var group in content.Groups)
        {
            for (var i = 0; i < group.Rules.Count; i++)
            {
                map[group.Rules[i].Id] = (group.Id, i, group.Rules[i]);
            }
        }

        return map;
    }

    /// <summary>Position of each id among only those ids that also exist in the other version.</summary>
    private static Dictionary<Guid, int> Ranks(IEnumerable<Guid> ids, Func<Guid, bool> existsInOther)
    {
        var rank = 0;
        return ids.Where(existsInOther).ToDictionary(id => id, _ => rank++);
    }

    private static string Header(GroupContent group) => Serialize(new { name = group.Name, logic = group.Logic.ToString() });

    private static string Serialize(object value) => JsonSerializer.Serialize(value, Json);
}
