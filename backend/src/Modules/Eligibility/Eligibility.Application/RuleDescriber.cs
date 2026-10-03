using Campaigns.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;

namespace Eligibility.Application;

/// <summary>Writes a rule as a short phrase, e.g. "Age is between 17 and 23", for error messages.</summary>
public static class RuleDescriber
{
    public static string Describe(RuleContent rule, FieldCatalogue catalogue, IReadOnlyList<TargetProvince> targetProvinces)
    {
        var field = catalogue.FindField(rule.FieldKey);
        var op = catalogue.FindOperator(rule.OperatorKey);
        if (field is null || op is null)
        {
            return rule.FieldKey;
        }

        var values = rule.Values.Select(v => Label(field, v, targetProvinces)).ToList();
        var value = op.Arity switch
        {
            OperatorArity.None => string.Empty,
            OperatorArity.Two => $" {values[0]} and {values[1]}",
            _ => " " + string.Join(", ", values),
        };

        // "Age between 17 and 23" reads better than "Age is between": the operator carries its own verb.
        return $"{field.Label} {op.Label}{value}";
    }

    private static string Label(FieldDefinition field, string value, IReadOnlyList<TargetProvince> targetProvinces)
    {
        if (field.ValueType != FieldValueType.Choice)
        {
            return value;
        }

        return field.OptionsSource == OptionsSource.CampaignProvinces
            ? targetProvinces.FirstOrDefault(p => p.Id == value)?.Name ?? value
            : field.Options.FirstOrDefault(o => o.Key == value)?.Label ?? value;
    }
}
