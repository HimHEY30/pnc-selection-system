using System.Globalization;
using Eligibility.Domain.Catalogue;

namespace Eligibility.Domain.Rules;

/// <summary>A rule's value after parsing, in the type its field needs.</summary>
public sealed record ParsedValue(
    IReadOnlyList<decimal> Numbers,
    IReadOnlyList<DateOnly> Dates,
    IReadOnlyList<string> Texts)
{
    public static readonly ParsedValue Empty = new([], [], []);
}

public enum ValueProblem
{
    None,
    WrongCount,
    Blank,
    NotANumber,
    TooManyDecimals,
    BelowMinimum,
    AboveMaximum,
    NotADate,
    NotInList,
    FirstNotLower,
}

public readonly record struct ParseOutcome(ParsedValue? Value, ValueProblem Problem)
{
    public bool IsValid => Problem == ValueProblem.None;
}

/// <summary>
/// Rule values are stored and sent as text (["17", "23"], ["grade_12"], ["2027-01-31"]), one
/// shape for every field type. This turns them into numbers, dates or keys and says what is
/// wrong when they do not fit the field and operator. Used by both validation and evaluation.
/// </summary>
public static class RuleValueParser
{
    /// <param name="allowedChoices">
    /// For choice fields: the keys a value may use (the catalogue options, or the campaign's
    /// target provinces). Null skips the check.
    /// </param>
    public static ParseOutcome Parse(
        FieldDefinition field,
        OperatorDefinition op,
        IReadOnlyList<string>? values,
        IReadOnlyCollection<string>? allowedChoices = null)
    {
        var raw = values ?? [];

        switch (op.Arity)
        {
            case OperatorArity.None:
                return raw.Count == 0 ? new(ParsedValue.Empty, ValueProblem.None) : Fail(ValueProblem.WrongCount);
            case OperatorArity.One when raw.Count != 1:
            case OperatorArity.Two when raw.Count != 2:
            case OperatorArity.List when raw.Count == 0:
                return Fail(ValueProblem.WrongCount);
        }

        if (raw.Any(string.IsNullOrWhiteSpace))
        {
            return Fail(ValueProblem.Blank);
        }

        return field.ValueType switch
        {
            FieldValueType.Number => ParseNumbers(field, op, raw),
            FieldValueType.Date => ParseDates(op, raw),
            FieldValueType.Choice => ParseChoices(raw, allowedChoices),
            _ => Fail(ValueProblem.WrongCount),
        };
    }

    private static ParseOutcome ParseNumbers(FieldDefinition field, OperatorDefinition op, IReadOnlyList<string> raw)
    {
        var numbers = new List<decimal>();
        foreach (var text in raw)
        {
            if (!TryParseDecimal(text, out var number))
            {
                return Fail(ValueProblem.NotANumber);
            }

            if (DecimalPlaces(number) > field.Decimals)
            {
                return Fail(ValueProblem.TooManyDecimals);
            }

            if (field.MinValue is { } min && number < min)
            {
                return Fail(ValueProblem.BelowMinimum);
            }

            if (field.MaxValue is { } max && number > max)
            {
                return Fail(ValueProblem.AboveMaximum);
            }

            numbers.Add(number);
        }

        if (op.Arity == OperatorArity.Two && numbers[0] >= numbers[1])
        {
            return Fail(ValueProblem.FirstNotLower);
        }

        return new(new ParsedValue(numbers, [], []), ValueProblem.None);
    }

    private static ParseOutcome ParseDates(OperatorDefinition op, IReadOnlyList<string> raw)
    {
        var dates = new List<DateOnly>();
        foreach (var text in raw)
        {
            if (!DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return Fail(ValueProblem.NotADate);
            }

            dates.Add(date);
        }

        if (op.Arity == OperatorArity.Two && dates[0] >= dates[1])
        {
            return Fail(ValueProblem.FirstNotLower);
        }

        return new(new ParsedValue([], dates, []), ValueProblem.None);
    }

    private static ParseOutcome ParseChoices(IReadOnlyList<string> raw, IReadOnlyCollection<string>? allowed)
    {
        var texts = raw.Select(t => t.Trim()).ToList();
        if (allowed is not null && texts.Any(t => !allowed.Contains(t, StringComparer.Ordinal)))
        {
            return Fail(ValueProblem.NotInList);
        }

        return new(new ParsedValue([], [], texts), ValueProblem.None);
    }

    public static bool TryParseDecimal(string text, out decimal value) =>
        decimal.TryParse(
            text.Trim(),
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out value);

    public static string FormatNumber(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    // "20.50" is held with scale 2 but has one real decimal place. Dividing by a long
    // 1.000... drops trailing zeros, so the scale that is left is the real count.
    private static int DecimalPlaces(decimal value)
    {
        var normalized = value / 1.0000000000000000000000000000m;
        return (decimal.GetBits(normalized)[3] >> 16) & 0xFF;
    }

    private static ParseOutcome Fail(ValueProblem problem) => new(null, problem);
}
