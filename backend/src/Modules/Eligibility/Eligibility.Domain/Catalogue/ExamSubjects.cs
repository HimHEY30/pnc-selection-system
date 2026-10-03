using System.Text.RegularExpressions;

namespace Eligibility.Domain.Catalogue;

/// <summary>
/// Exam subjects (Math, Logic, English, ...). Each campaign has its own list. A subject is a
/// catalogue field of its own, so rules, validation and the evaluator treat "Math score" like any
/// other number field. The shared catalogue also holds two fields that are worked out from the
/// subjects: the total and the average.
/// </summary>
public static class ExamSubjects
{
    public const int MaxPerCampaign = 12;
    public const int NameMax = 40;

    /// <summary>The total and the average only mean something with at least this many subjects.</summary>
    public const int MinForTotals = 2;

    /// <summary>Scores are points from 0 to this value, with up to two decimals.</summary>
    public const decimal MaxScore = 100;

    public const string TotalKey = "exam_total";
    public const string AverageKey = "exam_average";

    /// <summary>Subject fields sort after the shared fields and before the total and the average.</summary>
    public const int FirstPosition = 20;

    public const string Unit = "points";
    public const int Decimals = 2;

    private const string KeyPrefix = "exam_";

    /// <summary>The subjects a campaign starts with.</summary>
    public static IReadOnlyList<string> DefaultNames { get; } = ["Math", "Logic", "English"];

    public static string KeyFor(Guid subjectId) => KeyPrefix + subjectId.ToString("N");

    /// <summary>The id inside a subject field key, or false for any other key (including the total and average).</summary>
    public static bool TryGetId(string? key, out Guid id)
    {
        id = Guid.Empty;
        return key is not null
               && key.StartsWith(KeyPrefix, StringComparison.Ordinal)
               && Guid.TryParseExact(key.AsSpan(KeyPrefix.Length), "N", out id);
    }

    public static bool IsTotalOrAverage(FieldDefinition field) =>
        field.Derivation is FieldDerivation.ExamTotal or FieldDerivation.ExamAverage;

    /// <summary>The name with outer spaces removed and inner runs of spaces made into one.</summary>
    public static string CleanName(string? name) => Regex.Replace((name ?? string.Empty).Trim(), @"\s+", " ");

    /// <summary>"Math" becomes "Math score", the label used in the rule builder and the summary.</summary>
    public static string LabelFor(string name) => $"{name} score";

    public static FieldDefinition CreateField(Guid subjectId, Guid campaignId, string name, int position)
    {
        var key = KeyFor(subjectId);
        return new FieldDefinition(
            key,
            LabelFor(name),
            FieldValueType.Number,
            position,
            derivation: FieldDerivation.ExamScore,
            unit: Unit,
            decimals: Decimals,
            minValue: 0,
            maxValue: MaxScore,
            campaignId: campaignId,
            subjectName: name);
    }
}
