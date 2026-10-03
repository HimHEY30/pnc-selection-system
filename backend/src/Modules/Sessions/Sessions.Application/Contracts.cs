namespace Sessions.Application;

// ---------- Hosts (the alumni and partner directory) ----------

/// <summary>What the form sends to add or change an alumnus or a partner. Type and partnerKind are names: "Alumni", "Partner", "Ngo", ...</summary>
public sealed record HostRequest(
    string? Type,
    string? Name,
    string? PartnerKind,
    string? ContactPerson,
    string? Phone,
    string? Email);

public sealed record HostDto(
    Guid Id,
    string Type,
    string Name,
    string? PartnerKind,
    string? ContactPerson,
    string? Phone,
    string? Email,
    bool IsActive);

// ---------- Sessions ----------

/// <summary>
/// What the form sends to create or change a session. Times are "HH:mm"; format and hostType are names
/// ("InPerson", "Online", "Hybrid"; "Officer", "Alumni", "Partner"). The names of the assignee and of an officer
/// host are not sent: the server looks them up, so nobody can put a made-up name on a session.
/// </summary>
public sealed record SessionRequest(
    string? Title,
    DateOnly? Date,
    string? StartTime,
    string? EndTime,
    string? Format,
    string? Venue,
    string? MeetingLink,
    short? ProvinceId,
    string? Notes,
    string? AssigneeId,
    string? HostType,
    Guid? HostId,
    string? HostUserId);

public sealed record CancelRequest(string? Reason);

/// <summary>How many candidates are expected. Null clears it.</summary>
public sealed record ExpectedRequest(int? Expected);

/// <summary>How many females and males came. Both are needed.</summary>
public sealed record AttendanceRequest(int? Female, int? Male);

public sealed record PersonDto(string Id, string Name);

public sealed record SessionProvinceDto(short Id, string Name);

/// <summary>Who runs a session. An officer has a user id; an alumnus or a partner has a directory id and the host's details.</summary>
public sealed record SessionHostDto(
    string Type,
    string Name,
    string? UserId,
    Guid? HostId,
    string? PartnerKind,
    string? Phone,
    string? Email,
    bool IsActive);

public sealed record AttendanceDto(
    int Female,
    int Male,
    int Total,
    DateTimeOffset RecordedAt,
    string RecordedByName);

public sealed record SessionDto(
    Guid Id,
    Guid CampaignId,
    string Title,
    // Date, times, assignee and host are null while the session is Unscheduled (or was cancelled before it was scheduled).
    DateOnly? Date,
    string? StartTime,
    string? EndTime,
    string Format,
    string? Venue,
    string? MeetingLink,
    SessionProvinceDto? Province,
    string? Notes,
    PersonDto? Assignee,
    SessionHostDto? Host,
    string Status,
    string? CancelReason,
    int? ExpectedCandidates,
    AttendanceDto? Attendance,
    string CreatedByName,
    DateTimeOffset UpdatedAt);

/// <summary>
/// The totals across a campaign's sessions that are not cancelled. <paramref name="Unscheduled"/> are copies that have
/// no date yet; they are part of <paramref name="Total"/> but not of <paramref name="Planned"/>.
/// </summary>
public sealed record SessionSummaryDto(
    int Total,
    int Planned,
    int Done,
    int Cancelled,
    int ExpectedCandidates,
    int ActualFemale,
    int ActualMale,
    int ActualTotal,
    int Unscheduled = 0);

/// <summary>A campaign's sessions, and what the page needs to show and change them.</summary>
public sealed record SessionListDto(
    Guid CampaignId,
    string CampaignName,
    string CampaignStatus,
    bool IsEditable,
    IReadOnlyList<SessionProvinceDto> TargetProvinces,
    IReadOnlyList<SessionDto> Sessions,
    SessionSummaryDto Summary);

/// <summary>A session on the "my sessions" page, with the campaign it belongs to.</summary>
public sealed record MySessionDto(string CampaignName, string CampaignStatus, SessionDto Session);
