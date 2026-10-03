namespace Candidates.Domain;

/// <summary>Who a candidate is. Stored as a smallint, so never reorder or renumber.</summary>
public enum Gender : short
{
    Female = 1,
    Male = 2,
}

/// <summary>The sizes and the clock that the rules of a candidate share. The database checks repeat these.</summary>
public static class CandidateLimits
{
    public const int NameMax = 100;
    public const int PlaceNameMax = 100;
    public const int PlaceCodeMax = 10;
    public const int SchoolNameMax = 150;
    public const int NgoNameMax = 150;

    public const int AgeMin = 10;
    public const int AgeMax = 80;

    /// <summary>A Cambodian number without its leading 0 has this many digits: 8 (such as 12 345 678) or 9 (such as 97 123 4567).</summary>
    public const int PhoneNationalDigitsMin = 8;
    public const int PhoneNationalDigitsMax = 9;

    /// <summary>Cambodia is UTC+7 all year. A birth date is on that clock, so is "today" when working out age.</summary>
    public static readonly TimeSpan LocalOffset = TimeSpan.FromHours(7);

    public static DateOnly LocalToday(DateTimeOffset now) => DateOnly.FromDateTime(now.ToOffset(LocalOffset).DateTime);

    /// <summary>Trims the ends and turns every run of spaces into one. Null and blank become null.</summary>
    public static string? Clean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        return string.Join(' ', text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}
