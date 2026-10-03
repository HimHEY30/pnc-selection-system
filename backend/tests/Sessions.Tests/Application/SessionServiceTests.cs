using Campaigns.Application;
using Campaigns.Domain;
using Identity.Domain;
using Sessions.Application;
using Sessions.Domain;
using Sessions.Tests.Support;
using SharedKernel;
using static Sessions.Tests.Support.SessionHarness;

namespace Sessions.Tests.Application;

public sealed class SessionServiceTests
{
    private readonly SessionHarness _h = new();

    private static string[] Errors(Result result, string field)
    {
        Assert.True(result.IsFailure, "expected a failure");
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    private Task<Result<SessionDto>> TryCreate(SessionRequest request) =>
        _h.Service.CreateAsync(_h.CampaignId, request, CancellationToken.None);

    // ---------- Create ----------

    [Fact]
    public async Task Create_makes_a_planned_session_assigned_to_the_caller_and_run_by_an_officer()
    {
        var session = await _h.CreateAsync();

        Assert.Equal(_h.CampaignId, session.CampaignId);
        Assert.Equal("Planned", session.Status);
        Assert.Equal("Open day at Kampong Cham High School", session.Title);
        Assert.Equal(new DateOnly(2027, 3, 20), session.Date);
        Assert.Equal("09:00", session.StartTime);
        Assert.Equal("11:00", session.EndTime);
        Assert.Equal("InPerson", session.Format);
        Assert.Equal(new PersonDto("manager-1", "Dara Manager"), session.Assignee);
        Assert.Equal("Officer", session.Host.Type);
        Assert.Equal("officer-1", session.Host.UserId);
        Assert.Equal("Sokha Officer", session.Host.Name);
        Assert.Null(session.ExpectedCandidates);
        Assert.Null(session.Attendance);
        Assert.Equal("Dara Manager", session.CreatedByName);
        Assert.Single(_h.Repository.Sessions);
    }

    [Fact]
    public async Task Create_can_assign_the_session_to_an_officer()
    {
        var session = await _h.CreateAsync(Request(assignee: "officer-2"));

        Assert.Equal(new PersonDto("officer-2", "Vanna Officer"), session.Assignee);
    }

    [Fact]
    public async Task Create_takes_the_assignees_name_from_the_directory_never_from_the_form()
    {
        var session = await _h.CreateAsync(Request(assignee: "officer-1"));

        Assert.Equal("Sokha Officer", session.Assignee.Name);
        Assert.Equal(1, _h.Staff.Calls);
    }

    [Fact]
    public async Task Create_when_the_caller_assigns_themselves_does_not_need_the_directory()
    {
        _h.Staff.Staff = null;

        var session = await _h.CreateAsync(Request(assignee: "manager-1", hostType: "Alumni", hostId: _h.Alumnus.Id, hostUserId: null));

        Assert.Equal("manager-1", session.Assignee.Id);
        Assert.Equal(0, _h.Staff.Calls);
    }

    [Fact]
    public async Task Create_can_be_run_by_an_alumnus_or_a_partner_from_the_directory()
    {
        var alumni = await _h.CreateAsync(_h.AlumnusRequest());
        var partner = await _h.CreateAsync(_h.PartnerRequest(start: "13:00", end: "15:00"));

        Assert.Equal("Alumni", alumni.Host.Type);
        Assert.Equal(_h.Alumnus.Id, alumni.Host.HostId);
        Assert.Equal("Chenda Sok", alumni.Host.Name);
        Assert.Null(alumni.Host.UserId);
        Assert.Equal("Partner", partner.Host.Type);
        Assert.Equal("Ngo", partner.Host.PartnerKind);
        Assert.Equal("Hope NGO", partner.Host.Name);
    }

    [Fact]
    public async Task Create_in_a_target_province_shows_the_provinces_name()
    {
        var session = await _h.CreateAsync(Request(province: 17));

        Assert.Equal(new SessionProvinceDto(17, "Siem Reap"), session.Province);
    }

    [Fact]
    public async Task Create_in_a_province_the_campaign_does_not_target_is_refused()
    {
        var result = await TryCreate(Request(province: 5));

        Assert.Equal(["Choose one of the campaign's target provinces."], Errors(result, "provinceId"));
    }

    [Fact]
    public async Task Create_audits_the_new_session_with_who_made_it()
    {
        var session = await _h.CreateAsync();

        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditEntity.Session, audit.Entity);
        Assert.Equal(AuditAction.Created, audit.Action);
        Assert.Equal(session.Id, audit.EntityId);
        Assert.Equal(_h.CampaignId, audit.CampaignId);
        Assert.Null(audit.BeforeJson);
        Assert.Contains("Open day at Kampong Cham High School", audit.AfterJson);
        Assert.Equal("manager-1", audit.ChangedById);
        Assert.Equal("Dara Manager", audit.ChangedByName);
    }

    [Fact]
    public async Task Create_reports_every_problem_at_once_per_field()
    {
        var result = await TryCreate(new SessionRequest(" ", null, "9am", null, null, null, null, null, null, null, null, null, null));

        Assert.True(result.IsFailure);
        var fields = result.Error.FieldErrors!;
        Assert.Equal(
            ["date", "endTime", "format", "hostType", "startTime", "title"],
            fields.Keys.Order(StringComparer.Ordinal).Where(k => k != "assigneeId").ToArray());
        Assert.Contains("assigneeId", fields.Keys);
        Assert.Empty(_h.Repository.Sessions);
        Assert.Empty(_h.Repository.Audit);
    }

    [Theory]
    [InlineData("11:00", "09:00")]
    [InlineData("10:00", "10:00")]
    public async Task Create_needs_the_end_after_the_start(string start, string end)
    {
        var result = await TryCreate(Request(start: start, end: end));

        Assert.Equal(["The end must be after the start."], Errors(result, "endTime"));
    }

    [Theory]
    [InlineData("InPerson", null, null, "venue")]
    [InlineData("Online", null, null, "meetingLink")]
    [InlineData("Hybrid", "Hall", null, "meetingLink")]
    [InlineData("Hybrid", null, "https://meet.example.org/x", "venue")]
    public async Task Create_needs_what_the_format_needs(string format, string? venue, string? link, string missing)
    {
        var result = await TryCreate(Request(format: format, venue: venue, link: link));

        Assert.Contains(missing, result.Error.FieldErrors!.Keys);
    }

    [Fact]
    public async Task Create_does_not_also_complain_about_the_venue_when_the_format_was_not_chosen()
    {
        var result = await TryCreate(Request(format: "", venue: null));

        Assert.Contains("format", result.Error.FieldErrors!.Keys);
        Assert.DoesNotContain("venue", result.Error.FieldErrors.Keys);
        Assert.DoesNotContain("meetingLink", result.Error.FieldErrors.Keys);
    }

    [Theory]
    [InlineData("")]
    [InlineData("nobody")]
    public async Task Create_refuses_an_assignee_who_is_not_staff(string assignee)
    {
        var result = await TryCreate(Request(assignee: assignee));

        Assert.Contains("assigneeId", result.Error.FieldErrors!.Keys);
    }

    [Fact]
    public async Task Create_refuses_an_officer_host_who_is_not_staff()
    {
        var result = await TryCreate(Request(hostUserId: "nobody"));

        Assert.Equal(["Choose a staff member from the list."], Errors(result, "hostUserId"));
    }

    [Fact]
    public async Task Create_needs_the_directory_when_the_assignee_is_someone_else_and_says_so_when_it_is_down()
    {
        _h.Staff.Staff = null;

        var result = await TryCreate(Request(assignee: "officer-1"));

        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Unavailable, result.Error.Type);
        Assert.Empty(_h.Repository.Sessions);
    }

    [Fact]
    public async Task Create_refuses_a_host_that_is_missing_the_wrong_type_or_switched_off()
    {
        var missing = await TryCreate(Request(hostType: "Alumni", hostId: Guid.NewGuid(), hostUserId: null));
        var wrongType = await TryCreate(Request(hostType: "Partner", hostId: _h.Alumnus.Id, hostUserId: null));
        _h.Partner.SetActive(false, _h.Clock.UtcNow);
        var off = await TryCreate(_h.PartnerRequest());
        var none = await TryCreate(Request(hostType: "Alumni", hostId: null, hostUserId: null));

        Assert.Equal(["This host no longer exists. Choose another."], Errors(missing, "hostId"));
        Assert.Equal(["Choose a partner from the list."], Errors(wrongType, "hostId"));
        Assert.Equal([SessionErrors.HostInactive.Message], Errors(off, "hostId"));
        Assert.Equal(["Choose the alumnus who runs the session."], Errors(none, "hostId"));
    }

    [Fact]
    public async Task Create_refuses_a_host_who_already_runs_a_session_at_an_overlapping_time()
    {
        await _h.CreateAsync(Request(start: "09:00", end: "11:00"));

        var result = await TryCreate(Request(start: "10:30", end: "12:00"));

        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Conflict, result.Error.Type);
        Assert.Equal("Sokha Officer already runs another session at that time.", result.Error.Message);
        Assert.Single(_h.Repository.Sessions);
    }

    [Theory]
    [InlineData("11:00", "12:00")]
    [InlineData("08:00", "09:00")]
    [InlineData("13:00", "14:00")]
    public async Task Sessions_that_only_touch_or_do_not_meet_do_not_clash(string start, string end)
    {
        await _h.CreateAsync(Request(start: "09:00", end: "11:00"));

        var result = await TryCreate(Request(start: start, end: end));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task A_clash_only_counts_for_the_same_host_on_the_same_day()
    {
        await _h.CreateAsync(Request(start: "09:00", end: "11:00"));

        var otherOfficer = await TryCreate(Request(hostUserId: "officer-2"));
        var otherDay = await TryCreate(Request(date: new DateOnly(2027, 3, 21)));
        var alumnus = await TryCreate(_h.AlumnusRequest());

        Assert.True(otherOfficer.IsSuccess);
        Assert.True(otherDay.IsSuccess);
        Assert.True(alumnus.IsSuccess);
    }

    [Fact]
    public async Task A_clash_is_found_across_campaigns()
    {
        var other = _h.AddCampaign();
        await _h.CreateAsync(_h.PartnerRequest(), other.CampaignId);

        var result = await TryCreate(_h.PartnerRequest(start: "10:00", end: "10:30"));

        Assert.Equal("sessions.host_busy", result.Error.Code);
        Assert.Contains("Hope NGO", result.Error.Message);
    }

    [Fact]
    public async Task A_cancelled_session_does_not_block_its_host()
    {
        var first = await _h.CreateAsync(Request());
        await _h.Service.CancelAsync(_h.CampaignId, first.Id, new CancelRequest("Rain"), CancellationToken.None);

        var result = await TryCreate(Request());

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Create_is_refused_for_an_unknown_campaign_and_for_a_closed_one()
    {
        var unknown = await _h.Service.CreateAsync(Guid.NewGuid(), Request(), CancellationToken.None);
        var closed = _h.AddCampaign("Closed");
        var closedResult = await _h.Service.CreateAsync(closed.CampaignId, Request(), CancellationToken.None);

        Assert.Equal(ErrorType.NotFound, unknown.Error.Type);
        Assert.Equal(SessionErrors.CampaignClosed, closedResult.Error);
    }

    [Fact]
    public async Task Create_works_while_the_campaign_is_running()
    {
        var active = _h.AddCampaign("Active");

        var result = await _h.Service.CreateAsync(active.CampaignId, Request(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(_h.Gateway.StatusCalls);
    }

    [Fact]
    public async Task Create_needs_a_signed_in_user()
    {
        _h.User.User = null;

        var result = await TryCreate(Request());

        Assert.Equal(SessionErrors.NoUser, result.Error);
    }

    [Fact]
    public async Task A_save_that_loses_to_someone_else_is_reported_as_a_conflict()
    {
        _h.Repository.FailNextSave = SessionErrors.ConcurrentEdit;

        var result = await TryCreate(Request());

        Assert.Equal(SessionErrors.ConcurrentEdit, result.Error);
        Assert.Empty(_h.Gateway.StatusCalls);
    }

    // ---------- Step 3 status ----------

    [Fact]
    public async Task The_first_session_completes_Step_3()
    {
        Assert.Equal(StepStatus.NotStarted, _h.Gateway.StepStatusOf(_h.CampaignId));

        await _h.CreateAsync();

        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(_h.CampaignId));
    }

    [Fact]
    public async Task A_second_session_does_not_touch_the_step_again()
    {
        await _h.CreateAsync();
        var calls = _h.Gateway.StatusCalls.Count;

        await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 21)));

        Assert.Equal(calls, _h.Gateway.StatusCalls.Count);
    }

    [Fact]
    public async Task Cancelling_the_only_session_puts_Step_3_back_in_progress_and_a_new_one_completes_it_again()
    {
        var session = await _h.CreateAsync();

        await _h.Service.CancelAsync(_h.CampaignId, session.Id, new CancelRequest("Rain"), CancellationToken.None);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(_h.CampaignId));

        await _h.CreateAsync();
        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(_h.CampaignId));
    }

    [Fact]
    public async Task Cancelling_one_of_two_sessions_keeps_Step_3_complete()
    {
        var first = await _h.CreateAsync();
        await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 21)));

        await _h.Service.CancelAsync(_h.CampaignId, first.Id, new CancelRequest("Rain"), CancellationToken.None);

        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(_h.CampaignId));
    }

    // ---------- Update ----------

    [Fact]
    public async Task Update_changes_a_planned_session_and_audits_before_and_after()
    {
        var session = await _h.CreateAsync();
        _h.Repository.Audit.Clear();
        _h.SignInAs("manager-2", "Rith Manager", Group.SelectionManager);
        _h.Staff.Staff = [.. _h.Staff.Staff!, new("manager-2", "Rith Manager", "selection-manager")];

        var result = await _h.Service.UpdateAsync(
            _h.CampaignId, session.Id,
            Request(title: "Moved to the library", date: new DateOnly(2027, 4, 2), assignee: "officer-2", format: "Online", venue: null, link: "https://meet.example.org/room"),
            CancellationToken.None);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal("Moved to the library", result.Value.Title);
        Assert.Equal(new DateOnly(2027, 4, 2), result.Value.Date);
        Assert.Equal("Online", result.Value.Format);
        Assert.Null(result.Value.Venue);
        Assert.Equal("Vanna Officer", result.Value.Assignee.Name);

        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.Updated, audit.Action);
        Assert.Contains("Open day at Kampong Cham High School", audit.BeforeJson);
        Assert.Contains("Moved to the library", audit.AfterJson);
        Assert.Equal("manager-2", audit.ChangedById);
    }

    [Fact]
    public async Task Update_does_not_clash_with_the_session_itself()
    {
        var session = await _h.CreateAsync(Request(start: "09:00", end: "11:00"));

        var result = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, Request(start: "09:30", end: "11:30"), CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Update_refuses_a_move_that_clashes_with_another_session_of_the_host()
    {
        await _h.CreateAsync(Request(start: "09:00", end: "11:00"));
        var second = await _h.CreateAsync(Request(start: "13:00", end: "14:00"));

        var result = await _h.Service.UpdateAsync(_h.CampaignId, second.Id, Request(start: "10:00", end: "12:00"), CancellationToken.None);

        Assert.Equal("sessions.host_busy", result.Error.Code);
    }

    [Fact]
    public async Task Update_with_nothing_changed_saves_and_audits_nothing()
    {
        var session = await _h.CreateAsync();
        _h.Repository.Audit.Clear();
        var saves = _h.Repository.SaveCount;

        var result = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, Request(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(_h.Repository.Audit);
        Assert.Equal(saves, _h.Repository.SaveCount);
    }

    [Fact]
    public async Task Update_with_a_problem_changes_nothing()
    {
        var session = await _h.CreateAsync();
        _h.Repository.Audit.Clear();

        var result = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, Request(title: ""), CancellationToken.None);

        Assert.Equal(["Enter a title."], Errors(result, "title"));
        Assert.Equal("Open day at Kampong Cham High School", _h.Repository.Sessions[session.Id].Title);
        Assert.Empty(_h.Repository.Audit);
    }

    [Fact]
    public async Task A_session_can_keep_a_host_that_was_switched_off_after_it_was_planned()
    {
        var session = await _h.CreateAsync(_h.PartnerRequest());
        _h.Partner.SetActive(false, _h.Clock.UtcNow);

        var kept = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, _h.PartnerRequest(start: "09:30", end: "11:30"), CancellationToken.None);
        var shown = await _h.Service.GetAsync(_h.CampaignId, session.Id, CancellationToken.None);

        Assert.True(kept.IsSuccess);
        Assert.False(shown.Value.Host.IsActive);
    }

    [Fact]
    public async Task Update_cannot_move_a_session_to_a_host_that_is_switched_off()
    {
        var session = await _h.CreateAsync();
        _h.Partner.SetActive(false, _h.Clock.UtcNow);

        var result = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, _h.PartnerRequest(), CancellationToken.None);

        Assert.Equal([SessionErrors.HostInactive.Message], Errors(result, "hostId"));
    }

    [Fact]
    public async Task A_province_that_was_valid_when_chosen_can_stay()
    {
        var session = await _h.CreateAsync(Request(province: 17));
        _h.Gateway.Campaigns[_h.CampaignId] = _h.Campaign with { TargetProvinces = [new TargetProvince("2", "Battambang")] };

        var result = await _h.Service.UpdateAsync(_h.CampaignId, session.Id, Request(province: 17, title: "Renamed"), CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Update_is_refused_for_a_done_or_cancelled_session()
    {
        var done = await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 1)));
        await _h.Service.RecordAttendanceAsync(_h.CampaignId, done.Id, new AttendanceRequest(5, 5), CancellationToken.None);
        var cancelled = await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 25)));
        await _h.Service.CancelAsync(_h.CampaignId, cancelled.Id, new CancelRequest("Rain"), CancellationToken.None);

        Assert.Equal(SessionErrors.NotPlanned, (await _h.Service.UpdateAsync(_h.CampaignId, done.Id, Request(), CancellationToken.None)).Error);
        Assert.Equal(SessionErrors.NotPlanned, (await _h.Service.UpdateAsync(_h.CampaignId, cancelled.Id, Request(), CancellationToken.None)).Error);
    }

    [Fact]
    public async Task Update_is_refused_for_an_unknown_session_another_campaigns_session_and_a_closed_campaign()
    {
        var session = await _h.CreateAsync();
        var other = _h.AddCampaign();
        var closed = _h.AddCampaign("Closed");
        var inClosed = InformationSession.Create(closed.CampaignId, OldSessionDetails(), "u", "U", _h.Clock.UtcNow).Value;
        _h.Repository.AddSession(inClosed);

        Assert.Equal(SessionErrors.NotFound, (await _h.Service.UpdateAsync(_h.CampaignId, Guid.NewGuid(), Request(), CancellationToken.None)).Error);
        Assert.Equal(SessionErrors.NotFound, (await _h.Service.UpdateAsync(other.CampaignId, session.Id, Request(), CancellationToken.None)).Error);
        Assert.Equal(SessionErrors.CampaignClosed, (await _h.Service.UpdateAsync(closed.CampaignId, inClosed.Id, Request(), CancellationToken.None)).Error);
    }

    private static SessionDetails OldSessionDetails() => new(
        "Old session", new DateOnly(2027, 1, 5), new TimeOnly(9, 0), new TimeOnly(10, 0), SessionFormat.InPerson,
        "Hall", null, null, null, "officer-1", "Sokha Officer", new HostRef(HostType.Officer, null, "officer-1", "Sokha Officer"));

    // ---------- Cancel ----------

    [Fact]
    public async Task Cancel_calls_off_a_planned_session_with_its_reason_and_audits_it()
    {
        var session = await _h.CreateAsync();
        _h.Repository.Audit.Clear();

        var result = await _h.Service.CancelAsync(_h.CampaignId, session.Id, new CancelRequest("  Heavy   rain "), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Cancelled", result.Value.Status);
        Assert.Equal("Heavy rain", result.Value.CancelReason);

        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.Cancelled, audit.Action);
        Assert.Contains("Planned", audit.BeforeJson);
        Assert.Contains("Cancelled", audit.AfterJson);
        Assert.Contains("Heavy rain", audit.AfterJson);
    }

    [Fact]
    public async Task Cancel_needs_a_reason()
    {
        var session = await _h.CreateAsync();

        var result = await _h.Service.CancelAsync(_h.CampaignId, session.Id, new CancelRequest(" "), CancellationToken.None);

        Assert.Equal(["Say why the session is cancelled."], Errors(result, "reason"));
        Assert.Equal(SessionStatus.Planned, _h.Repository.Sessions[session.Id].Status);
    }

    [Fact]
    public async Task Cancel_is_refused_twice_for_a_done_session_for_a_closed_campaign_and_for_an_unknown_one()
    {
        var done = await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 1)));
        await _h.Service.RecordAttendanceAsync(_h.CampaignId, done.Id, new AttendanceRequest(5, 5), CancellationToken.None);
        var cancelled = await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 25)));
        await _h.Service.CancelAsync(_h.CampaignId, cancelled.Id, new CancelRequest("Rain"), CancellationToken.None);

        Assert.Equal(SessionErrors.CannotCancelDone, (await _h.Service.CancelAsync(_h.CampaignId, done.Id, new CancelRequest("x"), CancellationToken.None)).Error);
        Assert.Equal(SessionErrors.AlreadyCancelled, (await _h.Service.CancelAsync(_h.CampaignId, cancelled.Id, new CancelRequest("x"), CancellationToken.None)).Error);
        Assert.Equal(SessionErrors.NotFound, (await _h.Service.CancelAsync(_h.CampaignId, Guid.NewGuid(), new CancelRequest("x"), CancellationToken.None)).Error);

        _h.Gateway.Campaigns[_h.CampaignId] = _h.Campaign with { Status = "Closed", IsEditable = false };
        var spare = InformationSession.Create(_h.CampaignId, OldSessionDetails(), "u", "U", _h.Clock.UtcNow).Value;
        _h.Repository.AddSession(spare);
        Assert.Equal(SessionErrors.CampaignClosed, (await _h.Service.CancelAsync(_h.CampaignId, spare.Id, new CancelRequest("x"), CancellationToken.None)).Error);
        Assert.Null(spare.CancelReason);
    }
}
