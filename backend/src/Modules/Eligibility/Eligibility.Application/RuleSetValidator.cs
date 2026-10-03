using Campaigns.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;

namespace Eligibility.Application;

/// <summary>How strictly to check a rule set.</summary>
public enum ValidationMode
{
    /// <summary>Only that each rule is well formed, so it can be evaluated. Used by the test panel.</summary>
    Test,

    /// <summary>"Save draft": well formed, no duplicates, no contradictions.</summary>
    Draft,

    /// <summary>"Save and continue": everything above, plus what a finished step needs.</summary>
    Complete,
}

public sealed record ValidatedRuleSet(RuleSetContent? Content, Dictionary<string, string[]> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Turns what the page sent into a clean <see cref="RuleSetContent"/>, or says what is wrong.
/// Pure and synchronous. Error keys name where to show the message: "rules.{id}.values",
/// "rules.{id}.field", "rules.{id}" (a problem with the rule as a whole), "groups.{id}.name",
/// "ageReferenceDate", and "rules" / "groups" for the set as a whole.
/// </summary>
public static class RuleSetValidator
{
    public const int GroupNameMax = 60;
    public const int MessageMax = 200;
    public const int MaxGroups = 20;
    public const int MaxRulesPerGroup = 50;

    public static string RuleKey(Guid ruleId, string part) => $"rules.{ruleId}.{part}";
    public static string GroupKey(Guid groupId, string part) => $"groups.{groupId}.{part}";

    public static ValidatedRuleSet Validate(
        RuleSetRequest request,
        FieldCatalogue catalogue,
        IReadOnlyList<TargetProvince> targetProvinces,
        ValidationMode mode)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string key, string message)
        {
            if (!errors.TryGetValue(key, out var list))
            {
                errors[key] = list = [];
            }

            if (!list.Contains(message))
            {
                list.Add(message);
            }
        }

        var groupInputs = request.Groups ?? [];
        if (groupInputs.Count > MaxGroups)
        {
            Add("groups", $"A campaign can have at most {MaxGroups} groups.");
        }

        var ids = groupInputs.Select(g => g.Id).Concat(groupInputs.SelectMany(g => g.Rules ?? []).Select(r => r.Id)).ToList();
        var idsAreSound = ids.All(id => id != Guid.Empty) && ids.Distinct().Count() == ids.Count;
        if (!idsAreSound)
        {
            Add("groups", "Something went wrong with this form. Reload the page and try again.");
        }

        var provinceIds = mode == ValidationMode.Complete ? targetProvinces.Select(p => p.Id).ToList() : null;
        var groups = new List<GroupContent>();

        foreach (var groupInput in groupInputs.Take(MaxGroups))
        {
            var name = (groupInput.Name ?? string.Empty).Trim();
            if (name.Length == 0)
            {
                Add(GroupKey(groupInput.Id, "name"), "Give the group a name.");
            }
            else if (name.Length > GroupNameMax)
            {
                Add(GroupKey(groupInput.Id, "name"), $"Group name must be {GroupNameMax} characters or fewer.");
            }

            if (!Enum.TryParse<GroupLogic>(groupInput.Logic, ignoreCase: true, out var logic) || !Enum.IsDefined(logic))
            {
                Add(GroupKey(groupInput.Id, "logic"), "Choose ALL or ANY.");
                logic = GroupLogic.All;
            }

            var ruleInputs = groupInput.Rules ?? [];
            if (ruleInputs.Count > MaxRulesPerGroup)
            {
                Add(GroupKey(groupInput.Id, "rules"), $"A group can have at most {MaxRulesPerGroup} rules.");
            }

            var rules = new List<RuleContent>();
            foreach (var ruleInput in ruleInputs.Take(MaxRulesPerGroup))
            {
                if (ValidateRule(ruleInput, catalogue, provinceIds, Add) is { } rule)
                {
                    rules.Add(rule);
                }
            }

            groups.Add(new GroupContent(groupInput.Id, name, logic, rules));
        }

        // Cross-rule checks look only at the rules that are well formed on their own.
        var content = new RuleSetContent(request.AgeReferenceDate, groups);

        // With empty or repeated ids the request is already rejected, and the checks below
        // look rules up by id, so they would only fail on the same bad ids.
        if (mode != ValidationMode.Test && idsAreSound)
        {
            AddDuplicateErrors(content, Add);
            AddContradictionErrors(content, catalogue, targetProvinces, Add);
        }

        if (mode == ValidationMode.Complete)
        {
            AddCompletenessErrors(content, catalogue, Add);
        }

        var finished = errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
        return new ValidatedRuleSet(finished.Count == 0 ? content : null, finished);
    }

    private static RuleContent? ValidateRule(
        RuleInput input,
        FieldCatalogue catalogue,
        IReadOnlyCollection<string>? targetProvinceIds,
        Action<string, string> add)
    {
        var ok = true;

        var field = catalogue.FindField(input.FieldKey);
        if (field is null)
        {
            add(RuleKey(input.Id, "field"), "Choose a field.");
            ok = false;
        }

        var op = catalogue.FindOperator(input.OperatorKey);
        if (op is null)
        {
            add(RuleKey(input.Id, "operator"), "Choose how to compare.");
            ok = false;
        }
        else if (field is not null && !catalogue.IsAllowed(field, op))
        {
            add(RuleKey(input.Id, "operator"), "This comparison does not fit the chosen field.");
            ok = false;
        }

        if (!Enum.TryParse<RuleType>(input.Type, ignoreCase: true, out var type) || !Enum.IsDefined(type))
        {
            add(RuleKey(input.Id, "type"), "Choose mandatory or optional.");
            ok = false;
        }

        var message = (input.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            add(RuleKey(input.Id, "message"), "Write the reason shown when a candidate fails this rule.");
            ok = false;
        }
        else if (message.Length > MessageMax)
        {
            add(RuleKey(input.Id, "message"), $"The message must be {MessageMax} characters or fewer.");
            ok = false;
        }

        IReadOnlyList<string> values = [];
        if (field is not null && op is not null && catalogue.IsAllowed(field, op))
        {
            var allowed = field.ValueType != FieldValueType.Choice
                ? null
                : field.OptionsSource == OptionsSource.CampaignProvinces
                    ? targetProvinceIds
                    : field.Options.Select(o => o.Key).ToList();

            var parsed = RuleValueParser.Parse(field, op, input.Values, allowed);
            if (!parsed.IsValid)
            {
                add(RuleKey(input.Id, "values"), ValueMessage(parsed.Problem, field, op));
                ok = false;
            }
            else
            {
                values = RuleValueCanonicalizer.Canonicalize(field, op, parsed.Value!);
            }
        }
        else
        {
            ok = false;
        }

        return ok
            ? new RuleContent(input.Id, field!.Key, op!.Key, values, type, message, input.IsActive)
            : null;
    }

    private static string ValueMessage(ValueProblem problem, FieldDefinition field, OperatorDefinition op) => problem switch
    {
        ValueProblem.WrongCount => op.Arity switch
        {
            OperatorArity.None => "This comparison takes no value.",
            OperatorArity.Two => "Enter both values.",
            OperatorArity.List => "Choose at least one option.",
            _ => "Enter a value.",
        },
        ValueProblem.Blank => "Fill in every value.",
        ValueProblem.NotANumber => "Enter a number.",
        ValueProblem.TooManyDecimals => field.Decimals == 0 ? "Use a whole number." : $"Use at most {field.Decimals} decimal places.",
        ValueProblem.BelowMinimum => $"Enter {RuleValueParser.FormatNumber(field.MinValue ?? 0)} or more.",
        ValueProblem.AboveMaximum => $"Enter {RuleValueParser.FormatNumber(field.MaxValue ?? 0)} or less.",
        ValueProblem.NotADate => "Enter a date as year-month-day.",
        ValueProblem.NotInList => field.OptionsSource == OptionsSource.CampaignProvinces
            ? "Choose only target provinces of this campaign. Change them in Step 1."
            : "Choose from the list.",
        ValueProblem.FirstNotLower => "The first value must be lower than the second.",
        _ => "This value is not valid.",
    };

    private static void AddDuplicateErrors(RuleSetContent content, Action<string, string> add)
    {
        foreach (var duplicate in RuleConflicts.FindDuplicates(content))
        {
            // The first copy is fine; the others are the problem.
            foreach (var id in duplicate.RuleIds.Skip(1))
            {
                add($"rules.{id}", "The same rule already exists in this group.");
            }
        }
    }

    private static void AddContradictionErrors(
        RuleSetContent content,
        FieldCatalogue catalogue,
        IReadOnlyList<TargetProvince> targetProvinces,
        Action<string, string> add)
    {
        var byId = content.AllRules.ToDictionary(r => r.Id);
        foreach (var contradiction in RuleConflicts.FindContradictions(content, catalogue))
        {
            var described = string.Join("; ", contradiction.RuleIds.Select(id => RuleDescriber.Describe(byId[id], catalogue, targetProvinces)));
            foreach (var id in contradiction.RuleIds)
            {
                add($"rules.{id}", $"These rules can never all be true together: {described}.");
            }
        }
    }

    private static void AddCompletenessErrors(RuleSetContent content, FieldCatalogue catalogue, Action<string, string> add)
    {
        if (!content.AllRules.Any(r => r.IsActive && r.Type == RuleType.Mandatory))
        {
            add("rules", "Add at least one active mandatory rule.");
        }

        var usesAge = content.AllRules.Any(r => r.IsActive && catalogue.FindField(r.FieldKey)?.Derivation == FieldDerivation.AgeFromBirthDate);
        if (usesAge && content.AgeReferenceDate is null)
        {
            add("ageReferenceDate", "Choose the date ages are calculated on.");
        }
    }
}
