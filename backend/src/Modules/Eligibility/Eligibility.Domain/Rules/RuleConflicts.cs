using Eligibility.Domain.Catalogue;

namespace Eligibility.Domain.Rules;

/// <summary>Rules that can never all be true together, e.g. "age at least 20" and "age at most 18".</summary>
public sealed record Contradiction(string FieldKey, IReadOnlyList<Guid> RuleIds);

/// <summary>The same check written twice in one group. <see cref="RuleIds"/> lists them, first one first.</summary>
public sealed record Duplicate(Guid GroupId, IReadOnlyList<Guid> RuleIds);

/// <summary>
/// Finds rule sets that are broken in a way each rule on its own would not show.
/// </summary>
public static class RuleConflicts
{
    /// <summary>
    /// Finds contradictions among the rules that must ALL be true: every active mandatory rule
    /// in an ALL group, across all ALL groups (groups combine with ALL, so rules in different
    /// ALL groups are as good as in one). ANY groups are not checked, since one failing rule
    /// there is allowed. Each contradiction is cut down to the smallest set of rules that
    /// still cannot all be true, so the message can name just those.
    /// </summary>
    public static IReadOnlyList<Contradiction> FindContradictions(RuleSetContent ruleSet, FieldCatalogue catalogue)
    {
        var checkable = new List<(RuleContent Rule, FieldDefinition Field, OperatorDefinition Op, ParsedValue Value)>();
        foreach (var group in ruleSet.Groups.Where(g => g.Logic == GroupLogic.All))
        {
            foreach (var rule in group.Rules.Where(r => r.IsActive && r.Type == RuleType.Mandatory))
            {
                var field = catalogue.FindField(rule.FieldKey);
                var op = catalogue.FindOperator(rule.OperatorKey);
                if (field is null || op is null || !catalogue.IsAllowed(field, op))
                {
                    continue;
                }

                var parsed = RuleValueParser.Parse(field, op, rule.Values);
                if (parsed.IsValid)
                {
                    checkable.Add((rule, field, op, parsed.Value!));
                }
            }
        }

        var found = new List<Contradiction>();
        foreach (var byField in checkable.GroupBy(c => c.Field.Key))
        {
            var rules = byField.ToList();
            if (IsSatisfiable(rules))
            {
                continue;
            }

            // Drop every rule that is not needed for the conflict, one at a time.
            for (var i = rules.Count - 1; i >= 0; i--)
            {
                var without = rules.Where((_, index) => index != i).ToList();
                if (!IsSatisfiable(without))
                {
                    rules = without;
                }
            }

            found.Add(new Contradiction(byField.Key, rules.Select(r => r.Rule.Id).ToList()));
        }

        return found;
    }

    /// <summary>Finds identical rules (same field, operator and values) inside the same group.</summary>
    public static IReadOnlyList<Duplicate> FindDuplicates(RuleSetContent ruleSet)
    {
        var found = new List<Duplicate>();
        foreach (var group in ruleSet.Groups)
        {
            foreach (var same in group.Rules
                         .GroupBy(r => $"{r.FieldKey}|{r.OperatorKey}|{string.Join("\u001f", r.Values)}")
                         .Where(g => g.Count() > 1))
            {
                found.Add(new Duplicate(group.Id, same.Select(r => r.Id).ToList()));
            }
        }

        return found;
    }

    private static bool IsSatisfiable(
        IReadOnlyList<(RuleContent Rule, FieldDefinition Field, OperatorDefinition Op, ParsedValue Value)> rules)
    {
        var field = rules[0].Field;
        return field.ValueType switch
        {
            FieldValueType.Number or FieldValueType.Date => RangeIsSatisfiable(field, rules),
            FieldValueType.Choice => ChoicesAreSatisfiable(rules),
            FieldValueType.YesNo => !(rules.Any(r => r.Op.Key == OperatorKeys.IsYes) && rules.Any(r => r.Op.Key == OperatorKeys.IsNo)),
            _ => true,
        };
    }

    /// <summary>
    /// Works out the lowest and highest value that satisfies every rule, then checks the two
    /// do not cross. "Greater than 17" is turned into "at least 17 plus one step", where a step is
    /// the smallest difference the field can hold (1 for ages and dates, 0.01 for money), so
    /// "age greater than 17 and less than 18" is correctly found to leave no whole age.
    /// </summary>
    private static bool RangeIsSatisfiable(
        FieldDefinition field,
        IReadOnlyList<(RuleContent Rule, FieldDefinition Field, OperatorDefinition Op, ParsedValue Value)> rules)
    {
        var isDate = field.ValueType == FieldValueType.Date;
        var step = isDate ? 1m : (decimal)Math.Pow(10, -field.Decimals);

        decimal? lowest = field.MinValue;
        decimal? highest = field.MaxValue;

        foreach (var (_, _, op, value) in rules)
        {
            var numbers = isDate ? value.Dates.Select(d => (decimal)d.DayNumber).ToList() : value.Numbers.ToList();
            switch (op.Key)
            {
                case OperatorKeys.EqualTo:
                    lowest = Max(lowest, numbers[0]);
                    highest = Min(highest, numbers[0]);
                    break;
                case OperatorKeys.AtLeast:
                    lowest = Max(lowest, numbers[0]);
                    break;
                case OperatorKeys.GreaterThan:
                case OperatorKeys.After:
                    lowest = Max(lowest, numbers[0] + step);
                    break;
                case OperatorKeys.AtMost:
                    highest = Min(highest, numbers[0]);
                    break;
                case OperatorKeys.LessThan:
                case OperatorKeys.Before:
                    highest = Min(highest, numbers[0] - step);
                    break;
                case OperatorKeys.Between:
                case OperatorKeys.DateBetween:
                    lowest = Max(lowest, numbers[0]);
                    highest = Min(highest, numbers[1]);
                    break;
            }
        }

        return lowest is null || highest is null || lowest <= highest;
    }

    private static bool ChoicesAreSatisfiable(
        IReadOnlyList<(RuleContent Rule, FieldDefinition Field, OperatorDefinition Op, ParsedValue Value)> rules)
    {
        HashSet<string>? allowed = null;
        var excluded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (_, _, op, value) in rules)
        {
            switch (op.Key)
            {
                case OperatorKeys.Is:
                case OperatorKeys.IsOneOf:
                    allowed = allowed is null
                        ? new HashSet<string>(value.Texts, StringComparer.OrdinalIgnoreCase)
                        : allowed.Where(a => value.Texts.Contains(a, StringComparer.OrdinalIgnoreCase)).ToHashSet(StringComparer.OrdinalIgnoreCase);
                    break;
                case OperatorKeys.IsNot:
                case OperatorKeys.IsNoneOf:
                    excluded.UnionWith(value.Texts);
                    break;
            }
        }

        // With no "is" rule any other value would do, so nothing can be proven impossible.
        return allowed is null || allowed.Any(a => !excluded.Contains(a));
    }

    private static decimal? Max(decimal? current, decimal candidate) => current is null ? candidate : Math.Max(current.Value, candidate);
    private static decimal? Min(decimal? current, decimal candidate) => current is null ? candidate : Math.Min(current.Value, candidate);
}
