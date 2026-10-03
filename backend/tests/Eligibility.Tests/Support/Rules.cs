using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;

namespace Eligibility.Tests.Support;

/// <summary>Short builders so tests read as the rule they describe.</summary>
public static class R
{
    public static RuleContent Rule(
        string field,
        string op,
        params string[] values) =>
        new(Guid.NewGuid(), field, op, values, RuleType.Mandatory, $"{field} {op} {string.Join(",", values)}", true);

    public static RuleContent Optional(string field, string op, params string[] values) =>
        Rule(field, op, values) with { Type = RuleType.Optional };

    public static RuleContent Inactive(this RuleContent rule) => rule with { IsActive = false };

    public static GroupContent All(params RuleContent[] rules) => new(Guid.NewGuid(), "Group", GroupLogic.All, rules);

    public static GroupContent Any(params RuleContent[] rules) => new(Guid.NewGuid(), "Group", GroupLogic.Any, rules);

    public static RuleSetContent Set(params GroupContent[] groups) => new(new DateOnly(2026, 11, 2), groups);

    public static RuleSet Persisted(RuleSetContent content, Guid? campaignId = null)
    {
        var set = Domain.Rules.RuleSet.Create(campaignId ?? Guid.NewGuid(), DateTimeOffset.UnixEpoch);
        set.Apply(content, DateTimeOffset.UnixEpoch, "user", "User");
        return set;
    }

    public static readonly FieldCatalogue Catalogue = LaunchCatalogue.Create();
}
