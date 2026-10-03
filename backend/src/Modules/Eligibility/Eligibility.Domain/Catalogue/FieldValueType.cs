namespace Eligibility.Domain.Catalogue;

/// <summary>
/// What kind of value a field holds. It decides which operators are offered and how
/// values are parsed and compared. Stored as a smallint, so never renumber.
/// </summary>
public enum FieldValueType : short
{
    Number = 1,
    Choice = 2,
    YesNo = 3,
    Date = 4,
}

/// <summary>Where a choice field gets its options from.</summary>
public enum OptionsSource : short
{
    /// <summary>A fixed list stored in the catalogue (gender, grade, ...).</summary>
    Fixed = 1,

    /// <summary>The target provinces chosen in Step 1 of the campaign.</summary>
    CampaignProvinces = 2,
}

/// <summary>A field whose value is worked out from another candidate attribute.</summary>
public enum FieldDerivation : short
{
    None = 0,

    /// <summary>Whole years completed between the date of birth and the campaign's reference date.</summary>
    AgeFromBirthDate = 1,

    /// <summary>One exam subject's score. The candidate supplies it under the field's own key.</summary>
    ExamScore = 2,

    /// <summary>The sum of the campaign's exam subject scores. Missing if any subject is missing.</summary>
    ExamTotal = 3,

    /// <summary>The average of the campaign's exam subject scores. Missing if any subject is missing.</summary>
    ExamAverage = 4,
}

/// <summary>How many values an operator takes. Stored as a smallint.</summary>
public enum OperatorArity : short
{
    /// <summary>"is yes" / "is no": no value to enter.</summary>
    None = 0,

    One = 1,

    /// <summary>"between": a lower and an upper value.</summary>
    Two = 2,

    /// <summary>"is one of" / "is none of": one or more values.</summary>
    List = 3,
}
