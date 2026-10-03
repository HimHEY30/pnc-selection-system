namespace Sessions.Domain;

/// <summary>The sizes and the clock that the rules of a session share. The database checks repeat these.</summary>
public static class SessionLimits
{
    public const int TitleMax = 120;
    public const int VenueMax = 200;
    public const int MeetingLinkMax = 500;
    public const int NotesMax = 1000;
    public const int CancelReasonMax = 300;

    public const int HostNameMax = 120;
    public const int ContactMax = 120;
    public const int PhoneMax = 30;
    public const int EmailMax = 120;

    /// <summary>The biggest expected or actual number, for one box. A cap that catches a slipped finger, not a room size.</summary>
    public const int CountMax = 5000;

    /// <summary>Cambodia is UTC+7 all year. A session's date and times are on that clock.</summary>
    public static readonly TimeSpan LocalOffset = TimeSpan.FromHours(7);

    /// <summary>Today's date in Cambodia.</summary>
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
