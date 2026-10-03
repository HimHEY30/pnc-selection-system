namespace Eligibility.Domain.Catalogue;

/// <summary>One option of a fixed-list choice field, e.g. "grade_12" / "Grade 12".</summary>
public sealed class FieldOption
{
    public string FieldKey { get; private set; } = string.Empty;
    public string Key { get; private set; } = string.Empty;
    public string Label { get; private set; } = string.Empty;
    public int Position { get; private set; }

    private FieldOption() { }

    public FieldOption(string fieldKey, string key, string label, int position)
    {
        FieldKey = fieldKey;
        Key = key;
        Label = label;
        Position = position;
    }
}

/// <summary>
/// A candidate attribute a rule can check. The catalogue of these is data (seeded into
/// the database), so a new field is a new row, not a code change in the rule builder.
/// </summary>
public sealed class FieldDefinition
{
    private readonly List<FieldOption> _options = [];

    public string Key { get; private set; } = string.Empty;
    public string Label { get; private set; } = string.Empty;
    public FieldValueType ValueType { get; private set; }
    public OptionsSource? OptionsSource { get; private set; }
    public FieldDerivation Derivation { get; private set; }

    /// <summary>
    /// The key of the candidate attribute this field reads. Usually the field's own key;
    /// for a derived field such as age it is the attribute it is derived from.
    /// </summary>
    public string CandidateAttribute { get; private set; } = string.Empty;

    /// <summary>Shown next to number inputs, e.g. "USD".</summary>
    public string? Unit { get; private set; }

    /// <summary>Most decimal places a number may have. 0 means whole numbers only.</summary>
    public int Decimals { get; private set; }

    public decimal? MinValue { get; private set; }
    public decimal? MaxValue { get; private set; }
    public int Position { get; private set; }

    /// <summary>The campaign this field belongs to (an exam subject), or null for the shared catalogue.</summary>
    public Guid? CampaignId { get; private set; }

    /// <summary>The subject's name as typed ("Math"), or null for a field that is not an exam subject.</summary>
    public string? SubjectName { get; private set; }

    public IReadOnlyCollection<FieldOption> Options => _options;

    private FieldDefinition() { }

    /// <summary>Renames an exam subject. The label shown in the rule builder follows the name.</summary>
    public void RenameSubject(string name)
    {
        SubjectName = name;
        Label = ExamSubjects.LabelFor(name);
    }

    public FieldDefinition(
        string key,
        string label,
        FieldValueType valueType,
        int position,
        OptionsSource? optionsSource = null,
        FieldDerivation derivation = FieldDerivation.None,
        string? candidateAttribute = null,
        string? unit = null,
        int decimals = 0,
        decimal? minValue = null,
        decimal? maxValue = null,
        IEnumerable<(string Key, string Label)>? options = null,
        Guid? campaignId = null,
        string? subjectName = null)
    {
        CampaignId = campaignId;
        SubjectName = subjectName;
        Key = key;
        Label = label;
        ValueType = valueType;
        Position = position;
        OptionsSource = optionsSource;
        Derivation = derivation;
        CandidateAttribute = candidateAttribute ?? key;
        Unit = unit;
        Decimals = decimals;
        MinValue = minValue;
        MaxValue = maxValue;

        var index = 0;
        foreach (var (optionKey, optionLabel) in options ?? [])
        {
            _options.Add(new FieldOption(key, optionKey, optionLabel, ++index));
        }
    }
}
