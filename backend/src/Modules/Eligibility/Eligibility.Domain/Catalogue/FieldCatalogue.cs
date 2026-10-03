namespace Eligibility.Domain.Catalogue;

/// <summary>
/// An in-memory view of the catalogue, built from the database rows (or from test data).
/// The rule builder and the evaluator both ask it which fields exist and which operators
/// each field allows, so neither hard-codes a field.
/// </summary>
public sealed class FieldCatalogue
{
    private readonly Dictionary<string, FieldDefinition> _fields;
    private readonly Dictionary<string, OperatorDefinition> _operators;

    public FieldCatalogue(IEnumerable<FieldDefinition> fields, IEnumerable<OperatorDefinition> operators)
    {
        _fields = fields.ToDictionary(f => f.Key, StringComparer.Ordinal);
        _operators = operators.ToDictionary(o => o.Key, StringComparer.Ordinal);
    }

    public IReadOnlyCollection<FieldDefinition> Fields => _fields.Values;
    public IReadOnlyCollection<OperatorDefinition> Operators => _operators.Values;

    public FieldDefinition? FindField(string? key) =>
        key is not null && _fields.TryGetValue(key, out var field) ? field : null;

    public OperatorDefinition? FindOperator(string? key) =>
        key is not null && _operators.TryGetValue(key, out var op) ? op : null;

    /// <summary>The operators a field offers: those of its value type, in display order.</summary>
    public IEnumerable<OperatorDefinition> OperatorsFor(FieldDefinition field) =>
        _operators.Values.Where(o => o.ValueType == field.ValueType).OrderBy(o => o.Position);

    public bool IsAllowed(FieldDefinition field, OperatorDefinition op) => op.ValueType == field.ValueType;
}
