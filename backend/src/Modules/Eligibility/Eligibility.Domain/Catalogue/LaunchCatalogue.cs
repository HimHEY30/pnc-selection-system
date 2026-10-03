namespace Eligibility.Domain.Catalogue;

/// <summary>
/// The fields available at launch. The first migration seeds exactly this list, and the
/// tests build their catalogue from it, so the two cannot drift apart.
/// </summary>
public static class LaunchCatalogue
{
    public const string Age = "age";
    public const string Gender = "gender";
    public const string Province = "province";
    public const string HighestGrade = "highest_grade";
    public const string Grade12Result = "grade12_result";
    public const string FamilyIncome = "family_income";
    public const string MaritalStatus = "marital_status";
    public const string AttendedInfoSession = "attended_info_session";

    /// <summary>The candidate attribute the age field is calculated from.</summary>
    public const string DateOfBirthAttribute = "date_of_birth";

    public static IReadOnlyList<FieldDefinition> Fields { get; } =
    [
        new(Age, "Age", FieldValueType.Number, position: 1,
            derivation: FieldDerivation.AgeFromBirthDate, candidateAttribute: DateOfBirthAttribute,
            unit: "years", decimals: 0, minValue: 0, maxValue: 120),

        new(Gender, "Gender", FieldValueType.Choice, position: 2, optionsSource: OptionsSource.Fixed,
            options: [("female", "Female"), ("male", "Male")]),

        // Options come from the campaign's target provinces (Step 1), not from this catalogue.
        new(Province, "Province", FieldValueType.Choice, position: 3, optionsSource: OptionsSource.CampaignProvinces),

        new(HighestGrade, "Highest grade completed", FieldValueType.Choice, position: 4, optionsSource: OptionsSource.Fixed,
            options:
            [
                ("grade_9", "Grade 9"),
                ("grade_10", "Grade 10"),
                ("grade_11", "Grade 11"),
                ("grade_12", "Grade 12"),
                ("diploma_or_higher", "Diploma or higher"),
            ]),

        new(Grade12Result, "Grade 12 exam result", FieldValueType.Choice, position: 5, optionsSource: OptionsSource.Fixed,
            options: [("A", "A"), ("B", "B"), ("C", "C"), ("D", "D"), ("E", "E"), ("F", "F")]),

        new(FamilyIncome, "Family monthly income", FieldValueType.Number, position: 6,
            unit: "USD", decimals: 2, minValue: 0),

        new(MaritalStatus, "Marital status", FieldValueType.Choice, position: 7, optionsSource: OptionsSource.Fixed,
            options: [("single", "Single"), ("married", "Married"), ("divorced", "Divorced"), ("widowed", "Widowed")]),

        new(AttendedInfoSession, "Attended an information session", FieldValueType.YesNo, position: 8),
    ];

    public static FieldCatalogue Create() => new(Fields, OperatorDefinition.Defaults);
}
