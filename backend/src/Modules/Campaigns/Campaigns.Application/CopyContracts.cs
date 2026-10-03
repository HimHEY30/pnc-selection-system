namespace Campaigns.Application;

/// <summary>The parts of a campaign that can be copied into a new one. The key is what the API and the form use.</summary>
public static class CopyParts
{
    public const string Provinces = "Provinces";
    public const string Details = "Details";
    public const string EligibilityRules = "EligibilityRules";
    public const string InformationSessions = "InformationSessions";

    /// <summary>Every part, in the order they are copied: provinces first, because rules and sessions refer to them.</summary>
    public static readonly IReadOnlyList<string> All = [Provinces, Details, EligibilityRules, InformationSessions];
}

/// <summary>How one part went. A part that did not copy is reported, never dropped silently.</summary>
public static class CopyOutcomes
{
    public const string Copied = "Copied";
    public const string Partly = "Partly";
    public const string Failed = "Failed";
}

/// <summary>Which campaign to copy from and which parts, as the form sends them. Fields are nullable so missing values become field errors.</summary>
public sealed record CopyFromRequest(Guid? SourceCampaignId, string[]? Parts);

/// <summary>What happened to one part: how many items were copied, and what could not be.</summary>
public sealed record CopyPartResult(string Part, string Outcome, int Count, IReadOnlyList<string> Issues)
{
    public static CopyPartResult Copied(string part, int count) => new(part, CopyOutcomes.Copied, count, []);

    public static CopyPartResult Failed(string part, string issue) => new(part, CopyOutcomes.Failed, 0, [issue]);
}

/// <summary>What the source campaign has for one part, so the form can show real counts.</summary>
public sealed record CopyPartPreview(string Key, string Label, bool Available, int Count, string? Note);

public sealed record CopyPreviewDto(Guid SourceCampaignId, string Name, string AcademicYear, IReadOnlyList<CopyPartPreview> Parts);

/// <summary>Who is copying into which campaign. Names of people come from the signed-in user, never from the request.</summary>
public sealed record CopyContext(Guid SourceCampaignId, Guid TargetCampaignId, string UserSubject, string UserName);

/// <summary>
/// A part of a campaign that another module owns (eligibility rules, information sessions) and knows how to copy.
/// Published by the Campaigns module and implemented by those modules, so Campaigns never depends on them: the
/// dependency direction stays module to Campaigns. Each part saves in its own transaction.
/// </summary>
public interface ICampaignCopyPart
{
    /// <summary>One of <see cref="CopyParts"/>.</summary>
    string Key { get; }

    /// <summary>What the source campaign has to copy.</summary>
    Task<CopyPartPreview> DescribeAsync(Guid sourceCampaignId, CancellationToken ct);

    /// <summary>Copies the part into the (new, draft) target campaign. Never throws for a rule of the part: it reports.</summary>
    Task<CopyPartResult> CopyAsync(CopyContext context, CancellationToken ct);
}
