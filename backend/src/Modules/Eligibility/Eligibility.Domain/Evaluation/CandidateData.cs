namespace Eligibility.Domain.Evaluation;

/// <summary>
/// What is known about one candidate, as text by attribute key: the field keys of the
/// catalogue ("gender", "highest_grade", "family_income", ...) plus "date_of_birth", which
/// the age field is calculated from. A missing or blank entry means "not provided".
/// </summary>
public sealed class CandidateData
{
    public static readonly CandidateData Empty = new(null);

    private readonly Dictionary<string, string?> _values;

    public CandidateData(IReadOnlyDictionary<string, string?>? values)
    {
        _values = new Dictionary<string, string?>(values ?? new Dictionary<string, string?>(), StringComparer.Ordinal);
    }

    public string? Get(string attribute) =>
        _values.TryGetValue(attribute, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
}
