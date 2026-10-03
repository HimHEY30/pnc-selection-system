namespace Candidates.Application;

/// <summary>One level of an address as the form sends it. The code is empty when the name was typed by hand.</summary>
public sealed record PlaceDto(string? Code, string? Name);

public sealed record AddressDto(PlaceDto? Province, PlaceDto? District, PlaceDto? Commune, PlaceDto? Village);

/// <summary>
/// What the form sends to add or change a candidate. Gender is a name ("Female", "Male"). When the school is picked from
/// the directory only <see cref="SchoolHostId"/> counts and the server fills in the name; when it is typed,
/// <see cref="SchoolName"/> is the name and <see cref="SchoolHostId"/> is empty. <see cref="Version"/> is the version the
/// person was looking at, so a change made by somebody else in the meantime is noticed (needed to change, ignored to add).
/// </summary>
public sealed record CandidateRequest(
    string? NameKm,
    string? NameEn,
    string? Gender,
    DateOnly? DateOfBirth,
    string? Phone,
    AddressDto? Address,
    Guid? SchoolHostId,
    string? SchoolName,
    Guid? SessionId,
    bool? HasNgoSupport,
    string? NgoName,
    uint? Version);

/// <summary>The session a candidate came to. Status shows "Cancelled" if it was called off afterwards.</summary>
public sealed record CandidateSessionDto(Guid Id, string Title, DateOnly? Date, string Status);

public sealed record CandidateDto(
    Guid Id,
    Guid CampaignId,
    string NameKm,
    string NameEn,
    string Gender,
    DateOnly DateOfBirth,
    string Phone,
    AddressDto Address,
    Guid? SchoolHostId,
    string SchoolName,
    CandidateSessionDto? Session,
    bool HasNgoSupport,
    string? NgoName,
    string CreatedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    uint Version);

/// <summary>One page of a campaign's candidates, with what the page needs to show them.</summary>
public sealed record CandidateListDto(
    Guid CampaignId,
    string CampaignName,
    string CampaignStatus,
    /// <summary>False once the campaign is closed: candidates can still be read.</summary>
    bool CanChange,
    /// <summary>The provinces that the campaign's candidates are from, for the filter.</summary>
    IReadOnlyList<string> Provinces,
    IReadOnlyList<CandidateDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>What the list screen asks for. Anything left out means "no filter".</summary>
public sealed record CandidateListRequest(string? Search, string? Province, Guid? SessionId, bool? NgoSupport, int? Page, int? PageSize);
