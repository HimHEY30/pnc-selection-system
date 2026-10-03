using System.Text.Json;
using Campaigns.Application;
using Campaigns.Domain;
using Identity.Application;
using Identity.Domain;
using Sessions.Domain;
using SharedKernel;

namespace Sessions.Application;

public interface ISessionService
{
    /// <summary>A campaign's sessions in date order, with totals and what the page needs to show them.</summary>
    Task<Result<SessionListDto>> ListAsync(Guid campaignId, CancellationToken ct);

    Task<Result<SessionDto>> GetAsync(Guid campaignId, Guid sessionId, CancellationToken ct);

    Task<Result<SessionDto>> CreateAsync(Guid campaignId, SessionRequest request, CancellationToken ct);

    /// <summary>Changes a planned session's details.</summary>
    Task<Result<SessionDto>> UpdateAsync(Guid campaignId, Guid sessionId, SessionRequest request, CancellationToken ct);

    Task<Result<SessionDto>> CancelAsync(Guid campaignId, Guid sessionId, CancelRequest request, CancellationToken ct);

    /// <summary>Sets (or clears) how many candidates are expected.</summary>
    Task<Result<SessionDto>> SetExpectedAsync(Guid campaignId, Guid sessionId, ExpectedRequest request, CancellationToken ct);

    /// <summary>Records how many females and males came. Marks the session Done.</summary>
    Task<Result<SessionDto>> RecordAttendanceAsync(Guid campaignId, Guid sessionId, AttendanceRequest request, CancellationToken ct);

    /// <summary>The sessions the caller is responsible for or runs, in every campaign, soonest first.</summary>
    Task<Result<IReadOnlyList<MySessionDto>>> ListMineAsync(CancellationToken ct);
}

/// <summary>
/// Information sessions of a campaign: create, change, cancel, and the numbers (expected, then actual females and
/// males). Every change is audited. Which role may call what is decided by the API; the rules about
/// when a session can change are here.
/// </summary>
public sealed class SessionService : ISessionService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ISessionRepository _repository;
    private readonly ICampaignSetupGateway _campaigns;
    private readonly ICurrentUserService _currentUser;
    private readonly IStaffDirectory _staff;
    private readonly IClock _clock;

    public SessionService(
        ISessionRepository repository,
        ICampaignSetupGateway campaigns,
        ICurrentUserService currentUser,
        IStaffDirectory staff,
        IClock clock)
    {
        _repository = repository;
        _campaigns = campaigns;
        _currentUser = currentUser;
        _staff = staff;
        _clock = clock;
    }

    // ---------- Reading ----------

    public async Task<Result<SessionListDto>> ListAsync(Guid campaignId, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<SessionListDto>(CampaignErrors.NotFound);
        }

        var sessions = await _repository.ListSessionsAsync(campaignId, ct);
        var hosts = await HostsOfAsync(sessions, ct);
        var dtos = sessions.Select(s => ToDto(s, context, hosts)).ToList();

        return new SessionListDto(
            campaignId,
            context.Name,
            context.Status,
            CanChange(context),
            context.TargetProvinces.Select(ToProvince).ToList(),
            dtos,
            Summarise(sessions));
    }

    public async Task<Result<SessionDto>> GetAsync(Guid campaignId, Guid sessionId, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<SessionDto>(CampaignErrors.NotFound);
        }

        var session = await _repository.GetSessionAsync(campaignId, sessionId, ct);
        return session is null
            ? Result.Failure<SessionDto>(SessionErrors.NotFound)
            : await ToDtoAsync(session, context, ct);
    }

    public async Task<Result<IReadOnlyList<MySessionDto>>> ListMineAsync(CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<IReadOnlyList<MySessionDto>>(SessionErrors.NoUser);
        }

        var sessions = await _repository.ListForUserAsync(user.Subject, ct);
        var hosts = await HostsOfAsync(sessions, ct);

        var contexts = new Dictionary<Guid, CampaignSetupContext?>();
        var mine = new List<MySessionDto>();
        foreach (var session in sessions)
        {
            if (!contexts.TryGetValue(session.CampaignId, out var context))
            {
                contexts[session.CampaignId] = context = await _campaigns.GetContextAsync(session.CampaignId, ct);
            }

            if (context is null)
            {
                continue;
            }

            mine.Add(new MySessionDto(context.Name, context.Status, ToDto(session, context, hosts)));
        }

        return Result.Success<IReadOnlyList<MySessionDto>>(mine);
    }

    // ---------- Creating and changing ----------

    public async Task<Result<SessionDto>> CreateAsync(Guid campaignId, SessionRequest request, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<SessionDto>(SessionErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<SessionDto>(CampaignErrors.NotFound);
        }

        if (!CanChange(context))
        {
            return Result.Failure<SessionDto>(SessionErrors.CampaignClosed);
        }

        var prepared = await PrepareAsync(context, request, existing: null, user, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<SessionDto>(prepared.Error);
        }

        var created = InformationSession.Create(campaignId, prepared.Value.Details, user.Subject, user.DisplayName, _clock.UtcNow);
        if (created.IsFailure)
        {
            return Result.Failure<SessionDto>(created.Error);
        }

        var session = created.Value;
        _repository.AddSession(session);
        AddAudit(session, AuditAction.Created, null, Snapshot(session), user);

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return Result.Failure<SessionDto>(saved.Error);
        }

        var step = await RefreshStepAsync(context, ct);
        return step.IsFailure ? Result.Failure<SessionDto>(step.Error) : await ToDtoAsync(session, context, ct);
    }

    public async Task<Result<SessionDto>> UpdateAsync(Guid campaignId, Guid sessionId, SessionRequest request, CancellationToken ct)
    {
        var opened = await OpenAsync(campaignId, sessionId, requireChangeableCampaign: true, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<SessionDto>(opened.Error);
        }

        var (context, session, user) = opened.Value;

        // Saving the form of an unscheduled session schedules it: it needs everything, and becomes Planned.
        var scheduling = session.Status == SessionStatus.Unscheduled;
        if (session.Status != SessionStatus.Planned && !scheduling)
        {
            return Result.Failure<SessionDto>(SessionErrors.NotPlanned);
        }

        var prepared = await PrepareAsync(context, request, session, user, ct);
        if (prepared.IsFailure)
        {
            return Result.Failure<SessionDto>(prepared.Error);
        }

        var before = Snapshot(session);
        var updated = scheduling
            ? session.Schedule(prepared.Value.Details, _clock.UtcNow)
            : session.Update(prepared.Value.Details, _clock.UtcNow);
        if (updated.IsFailure)
        {
            return Result.Failure<SessionDto>(updated.Error);
        }

        var after = Snapshot(session);
        if (before == after)
        {
            return await ToDtoAsync(session, context, ct);
        }

        AddAudit(session, AuditAction.Updated, before, after, user);

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return Result.Failure<SessionDto>(saved.Error);
        }

        // Scheduling the first copy is what completes the step, so it is refreshed here, not only on create and cancel.
        var step = scheduling ? await RefreshStepAsync(context, ct) : Result.Success();
        return step.IsFailure ? Result.Failure<SessionDto>(step.Error) : await ToDtoAsync(session, context, ct);
    }

    public async Task<Result<SessionDto>> CancelAsync(Guid campaignId, Guid sessionId, CancelRequest request, CancellationToken ct)
    {
        var opened = await OpenAsync(campaignId, sessionId, requireChangeableCampaign: true, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<SessionDto>(opened.Error);
        }

        var (context, session, user) = opened.Value;
        var before = Snapshot(session);
        var cancelled = session.Cancel(request.Reason, _clock.UtcNow);
        if (cancelled.IsFailure)
        {
            return Result.Failure<SessionDto>(cancelled.Error);
        }

        AddAudit(session, AuditAction.Cancelled, before, Snapshot(session), user);

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return Result.Failure<SessionDto>(saved.Error);
        }

        var step = await RefreshStepAsync(context, ct);
        return step.IsFailure ? Result.Failure<SessionDto>(step.Error) : await ToDtoAsync(session, context, ct);
    }

    // ---------- The numbers ----------

    public async Task<Result<SessionDto>> SetExpectedAsync(Guid campaignId, Guid sessionId, ExpectedRequest request, CancellationToken ct)
    {
        // The numbers are not part of setting a campaign up, so they stay open while the campaign runs and after it closes.
        var opened = await OpenAsync(campaignId, sessionId, requireChangeableCampaign: false, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<SessionDto>(opened.Error);
        }

        var (context, session, user) = opened.Value;
        var before = Snapshot(session);
        var set = session.SetExpected(request.Expected, _clock.UtcNow);
        if (set.IsFailure)
        {
            return Result.Failure<SessionDto>(set.Error);
        }

        var after = Snapshot(session);
        if (before == after)
        {
            return await ToDtoAsync(session, context, ct);
        }

        AddAudit(session, AuditAction.ExpectedSet, before, after, user);

        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure ? Result.Failure<SessionDto>(saved.Error) : await ToDtoAsync(session, context, ct);
    }

    public async Task<Result<SessionDto>> RecordAttendanceAsync(
        Guid campaignId, Guid sessionId, AttendanceRequest request, CancellationToken ct)
    {
        var opened = await OpenAsync(campaignId, sessionId, requireChangeableCampaign: false, ct);
        if (opened.IsFailure)
        {
            return Result.Failure<SessionDto>(opened.Error);
        }

        var (context, session, user) = opened.Value;

        var missing = new Dictionary<string, string[]>();
        if (request.Female is null)
        {
            missing["female"] = ["Enter how many females came."];
        }

        if (request.Male is null)
        {
            missing["male"] = ["Enter how many males came."];
        }

        if (missing.Count > 0)
        {
            return Result.Failure<SessionDto>(SessionErrors.Invalid(missing));
        }

        var before = Snapshot(session);
        var recorded = session.RecordAttendance(request.Female!.Value, request.Male!.Value, user.Subject, user.DisplayName, _clock.UtcNow);
        if (recorded.IsFailure)
        {
            return Result.Failure<SessionDto>(recorded.Error);
        }

        AddAudit(session, AuditAction.AttendanceRecorded, before, Snapshot(session), user);

        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure ? Result.Failure<SessionDto>(saved.Error) : await ToDtoAsync(session, context, ct);
    }

    // ---------- Helpers ----------

    private sealed record Opened(CampaignSetupContext Context, InformationSession Session, AuthenticatedUser User)
    {
        public void Deconstruct(out CampaignSetupContext context, out InformationSession session, out AuthenticatedUser user)
        {
            context = Context;
            session = Session;
            user = User;
        }
    }

    /// <summary>Finds the campaign and the session for a change, and checks the caller is signed in and the campaign allows it.</summary>
    private async Task<Result<Opened>> OpenAsync(Guid campaignId, Guid sessionId, bool requireChangeableCampaign, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<Opened>(SessionErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<Opened>(CampaignErrors.NotFound);
        }

        if (requireChangeableCampaign && !CanChange(context))
        {
            return Result.Failure<Opened>(SessionErrors.CampaignClosed);
        }

        var session = await _repository.GetSessionAsync(campaignId, sessionId, ct);
        return session is null
            ? Result.Failure<Opened>(SessionErrors.NotFound)
            : new Opened(context, session, user);
    }

    /// <summary>Sessions can be set up and changed while a campaign is a draft or running, not once it is closed.</summary>
    private static bool CanChange(CampaignSetupContext context) =>
        !string.Equals(context.Status, nameof(CampaignStatus.Closed), StringComparison.Ordinal);

    private sealed record Prepared(SessionDetails Details);

    /// <summary>
    /// Reads a form into checked details: parses the names, looks up the people and the host, applies the domain's
    /// rules, and makes sure the host is free. Every problem is reported at once, per field.
    /// </summary>
    private async Task<Result<Prepared>> PrepareAsync(
        CampaignSetupContext context, SessionRequest request, InformationSession? existing, AuthenticatedUser user, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Date is null)
        {
            errors["date"] = ["Choose the date."];
        }

        var start = Names.ParseTime(request.StartTime);
        if (start is null)
        {
            errors["startTime"] = ["Enter a start time such as 09:00."];
        }

        var end = Names.ParseTime(request.EndTime);
        if (end is null)
        {
            errors["endTime"] = ["Enter an end time such as 11:00."];
        }

        var format = Names.ParseEnum<SessionFormat>(request.Format);
        if (format is null)
        {
            errors["format"] = ["Choose in person, online or hybrid."];
        }

        var hostType = Names.ParseEnum<HostType>(request.HostType);
        if (hostType is null)
        {
            errors["hostType"] = ["Choose who runs the session: an officer, an alumnus or a partner."];
        }

        if (request.ProvinceId is { } province
            && province != existing?.ProvinceId
            && context.TargetProvinces.All(p => p.Id != province.ToString()))
        {
            errors["provinceId"] = ["Choose one of the campaign's target provinces."];
        }

        var staff = new StaffLookup(_staff, user);

        // The person responsible.
        string assigneeName = string.Empty;
        if (!string.IsNullOrWhiteSpace(request.AssigneeId))
        {
            var found = await staff.NameOfAsync(request.AssigneeId.Trim(), ct);
            if (found.IsFailure)
            {
                return Result.Failure<Prepared>(found.Error);
            }

            if (found.Value is null)
            {
                errors["assigneeId"] = ["Choose a staff member from the list."];
            }
            else
            {
                assigneeName = found.Value;
            }
        }

        // Who runs it.
        var host = new HostRef(hostType ?? HostType.Officer, null, null, null);
        string hostName = string.Empty;
        switch (hostType)
        {
            case HostType.Officer when !string.IsNullOrWhiteSpace(request.HostUserId):
            {
                var userId = request.HostUserId.Trim();
                var found = await staff.NameOfAsync(userId, ct);
                if (found.IsFailure)
                {
                    return Result.Failure<Prepared>(found.Error);
                }

                if (found.Value is null)
                {
                    errors["hostUserId"] = ["Choose a staff member from the list."];
                }
                else
                {
                    host = new HostRef(HostType.Officer, null, userId, found.Value);
                    hostName = found.Value;
                }

                break;
            }

            case HostType.Alumni or HostType.Partner when request.HostId is { } hostId && hostId != Guid.Empty:
            {
                var record = await _repository.GetHostAsync(hostId, ct);
                if (record is null)
                {
                    errors["hostId"] = ["This host no longer exists. Choose another."];
                }
                else if (record.Type != hostType)
                {
                    errors["hostId"] = [hostType == HostType.Alumni ? "Choose an alumnus from the list." : "Choose a partner from the list."];
                }
                else if (!record.IsActive && existing?.HostId != record.Id)
                {
                    errors["hostId"] = [SessionErrors.HostInactive.Message];
                }
                else
                {
                    host = new HostRef(record.Type, record.Id, null, null);
                    hostName = record.Name;
                }

                break;
            }

            case not null:
                // Nothing chosen yet: the domain says what is missing.
                host = new HostRef(hostType.Value, request.HostId, request.HostUserId, null);
                break;
        }

        // The domain checks the rest. Stand-ins keep it from reporting what is already known to be wrong.
        var details = new SessionDetails(
            request.Title ?? string.Empty,
            request.Date ?? default,
            start ?? new TimeOnly(0, 0),
            end ?? new TimeOnly(23, 59),
            format ?? SessionFormat.Online,
            request.Venue,
            request.MeetingLink,
            request.ProvinceId,
            request.Notes,
            request.AssigneeId ?? string.Empty,
            assigneeName,
            host);

        var validated = InformationSession.Validate(details);
        if (validated.IsFailure)
        {
            foreach (var (field, messages) in validated.Error.FieldErrors!)
            {
                // A box that is already marked, or that depends on one that is, is not marked twice.
                var skip = (field == "endTime" && start is null)
                    || (field is "venue" or "meetingLink" && format is null)
                    || (field == "assigneeId" && errors.ContainsKey("assigneeId"))
                    || (field is "hostUserId" or "hostId" or "hostType" && errors.ContainsKey(field))
                    || (field is "hostUserId" or "hostId" && hostType is null);
                if (!skip)
                {
                    errors.TryAdd(field, messages);
                }
            }
        }

        if (errors.Count > 0)
        {
            return Result.Failure<Prepared>(SessionErrors.Invalid(errors));
        }

        // The same host cannot run two sessions at once, in this campaign or any other.
        var clash = await _repository.FindClashAsync(
            existing?.Id, validated.Value.Date, validated.Value.StartTime, validated.Value.EndTime, validated.Value.Host, ct);
        return clash is not null
            ? Result.Failure<Prepared>(SessionErrors.HostBusy(hostName))
            : new Prepared(validated.Value);
    }

    /// <summary>Asks the staff directory at most once per request, and always knows the caller without asking.</summary>
    private sealed class StaffLookup
    {
        private readonly IStaffDirectory _directory;
        private readonly AuthenticatedUser _user;
        private Result<IReadOnlyList<StaffMember>>? _listed;

        public StaffLookup(IStaffDirectory directory, AuthenticatedUser user)
        {
            _directory = directory;
            _user = user;
        }

        /// <summary>The person's name, null when no such staff member, or a failure when the directory cannot be asked.</summary>
        public async Task<Result<string?>> NameOfAsync(string id, CancellationToken ct)
        {
            if (id == _user.Subject)
            {
                return Result.Success<string?>(_user.DisplayName);
            }

            _listed ??= await _directory.ListAsync(ct);
            if (_listed.IsFailure)
            {
                return Result.Failure<string?>(_listed.Error);
            }

            return Result.Success<string?>(_listed.Value.FirstOrDefault(s => s.Id == id)?.Name);
        }
    }

    /// <summary>
    /// Keeps Step 3's status true to the sessions: complete once there is a scheduled session (planned or done), in
    /// progress when there are only cancelled or unscheduled ones (a copy still has to be scheduled), not started when
    /// there are none. The campaign only lets a draft change its steps, so a running campaign is left alone.
    /// </summary>
    private async Task<Result> RefreshStepAsync(CampaignSetupContext context, CancellationToken ct)
    {
        if (!context.IsEditable)
        {
            return Result.Success();
        }

        var sessions = await _repository.ListSessionsAsync(context.CampaignId, ct);
        var status = sessions.Any(s => s.Status is SessionStatus.Planned or SessionStatus.Done)
            ? StepStatus.Complete
            : sessions.Count > 0 ? StepStatus.InProgress : StepStatus.NotStarted;

        return context.StepStatuses.GetValueOrDefault(SetupStepKey.InformationSessions) == status
            ? Result.Success()
            : await _campaigns.SetStepStatusAsync(context.CampaignId, SetupStepKey.InformationSessions, status, ct);
    }

    private async Task<IReadOnlyDictionary<Guid, SessionHost>> HostsOfAsync(IReadOnlyCollection<InformationSession> sessions, CancellationToken ct) =>
        await _repository.GetHostsAsync(sessions.Where(s => s.HostId is not null).Select(s => s.HostId!.Value).Distinct().ToList(), ct);

    private async Task<SessionDto> ToDtoAsync(InformationSession session, CampaignSetupContext context, CancellationToken ct) =>
        ToDto(session, context, await HostsOfAsync([session], ct));

    private static SessionDto ToDto(InformationSession s, CampaignSetupContext context, IReadOnlyDictionary<Guid, SessionHost> hosts)
    {
        SessionProvinceDto? province = null;
        if (s.ProvinceId is { } id)
        {
            var name = context.TargetProvinces.FirstOrDefault(p => p.Id == id.ToString())?.Name ?? id.ToString();
            province = new SessionProvinceDto(id, name);
        }

        return SessionMapper.ToDto(s, province, s.HostId is { } hostId ? hosts.GetValueOrDefault(hostId) : null);
    }

    private static SessionProvinceDto ToProvince(TargetProvince p) => new(short.Parse(p.Id), p.Name);

    private static SessionSummaryDto Summarise(IReadOnlyList<InformationSession> sessions)
    {
        var counted = sessions.Where(s => s.Status != SessionStatus.Cancelled).ToList();
        var female = counted.Sum(s => s.ActualFemale ?? 0);
        var male = counted.Sum(s => s.ActualMale ?? 0);
        return new SessionSummaryDto(
            counted.Count,
            counted.Count(s => s.Status == SessionStatus.Planned),
            counted.Count(s => s.Status == SessionStatus.Done),
            sessions.Count - counted.Count,
            counted.Sum(s => s.ExpectedCandidates ?? 0),
            female,
            male,
            female + male,
            counted.Count(s => s.Status == SessionStatus.Unscheduled));
    }

    private void AddAudit(InformationSession session, AuditAction action, string? before, string? after, AuthenticatedUser user) =>
        _repository.AddAudit(SessionAuditEntry.Record(
            session.CampaignId, AuditEntity.Session, session.Id, action, before, after, user.Subject, user.DisplayName, _clock.UtcNow));

    /// <summary>What an audit line keeps of a session: everything a person can change or record.</summary>
    internal static string Snapshot(InformationSession s) => JsonSerializer.Serialize(
        new
        {
            title = s.Title,
            date = s.Date?.ToString("yyyy-MM-dd"),
            startTime = Names.Time(s.StartTime),
            endTime = Names.Time(s.EndTime),
            format = s.Format.ToString(),
            venue = s.Venue,
            meetingLink = s.MeetingLink,
            provinceId = s.ProvinceId,
            notes = s.Notes,
            assigneeId = s.AssigneeId,
            assigneeName = s.AssigneeName,
            hostType = s.HostType?.ToString(),
            hostId = s.HostId,
            hostUserId = s.HostUserId,
            hostUserName = s.HostUserName,
            status = s.Status.ToString(),
            cancelReason = s.CancelReason,
            expectedCandidates = s.ExpectedCandidates,
            actualFemale = s.ActualFemale,
            actualMale = s.ActualMale,
        },
        Json);
}
