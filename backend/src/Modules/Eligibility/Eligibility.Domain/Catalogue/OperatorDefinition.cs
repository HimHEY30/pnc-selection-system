namespace Eligibility.Domain.Catalogue;

/// <summary>Stable keys of the operators. The evaluator implements each one.</summary>
public static class OperatorKeys
{
    // Number
    public const string EqualTo = "equals";
    public const string LessThan = "less_than";
    public const string AtMost = "at_most";
    public const string GreaterThan = "greater_than";
    public const string AtLeast = "at_least";
    public const string Between = "between";

    // Choice
    public const string Is = "is";
    public const string IsNot = "is_not";
    public const string IsOneOf = "is_one_of";
    public const string IsNoneOf = "is_none_of";

    // Yes / no
    public const string IsYes = "is_yes";
    public const string IsNo = "is_no";

    // Date
    public const string Before = "before";
    public const string After = "after";
    public const string DateBetween = "date_between";
}

/// <summary>
/// One comparison a rule can use, tied to the value type it applies to. The list of
/// operators a field offers is simply the operators of its value type, so a new field
/// needs no change to the rule builder. A new operator also needs code in the evaluator.
/// </summary>
public sealed class OperatorDefinition
{
    public string Key { get; private set; } = string.Empty;
    public string Label { get; private set; } = string.Empty;
    public FieldValueType ValueType { get; private set; }
    public OperatorArity Arity { get; private set; }
    public int Position { get; private set; }

    private OperatorDefinition() { }

    public OperatorDefinition(string key, string label, FieldValueType valueType, OperatorArity arity, int position)
    {
        Key = key;
        Label = label;
        ValueType = valueType;
        Arity = arity;
        Position = position;
    }

    /// <summary>The operators available at launch. The first migration seeds exactly this list.</summary>
    public static IReadOnlyList<OperatorDefinition> Defaults { get; } =
    [
        new(OperatorKeys.EqualTo, "equals", FieldValueType.Number, OperatorArity.One, 1),
        new(OperatorKeys.LessThan, "less than", FieldValueType.Number, OperatorArity.One, 2),
        new(OperatorKeys.AtMost, "at most", FieldValueType.Number, OperatorArity.One, 3),
        new(OperatorKeys.GreaterThan, "greater than", FieldValueType.Number, OperatorArity.One, 4),
        new(OperatorKeys.AtLeast, "at least", FieldValueType.Number, OperatorArity.One, 5),
        new(OperatorKeys.Between, "between", FieldValueType.Number, OperatorArity.Two, 6),

        new(OperatorKeys.Is, "is", FieldValueType.Choice, OperatorArity.One, 1),
        new(OperatorKeys.IsNot, "is not", FieldValueType.Choice, OperatorArity.One, 2),
        new(OperatorKeys.IsOneOf, "is one of", FieldValueType.Choice, OperatorArity.List, 3),
        new(OperatorKeys.IsNoneOf, "is none of", FieldValueType.Choice, OperatorArity.List, 4),

        new(OperatorKeys.IsYes, "is yes", FieldValueType.YesNo, OperatorArity.None, 1),
        new(OperatorKeys.IsNo, "is no", FieldValueType.YesNo, OperatorArity.None, 2),

        new(OperatorKeys.Before, "before", FieldValueType.Date, OperatorArity.One, 1),
        new(OperatorKeys.After, "after", FieldValueType.Date, OperatorArity.One, 2),
        new(OperatorKeys.DateBetween, "between", FieldValueType.Date, OperatorArity.Two, 3),
    ];
}
