using SharedKernel;
using Kind = Sessions.Domain.HostType;

namespace Sessions.Domain;

/// <summary>Who runs a session: an officer (a user) or a directory host (an alumnus or a partner).</summary>
public sealed record HostRef(HostType Type, Guid? HostId, string? UserId, string? UserName);

/// <summary>What a person fills in to create or change a session.</summary>
public sealed record SessionDetails(
    string Title,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    SessionFormat Format,
    string? Venue,
    string? MeetingLink,
    short? ProvinceId,
    string? Notes,
    string AssigneeId,
    string AssigneeName,
    HostRef Host);

/// <summary>What a copied session keeps: everything except when it happens and who is responsible or runs it.</summary>
public sealed record SessionTemplate(
    string Title,
    SessionFormat Format,
    string? Venue,
    string? MeetingLink,
    short? ProvinceId,
    string? Notes);

/// <summary>
/// One information session of a campaign: when, where, who is responsible, who runs it, how many
/// candidates are expected and, afterwards, how many came (females and males). Every change goes
/// through this class so a session can never hold an impossible combination.
/// The date, times, person responsible and host go together: a Planned or Done session has all of them, and only a
/// session that was copied and not yet scheduled (<see cref="SessionStatus.Unscheduled"/>), or cancelled before it
/// was scheduled, has none.
/// </summary>
public sealed class InformationSession
{
    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }

    public string Title { get; private set; } = string.Empty;
    /// <summary>Null until the session is scheduled.</summary>
    public DateOnly? Date { get; private set; }

    public TimeOnly? StartTime { get; private set; }
    public TimeOnly? EndTime { get; private set; }
    public SessionFormat Format { get; private set; }
    public string? Venue { get; private set; }
    public string? MeetingLink { get; private set; }

    /// <summary>One of the campaign's target provinces, when the session is tied to a place.</summary>
    public short? ProvinceId { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>Keycloak subject of the staff member responsible for the session.</summary>
    public string? AssigneeId { get; private set; }

    /// <summary>Display name at the time of assigning. Keycloak owns users, so this is a snapshot.</summary>
    public string? AssigneeName { get; private set; }

    /// <summary>Null until the session is scheduled.</summary>
    public HostType? HostType { get; private set; }

    /// <summary>The directory record, for an alumnus or a partner. Null for an officer.</summary>
    public Guid? HostId { get; private set; }

    /// <summary>The staff member's Keycloak subject, for an officer host. Null otherwise.</summary>
    public string? HostUserId { get; private set; }

    public string? HostUserName { get; private set; }

    public SessionStatus Status { get; private set; }
    public string? CancelReason { get; private set; }

    /// <summary>How many candidates are expected. Null until somebody says.</summary>
    public int? ExpectedCandidates { get; private set; }

    /// <summary>How many females came. Null until attendance is recorded (always set together with the males).</summary>
    public int? ActualFemale { get; private set; }

    public int? ActualMale { get; private set; }
    public DateTimeOffset? AttendanceRecordedAt { get; private set; }
    public string? AttendanceRecordedById { get; private set; }
    public string? AttendanceRecordedByName { get; private set; }

    public string CreatedById { get; private set; } = string.Empty;
    public string CreatedByName { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>PostgreSQL xmin. Detects two people saving the same session at once.</summary>
    public uint Version { get; private set; }

    /// <summary>Females plus males, once attendance is recorded.</summary>
    public int? ActualTotal => ActualFemale is { } f && ActualMale is { } m ? f + m : null;

    public bool HasAttendance => ActualFemale is not null;

    private InformationSession() { }

    public static Result<InformationSession> Create(
        Guid campaignId, SessionDetails details, string createdById, string createdByName, DateTimeOffset now)
    {
        var cleaned = Validate(details);
        if (cleaned.IsFailure)
        {
            return Result.Failure<InformationSession>(cleaned.Error);
        }

        var session = new InformationSession
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            Status = SessionStatus.Planned,
            CreatedById = createdById,
            CreatedByName = createdByName,
            CreatedAt = now,
        };
        session.Apply(cleaned.Value, now);
        return session;
    }

    /// <summary>
    /// Creates a session without a date, times, host or person responsible, for a copy of another campaign's sessions.
    /// The title, format, venue or link, province and notes are checked as for any session.
    /// </summary>
    public static Result<InformationSession> CreateUnscheduled(
        Guid campaignId, SessionTemplate template, string createdById, string createdByName, DateTimeOffset now)
    {
        var errors = new Dictionary<string, string[]>();
        var content = CheckContent(template.Title, template.Format, template.Venue, template.MeetingLink, template.Notes, errors);
        if (errors.Count > 0)
        {
            return Result.Failure<InformationSession>(SessionErrors.Invalid(errors));
        }

        return new InformationSession
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            Status = SessionStatus.Unscheduled,
            Title = content.Title,
            Format = template.Format,
            Venue = content.Venue,
            MeetingLink = content.MeetingLink,
            ProvinceId = template.ProvinceId,
            Notes = content.Notes,
            CreatedById = createdById,
            CreatedByName = createdByName,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    /// <summary>
    /// Gives an unscheduled session its date, times, person responsible and host, all at once, and makes it Planned.
    /// The details are checked exactly as for a new session.
    /// </summary>
    public Result Schedule(SessionDetails details, DateTimeOffset now)
    {
        if (Status != SessionStatus.Unscheduled)
        {
            return Result.Failure(SessionErrors.NotUnscheduled);
        }

        var cleaned = Validate(details);
        if (cleaned.IsFailure)
        {
            return Result.Failure(cleaned.Error);
        }

        Apply(cleaned.Value, now);
        Status = SessionStatus.Planned;
        return Result.Success();
    }

    /// <summary>Changes the details of a planned session.</summary>
    public Result Update(SessionDetails details, DateTimeOffset now)
    {
        if (Status != SessionStatus.Planned)
        {
            return Result.Failure(SessionErrors.NotPlanned);
        }

        var cleaned = Validate(details);
        if (cleaned.IsFailure)
        {
            return Result.Failure(cleaned.Error);
        }

        Apply(cleaned.Value, now);
        return Result.Success();
    }

    /// <summary>Calls off a planned session. A session that took place cannot be cancelled.</summary>
    public Result Cancel(string? reason, DateTimeOffset now)
    {
        if (Status == SessionStatus.Done)
        {
            return Result.Failure(SessionErrors.CannotCancelDone);
        }

        if (Status == SessionStatus.Cancelled)
        {
            return Result.Failure(SessionErrors.AlreadyCancelled);
        }

        var cleaned = SessionLimits.Clean(reason);
        if (cleaned is null)
        {
            return Result.Failure(SessionErrors.Invalid("reason", "Say why the session is cancelled."));
        }

        if (cleaned.Length > SessionLimits.CancelReasonMax)
        {
            return Result.Failure(SessionErrors.Invalid("reason", $"Use at most {SessionLimits.CancelReasonMax} characters."));
        }

        Status = SessionStatus.Cancelled;
        CancelReason = cleaned;
        UpdatedAt = now;
        return Result.Success();
    }

    /// <summary>Sets (or clears, with null) how many candidates are expected. Works until the session is cancelled.</summary>
    public Result SetExpected(int? expected, DateTimeOffset now)
    {
        if (Status == SessionStatus.Cancelled)
        {
            return Result.Failure(SessionErrors.AlreadyCancelled);
        }

        if (expected is < 0 or > SessionLimits.CountMax)
        {
            return Result.Failure(SessionErrors.Invalid("expected", $"Enter a whole number from 0 to {SessionLimits.CountMax}."));
        }

        ExpectedCandidates = expected;
        UpdatedAt = now;
        return Result.Success();
    }

    /// <summary>
    /// Records how many females and males came. Allowed once the session's date has arrived; it marks the
    /// session Done, and can be corrected later.
    /// </summary>
    public Result RecordAttendance(int female, int male, string recordedById, string recordedByName, DateTimeOffset now)
    {
        if (Status == SessionStatus.Cancelled)
        {
            return Result.Failure(SessionErrors.AlreadyCancelled);
        }

        if (Date is not { } date)
        {
            return Result.Failure(SessionErrors.NotScheduled);
        }

        var errors = new Dictionary<string, string[]>();
        if (female is < 0 or > SessionLimits.CountMax)
        {
            errors["female"] = [$"Enter a whole number from 0 to {SessionLimits.CountMax}."];
        }

        if (male is < 0 or > SessionLimits.CountMax)
        {
            errors["male"] = [$"Enter a whole number from 0 to {SessionLimits.CountMax}."];
        }

        if (errors.Count > 0)
        {
            return Result.Failure(SessionErrors.Invalid(errors));
        }

        if (date > SessionLimits.LocalToday(now))
        {
            return Result.Failure(SessionErrors.NotHeldYet);
        }

        ActualFemale = female;
        ActualMale = male;
        AttendanceRecordedAt = now;
        AttendanceRecordedById = recordedById;
        AttendanceRecordedByName = recordedByName;
        Status = SessionStatus.Done;
        UpdatedAt = now;
        return Result.Success();
    }

    private void Apply(SessionDetails d, DateTimeOffset now)
    {
        Title = d.Title;
        Date = d.Date;
        StartTime = d.StartTime;
        EndTime = d.EndTime;
        Format = d.Format;
        Venue = d.Venue;
        MeetingLink = d.MeetingLink;
        ProvinceId = d.ProvinceId;
        Notes = d.Notes;
        AssigneeId = d.AssigneeId;
        AssigneeName = d.AssigneeName;
        HostType = d.Host.Type;
        HostId = d.Host.HostId;
        HostUserId = d.Host.UserId;
        HostUserName = d.Host.UserName;
        UpdatedAt = now;
    }

    /// <summary>
    /// Tidies the text and returns the details to store, or every problem found. Public so a service can check a
    /// form (and merge its own findings) before it creates or changes anything.
    /// </summary>
    public static Result<SessionDetails> Validate(SessionDetails d)
    {
        var errors = new Dictionary<string, string[]>();

        var content = CheckContent(d.Title, d.Format, d.Venue, d.MeetingLink, d.Notes, errors);
        var (title, venue, link, notes) = content;

        if (d.EndTime <= d.StartTime)
        {
            errors["endTime"] = ["The end must be after the start."];
        }

        if (string.IsNullOrWhiteSpace(d.AssigneeId) || string.IsNullOrWhiteSpace(d.AssigneeName))
        {
            errors["assigneeId"] = ["Choose who is responsible for this session."];
        }

        var host = CheckHost(d.Host, errors);

        return errors.Count > 0
            ? Result.Failure<SessionDetails>(SessionErrors.Invalid(errors))
            : Result.Success(d with
            {
                Title = title!,
                Venue = venue,
                MeetingLink = link,
                Notes = notes,
                AssigneeId = d.AssigneeId.Trim(),
                AssigneeName = d.AssigneeName.Trim(),
                Host = host,
            });
    }

    /// <summary>What a session says about itself, without when or who: tidied, and every problem added to <paramref name="errors"/>.</summary>
    private static (string? Title, string? Venue, string? MeetingLink, string? Notes) CheckContent(
        string? rawTitle, SessionFormat format, string? rawVenue, string? rawLink, string? rawNotes, Dictionary<string, string[]> errors)
    {
        var title = SessionLimits.Clean(rawTitle);
        if (title is null)
        {
            errors["title"] = ["Enter a title."];
        }
        else if (title.Length > SessionLimits.TitleMax)
        {
            errors["title"] = [$"Use at most {SessionLimits.TitleMax} characters."];
        }

        if (!Enum.IsDefined(format))
        {
            errors["format"] = ["Choose in person, online or hybrid."];
        }

        var needsVenue = format is SessionFormat.InPerson or SessionFormat.Hybrid;
        var needsLink = format is SessionFormat.Online or SessionFormat.Hybrid;

        var venue = needsVenue ? SessionLimits.Clean(rawVenue) : null;
        if (needsVenue && venue is null)
        {
            errors["venue"] = ["Enter where the session takes place."];
        }
        else if (venue is { Length: > SessionLimits.VenueMax })
        {
            errors["venue"] = [$"Use at most {SessionLimits.VenueMax} characters."];
        }

        var link = needsLink ? rawLink?.Trim() : null;
        link = string.IsNullOrEmpty(link) ? null : link;
        if (needsLink && link is null)
        {
            errors["meetingLink"] = ["Enter the link people will join with."];
        }
        else if (link is not null && (link.Length > SessionLimits.MeetingLinkMax || !IsWebAddress(link)))
        {
            errors["meetingLink"] = [$"Enter a web address starting with https:// (at most {SessionLimits.MeetingLinkMax} characters)."];
        }

        // Notes keep their line breaks, so they are trimmed, not collapsed.
        var notes = string.IsNullOrWhiteSpace(rawNotes) ? null : rawNotes.Trim();
        if (notes is { Length: > SessionLimits.NotesMax })
        {
            errors["notes"] = [$"Use at most {SessionLimits.NotesMax} characters."];
        }

        return (title, venue, link, notes);
    }

    private static HostRef CheckHost(HostRef host, Dictionary<string, string[]> errors)
    {
        switch (host.Type)
        {
            case Kind.Officer:
                if (string.IsNullOrWhiteSpace(host.UserId) || string.IsNullOrWhiteSpace(host.UserName))
                {
                    errors["hostUserId"] = ["Choose the officer who runs the session."];
                }

                return new HostRef(Kind.Officer, null, host.UserId?.Trim(), host.UserName?.Trim());

            case Kind.Alumni or Kind.Partner:
                if (host.HostId is null || host.HostId == Guid.Empty)
                {
                    errors["hostId"] = [host.Type == Kind.Alumni ? "Choose the alumnus who runs the session." : "Choose the partner who runs the session."];
                }

                return new HostRef(host.Type, host.HostId, null, null);

            default:
                errors["hostType"] = ["Choose who runs the session: an officer, an alumnus or a partner."];
                return host;
        }
    }

    private static bool IsWebAddress(string text) =>
        Uri.TryCreate(text, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && !string.IsNullOrEmpty(uri.Host);
}
