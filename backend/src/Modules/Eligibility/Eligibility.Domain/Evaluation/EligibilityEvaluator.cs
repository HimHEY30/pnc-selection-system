using System.Globalization;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;

namespace Eligibility.Domain.Evaluation;

/// <summary>
/// Decides whether a candidate is eligible under a rule set. Pure: it needs no database,
/// no web request and no UI, so the Candidates step can call it for every candidate.
///
/// How the answer is worked out:
/// - A rule that is switched off is skipped.
/// - Within a group, only active MANDATORY rules count. An ALL group passes when all of
///   them pass; an ANY group passes when at least one does. A group with none of them
///   has no say.
/// - Optional rules never affect eligibility. A failed one is only reported as a warning.
/// - Groups combine with ALL: the candidate is eligible when every counted group passes.
/// - A value the candidate did not provide counts as a failure for that rule.
/// </summary>
public static class EligibilityEvaluator
{
    public static EligibilityResult Evaluate(RuleSetContent ruleSet, FieldCatalogue catalogue, CandidateData candidate)
    {
        var ruleResults = new List<RuleResult>();
        var groupResults = new List<GroupResult>();

        foreach (var group in ruleSet.Groups)
        {
            var results = group.Rules
                .Select(rule => EvaluateRule(group.Id, rule, catalogue, candidate, ruleSet.AgeReferenceDate))
                .ToList();
            ruleResults.AddRange(results);

            var counted = results.Where(r => r.Type == RuleType.Mandatory && r.Outcome != RuleOutcome.Skipped).ToList();
            var passed = counted.Count == 0
                || (group.Logic == GroupLogic.All
                    ? counted.All(r => r.Outcome == RuleOutcome.Passed)
                    : counted.Any(r => r.Outcome == RuleOutcome.Passed));

            groupResults.Add(new GroupResult(group.Id, group.Logic, counted.Count > 0, passed));
        }

        return new EligibilityResult(groupResults.All(g => g.Passed), groupResults, ruleResults);
    }

    private static RuleResult EvaluateRule(
        Guid groupId,
        RuleContent rule,
        FieldCatalogue catalogue,
        CandidateData candidate,
        DateOnly? ageReferenceDate)
    {
        RuleResult Result(RuleOutcome outcome, bool missing = false) => new(
            rule.Id, groupId, rule.FieldKey, rule.Type, outcome,
            outcome == RuleOutcome.Failed ? rule.Message : null, missing);

        if (!rule.IsActive)
        {
            return Result(RuleOutcome.Skipped);
        }

        var field = catalogue.FindField(rule.FieldKey);
        var op = catalogue.FindOperator(rule.OperatorKey);
        if (field is null || op is null || !catalogue.IsAllowed(field, op))
        {
            // Validation stops this being saved; if it ever gets here, it cannot pass.
            return Result(RuleOutcome.Failed);
        }

        var expected = RuleValueParser.Parse(field, op, rule.Values);
        if (!expected.IsValid)
        {
            return Result(RuleOutcome.Failed);
        }

        var actual = ReadActual(field, catalogue, candidate, ageReferenceDate);
        if (actual is null)
        {
            return Result(RuleOutcome.Failed, missing: true);
        }

        return Result(Compare(field.ValueType, op.Key, actual, expected.Value!) ? RuleOutcome.Passed : RuleOutcome.Failed);
    }

    /// <summary>The candidate's value in the field's own type, or null when it is missing or unreadable.</summary>
    private static object? ReadActual(FieldDefinition field, FieldCatalogue catalogue, CandidateData candidate, DateOnly? ageReferenceDate)
    {
        if (ExamSubjects.IsTotalOrAverage(field))
        {
            return ReadExamAggregate(field, catalogue, candidate);
        }

        var text = candidate.Get(field.CandidateAttribute);
        if (text is null)
        {
            return null;
        }

        if (field.Derivation == FieldDerivation.AgeFromBirthDate)
        {
            return DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var birth)
                   && ageReferenceDate is { } reference
                   && AgeOn(birth, reference) is { } age
                ? age
                : null;
        }

        return field.ValueType switch
        {
            FieldValueType.Number => RuleValueParser.TryParseDecimal(text, out var number) ? number : null,
            FieldValueType.Date => DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null,
            FieldValueType.YesNo => ParseYesNo(text),
            _ => text,
        };
    }

    /// <summary>
    /// The total or the average of every exam subject the campaign has. A score the candidate has not
    /// got (or that is not a number) makes the whole value missing: half a total would let a candidate
    /// pass a "total at least" rule by skipping a subject. The average is rounded to the field's decimals,
    /// the same precision a rule's value can have.
    /// </summary>
    private static decimal? ReadExamAggregate(FieldDefinition field, FieldCatalogue catalogue, CandidateData candidate)
    {
        var scores = new List<decimal>();
        foreach (var subject in catalogue.Subjects)
        {
            var text = candidate.Get(subject.CandidateAttribute);
            if (text is null || !RuleValueParser.TryParseDecimal(text, out var score))
            {
                return null;
            }

            scores.Add(score);
        }

        if (scores.Count == 0)
        {
            return null;
        }

        var total = scores.Sum();
        return field.Derivation == FieldDerivation.ExamTotal
            ? total
            : Math.Round(total / scores.Count, field.Decimals, MidpointRounding.AwayFromZero);
    }

    /// <summary>Whole years completed on <paramref name="reference"/>. Null if born after it.</summary>
    public static decimal? AgeOn(DateOnly birth, DateOnly reference)
    {
        if (birth > reference)
        {
            return null;
        }

        var years = reference.Year - birth.Year;
        if (reference < birth.AddYears(years))
        {
            years--;
        }

        return years;
    }

    private static bool? ParseYesNo(string text) => text.ToLowerInvariant() switch
    {
        "true" or "yes" or "y" or "1" => true,
        "false" or "no" or "n" or "0" => false,
        _ => null,
    };

    private static bool Compare(FieldValueType type, string op, object actual, ParsedValue expected) => type switch
    {
        FieldValueType.Number => CompareNumber(op, (decimal)actual, expected.Numbers),
        FieldValueType.Date => CompareDate(op, (DateOnly)actual, expected.Dates),
        FieldValueType.YesNo => op == OperatorKeys.IsYes ? (bool)actual : !(bool)actual,
        FieldValueType.Choice => CompareChoice(op, (string)actual, expected.Texts),
        _ => false,
    };

    private static bool CompareNumber(string op, decimal actual, IReadOnlyList<decimal> v) => op switch
    {
        OperatorKeys.EqualTo => actual == v[0],
        OperatorKeys.LessThan => actual < v[0],
        OperatorKeys.AtMost => actual <= v[0],
        OperatorKeys.GreaterThan => actual > v[0],
        OperatorKeys.AtLeast => actual >= v[0],
        OperatorKeys.Between => actual >= v[0] && actual <= v[1],
        _ => false,
    };

    private static bool CompareDate(string op, DateOnly actual, IReadOnlyList<DateOnly> v) => op switch
    {
        OperatorKeys.Before => actual < v[0],
        OperatorKeys.After => actual > v[0],
        OperatorKeys.DateBetween => actual >= v[0] && actual <= v[1],
        _ => false,
    };

    private static bool CompareChoice(string op, string actual, IReadOnlyList<string> v)
    {
        bool Matches(string expected) => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);

        return op switch
        {
            OperatorKeys.Is => Matches(v[0]),
            OperatorKeys.IsNot => !Matches(v[0]),
            OperatorKeys.IsOneOf => v.Any(Matches),
            OperatorKeys.IsNoneOf => !v.Any(Matches),
            _ => false,
        };
    }
}
