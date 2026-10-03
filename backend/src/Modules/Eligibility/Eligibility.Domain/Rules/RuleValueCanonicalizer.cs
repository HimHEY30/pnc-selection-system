using System.Globalization;
using Eligibility.Domain.Catalogue;

namespace Eligibility.Domain.Rules;

/// <summary>
/// Gives equal values one spelling, so "17" and "17.0" are the same value and "is one of
/// A, B" equals "is one of B, A". Without this the duplicate check and the database's
/// unique index would treat them as different rules.
/// </summary>
public static class RuleValueCanonicalizer
{
    public static IReadOnlyList<string> Canonicalize(FieldDefinition field, OperatorDefinition op, ParsedValue parsed)
    {
        switch (field.ValueType)
        {
            case FieldValueType.Number:
                return parsed.Numbers.Select(RuleValueParser.FormatNumber).ToList();

            case FieldValueType.Date:
                return parsed.Dates.Select(d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).ToList();

            case FieldValueType.Choice when op.Arity == OperatorArity.List:
                return parsed.Texts.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();

            case FieldValueType.Choice:
                return parsed.Texts;

            default:
                return [];
        }
    }
}
