using System.Globalization;

namespace Sessions.Application;

/// <summary>Turns the names a form sends ("InPerson", "09:30") into values, and back. Anything unknown is refused, never guessed.</summary>
internal static class Names
{
    private static readonly string[] TimeFormats = ["HH:mm", "H:mm", "HH:mm:ss"];

    /// <summary>The enum value for a name such as "Ngo" (any case), or null when it is blank, a number or unknown.</summary>
    public static TEnum? ParseEnum<TEnum>(string? text) where TEnum : struct, Enum
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed) || char.IsDigit(trimmed[0]) || trimmed[0] == '-')
        {
            return null;
        }

        return Enum.TryParse<TEnum>(trimmed, ignoreCase: true, out var value) && Enum.IsDefined(value) ? value : null;
    }

    public static TimeOnly? ParseTime(string? text) =>
        TimeOnly.TryParseExact(text?.Trim(), TimeFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var time) ? time : null;

    public static string Time(TimeOnly time) => time.ToString("HH:mm", CultureInfo.InvariantCulture);
}
