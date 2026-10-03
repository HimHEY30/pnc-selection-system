using System.Globalization;

namespace Campaigns.Application;

/// <summary>
/// Field-level rules for the campaign requests. Pure and synchronous: checks that
/// need the database (unique name, existing provinces) live in the service.
/// All messages are shown to staff next to the field, so they say what to do.
/// </summary>
public static class CampaignValidator
{
    public const int NameMaxLength = 100;
    public const int AcademicYearMaxLength = 20;
    public const int DescriptionMaxLength = 500;

    public const string NameKey = "name";
    public const string AcademicYearKey = "academicYear";
    public const string DescriptionKey = "description";
    public const string StartModeKey = "startMode";
    public const string CopySourceKey = "copyFrom.sourceCampaignId";
    public const string CopyPartsKey = "copyFrom.parts";
    public const string StartDateKey = "startDate";
    public const string EndDateKey = "endDate";
    public const string ExpectedCandidatesKey = "expectedCandidates";
    public const string SeatsAvailableKey = "seatsAvailable";
    public const string ProvinceIdsKey = "provinceIds";

    public static Dictionary<string, string[]> ValidateCreate(CreateCampaignRequest request)
    {
        var errors = new FieldErrors();
        CheckIdentity(errors, request.Name, request.AcademicYear, request.Description);

        var mode = string.IsNullOrWhiteSpace(request.StartMode) ? StartModes.Scratch : request.StartMode;
        if (mode == StartModes.Copy)
        {
            CheckCopy(errors, request.CopyFrom);
        }
        else if (mode != StartModes.Scratch)
        {
            errors.Add(StartModeKey, "Choose how you want to start.");
        }

        return errors.ToDictionary();
    }

    /// <summary>Whether the request starts from a copy (and so carries a source and parts to check).</summary>
    public static bool IsCopy(CreateCampaignRequest request) => request.StartMode == StartModes.Copy;

    /// <summary>The parts to copy, once validated: known, without repeats.</summary>
    public static IReadOnlySet<string> RequestedParts(CopyFromRequest? copyFrom) =>
        (copyFrom?.Parts ?? []).ToHashSet();

    private static void CheckCopy(FieldErrors errors, CopyFromRequest? copyFrom)
    {
        if (copyFrom?.SourceCampaignId is null || copyFrom.SourceCampaignId == Guid.Empty)
        {
            errors.Add(CopySourceKey, "Choose the campaign to copy from.");
        }

        var parts = copyFrom?.Parts ?? [];
        if (parts.Length == 0)
        {
            errors.Add(CopyPartsKey, "Choose at least one thing to copy.");
        }
        else if (parts.Any(p => !CopyParts.All.Contains(p)))
        {
            errors.Add(CopyPartsKey, "One of the things to copy is not one we can copy.");
        }
        else if (parts.Distinct().Count() != parts.Length)
        {
            errors.Add(CopyPartsKey, "Each thing to copy can only be chosen once.");
        }
    }

    /// <param name="complete">
    /// False for "Save draft" (only name and academic year are required, but anything
    /// entered must still be valid). True for "Save and continue" (everything required).
    /// </param>
    public static Dictionary<string, string[]> ValidateInfo(CampaignInfoRequest request, bool complete)
    {
        var errors = new FieldErrors();
        CheckIdentity(errors, request.Name, request.AcademicYear, request.Description);

        if (complete && request.StartDate is null)
        {
            errors.Add(StartDateKey, "Enter a start date.");
        }

        if (complete && request.EndDate is null)
        {
            errors.Add(EndDateKey, "Enter an end date.");
        }

        if (request.StartDate is { } start && request.EndDate is { } end && end <= start)
        {
            errors.Add(EndDateKey, $"End date must be after the start date ({FormatDate(start)}).");
        }

        if (complete && request.ExpectedCandidates is null)
        {
            errors.Add(ExpectedCandidatesKey, "Enter the expected number of candidates.");
        }
        else if (request.ExpectedCandidates is <= 0)
        {
            errors.Add(ExpectedCandidatesKey, "Expected candidates must be a whole number greater than 0.");
        }

        if (complete && request.SeatsAvailable is null)
        {
            errors.Add(SeatsAvailableKey, "Enter the number of seats available.");
        }
        else if (request.SeatsAvailable is <= 0)
        {
            errors.Add(SeatsAvailableKey, "Seats available must be a whole number greater than 0.");
        }
        else if (request.SeatsAvailable is { } seats && request.ExpectedCandidates is > 0 and var expected && seats > expected)
        {
            errors.Add(SeatsAvailableKey, $"Seats available cannot be more than expected candidates ({expected.ToString("N0", CultureInfo.InvariantCulture)}).");
        }

        if (complete && (request.ProvinceIds is null || request.ProvinceIds.Length == 0))
        {
            errors.Add(ProvinceIdsKey, "Choose at least one target province.");
        }

        return errors.ToDictionary();
    }

    public static string FormatDate(DateOnly date) => date.ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    private static void CheckIdentity(FieldErrors errors, string? name, string? academicYear, string? description)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            errors.Add(NameKey, "Enter a campaign name.");
        }
        else if (name.Trim().Length > NameMaxLength)
        {
            errors.Add(NameKey, $"Campaign name must be {NameMaxLength} characters or fewer.");
        }

        if (string.IsNullOrWhiteSpace(academicYear))
        {
            errors.Add(AcademicYearKey, "Choose an academic year.");
        }
        else if (academicYear.Trim().Length > AcademicYearMaxLength)
        {
            errors.Add(AcademicYearKey, $"Academic year must be {AcademicYearMaxLength} characters or fewer.");
        }

        if (description is not null && description.Trim().Length > DescriptionMaxLength)
        {
            errors.Add(DescriptionKey, $"Description must be {DescriptionMaxLength} characters or fewer.");
        }
    }

    internal sealed class FieldErrors
    {
        private readonly Dictionary<string, List<string>> _errors = [];

        public void Add(string field, string message)
        {
            if (!_errors.TryGetValue(field, out var list))
            {
                _errors[field] = list = [];
            }

            list.Add(message);
        }

        public Dictionary<string, string[]> ToDictionary() =>
            _errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
    }
}
