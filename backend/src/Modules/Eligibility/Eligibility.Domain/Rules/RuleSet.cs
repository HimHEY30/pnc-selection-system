namespace Eligibility.Domain.Rules;

/// <summary>Mandatory: the candidate must pass. Optional: a failure is only a warning. Stored as a smallint.</summary>
public enum RuleType : short
{
    Mandatory = 1,
    Optional = 2,
}

/// <summary>How the rules inside one group combine. Stored as a smallint.</summary>
public enum GroupLogic : short
{
    /// <summary>Every mandatory rule in the group must pass.</summary>
    All = 1,

    /// <summary>At least one mandatory rule in the group must pass.</summary>
    Any = 2,
}

/// <summary>A rule as the user edits it, without any persistence concerns.</summary>
public sealed record RuleContent(
    Guid Id,
    string FieldKey,
    string OperatorKey,
    IReadOnlyList<string> Values,
    RuleType Type,
    string Message,
    bool IsActive);

public sealed record GroupContent(Guid Id, string Name, GroupLogic Logic, IReadOnlyList<RuleContent> Rules);

/// <summary>The whole editable rule set. Order in the lists is the display order.</summary>
public sealed record RuleSetContent(DateOnly? AgeReferenceDate, IReadOnlyList<GroupContent> Groups)
{
    public static readonly RuleSetContent Empty = new(null, []);

    public IEnumerable<RuleContent> AllRules => Groups.SelectMany(g => g.Rules);
}

/// <summary>One check: "field operator value", with a type and a message for when it fails.</summary>
public sealed class Rule
{
    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string FieldKey { get; private set; } = string.Empty;
    public string OperatorKey { get; private set; } = string.Empty;
    public string[] Values { get; private set; } = [];
    public RuleType Type { get; private set; }
    public string Message { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }
    public int Position { get; private set; }

    private Rule() { }

    internal Rule(Guid groupId, RuleContent content, int position)
    {
        Id = content.Id;
        GroupId = groupId;
        Update(content, position);
    }

    internal void Update(RuleContent content, int position)
    {
        FieldKey = content.FieldKey;
        OperatorKey = content.OperatorKey;
        Values = [.. content.Values];
        Type = content.Type;
        Message = content.Message;
        IsActive = content.IsActive;
        Position = position;
    }

    internal void MoveTo(Guid groupId) => GroupId = groupId;

    internal RuleContent ToContent() => new(Id, FieldKey, OperatorKey, Values, Type, Message, IsActive);
}

/// <summary>A set of rules combined with ALL or ANY. Groups themselves always combine with ALL.</summary>
public sealed class RuleGroup
{
    private readonly List<Rule> _rules = [];

    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public GroupLogic Logic { get; private set; }
    public int Position { get; private set; }

    public IReadOnlyList<Rule> Rules => _rules;

    private RuleGroup() { }

    internal RuleGroup(Guid campaignId, GroupContent content, int position)
    {
        Id = content.Id;
        CampaignId = campaignId;
        Update(content, position);
    }

    internal void Update(GroupContent content, int position)
    {
        Name = content.Name;
        Logic = content.Logic;
        Position = position;
    }

    internal void AddRule(Rule rule) => _rules.Add(rule);
    internal bool RemoveRule(Rule rule) => _rules.Remove(rule);

    internal GroupContent ToContent() =>
        new(Id, Name, Logic, _rules.OrderBy(r => r.Position).Select(r => r.ToContent()).ToList());
}

/// <summary>
/// All the eligibility rules of one campaign. There is exactly one per campaign, so its
/// key is the campaign id. Changes go through <see cref="Apply"/>, which replaces the
/// content as a whole while keeping the ids of rules and groups that continue to exist
/// (the audit log and the test panel refer to them).
/// </summary>
public sealed class RuleSet
{
    private readonly List<RuleGroup> _groups = [];

    public Guid CampaignId { get; private set; }

    /// <summary>The day ages are calculated on. Required once an age rule is active.</summary>
    public DateOnly? AgeReferenceDate { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }
    public string? UpdatedById { get; private set; }
    public string? UpdatedByName { get; private set; }

    /// <summary>PostgreSQL xmin: detects two people saving the same rule set at once.</summary>
    public uint Version { get; private set; }

    public IReadOnlyList<RuleGroup> Groups => _groups;

    private RuleSet() { }

    public static RuleSet Create(Guid campaignId, DateTimeOffset now) =>
        new() { CampaignId = campaignId, UpdatedAt = now };

    /// <summary>The current content in display order, as a plain value.</summary>
    public RuleSetContent ToContent() =>
        new(AgeReferenceDate, _groups.OrderBy(g => g.Position).Select(g => g.ToContent()).ToList());

    /// <summary>Replaces the content, reusing groups and rules whose ids are unchanged.</summary>
    public void Apply(RuleSetContent content, DateTimeOffset now, string? byId, string? byName)
    {
        AgeReferenceDate = content.AgeReferenceDate;

        // Where every current rule lives now, so a rule can be found, moved or dropped.
        var current = _groups
            .SelectMany(g => g.Rules.Select(r => (Rule: r, Group: g)))
            .ToDictionary(x => x.Rule.Id);
        var wantedGroups = content.Groups.Select(g => g.Id).ToHashSet();
        var wantedRules = content.AllRules.Select(r => r.Id).ToHashSet();

        foreach (var dropped in current.Values.Where(x => !wantedRules.Contains(x.Rule.Id)))
        {
            dropped.Group.RemoveRule(dropped.Rule);
        }

        _groups.RemoveAll(g => !wantedGroups.Contains(g.Id));

        for (var groupIndex = 0; groupIndex < content.Groups.Count; groupIndex++)
        {
            var groupContent = content.Groups[groupIndex];
            var group = _groups.SingleOrDefault(g => g.Id == groupContent.Id);
            if (group is null)
            {
                group = new RuleGroup(CampaignId, groupContent, groupIndex);
                _groups.Add(group);
            }
            else
            {
                group.Update(groupContent, groupIndex);
            }

            for (var ruleIndex = 0; ruleIndex < groupContent.Rules.Count; ruleIndex++)
            {
                var ruleContent = groupContent.Rules[ruleIndex];
                if (!current.TryGetValue(ruleContent.Id, out var existing))
                {
                    group.AddRule(new Rule(group.Id, ruleContent, ruleIndex));
                    continue;
                }

                if (existing.Group.Id != group.Id)
                {
                    // Moved to another group: take it out of the old list first, so it is
                    // never in two groups, and not deleted along with the old group.
                    existing.Group.RemoveRule(existing.Rule);
                    group.AddRule(existing.Rule);
                    existing.Rule.MoveTo(group.Id);
                }

                existing.Rule.Update(ruleContent, ruleIndex);
            }
        }

        UpdatedAt = now;
        UpdatedById = byId;
        UpdatedByName = byName;
    }
}
