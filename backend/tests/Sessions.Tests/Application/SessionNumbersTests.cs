using Campaigns.Domain;
using Identity.Domain;
using Sessions.Application;
using Sessions.Domain;
using Sessions.Tests.Support;
using SharedKernel;
using static Sessions.Tests.Support.SessionHarness;

namespace Sessions.Tests.Application;

/// <summary>Expected candidates, actual attendance (females and males), the campaign's totals and "my sessions".</summary>
public sealed class SessionNumbersTests
{
    private readonly SessionHarness _h = new();

    // The clock says 2027-03-10 in Cambodia. A session on the 1st has happened; one on the 20th has not.
    private static readonly DateOnly Past = new(2027, 3, 1);
    private static readonly DateOnly Today = new(2027, 3, 10);
    private static readonly DateOnly Future = new(2027, 3, 20);

    private static string[] Errors(Result result, string field)
    {
        Assert.True(result.IsFailure, "expected a failure");
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    private Task<Result<SessionDto>> Expect(Guid id, int? expected) =>
        _h.Service.SetExpectedAsync(_h.CampaignId, id, new ExpectedRequest(expected), CancellationToken.None);

    private Task<Result<SessionDto>> Record(Guid id, int? female, int? male) =>
        _h.Service.RecordAttendanceAsync(_h.CampaignId, id, new AttendanceRequest(female, male), CancellationToken.None);

    // ---------- Expected ----------

    [Fact]
    public async Task Expected_is_set_and_shown_and_audited_with_before_and_after()
    {
        var session = await _h.CreateAsync();
        _h.Repository.Audit.Clear();
        _h.SignInAs("officer-1", "Sokha Officer", Group.SelectionOfficer);

        var result = await Expect(session.Id, 40);

        Assert.True(result.IsSuccess);
        Assert.Equal(40, result.Value.ExpectedCandidates);
        Assert.Equal("Planned", result.Value.Status);

        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.ExpectedSet, audit.Action);
        Assert.Contains("\"expectedCandidates\":null", audit.BeforeJson);
        Assert.Contains("\"expectedCandidates\":40", audit.AfterJson);
        Assert.Equal("officer-1", audit.ChangedById);
        Assert.Equal("Sokha Officer", audit.ChangedByName);
    }

    [Fact]
    public async Task Expected_can_be_changed_and_cleared()
    {
        var session = await _h.CreateAsync();
        await Expect(session.Id, 40);

        Assert.Equal(55, (await Expect(session.Id, 55)).Value.ExpectedCandidates);
        Assert.Null((await Expect(session.Id, null)).Value.ExpectedCandidates);
        Assert.Equal(3, _h.Repository.Audit.Count(a => a.Action == AuditAction.ExpectedSet));
    }

    [Fact]
    public async Task Expected_zero_is_a_real_answer_not_a_blank()
    {
        var session = await _h.CreateAsync();

        var result = await Expect(session.Id, 0);

        Assert.Equal(0, result.Value.ExpectedCandidates);
    }

    [Fact]
    public async Task Expected_saying_the_same_again_saves_and_audits_nothing()
    {
        var session = await _h.CreateAsync();
        await Expect(session.Id, 40);
        var audits = _h.Repository.Audit.Count;
        var saves = _h.Repository.SaveCount;

        var result = await Expect(session.Id, 40);

        Assert.True(result.IsSuccess);
        Assert.Equal(audits, _h.Repository.Audit.Count);
        Assert.Equal(saves, _h.Repository.SaveCount);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(5001)]
    public async Task Expected_outside_zero_to_five_thousand_is_refused(int expected)
    {
        var session = await _h.CreateAsync();

        var result = await Expect(session.Id, expected);

        Assert.Single(Errors(result, "expected"));
        Assert.Null(_h.Repository.Sessions[session.Id].ExpectedCandidates);
    }

    [Fact]
    public async Task Expected_is_refused_for_a_cancelled_session_and_an_unknown_one()
    {
        var session = await _h.CreateAsync();
        await _h.Service.CancelAsync(_h.CampaignId, session.Id, new CancelRequest("Rain"), CancellationToken.None);

        Assert.Equal(SessionErrors.AlreadyCancelled, (await Expect(session.Id, 10)).Error);
        Assert.Equal(SessionErrors.NotFound, (await Expect(Guid.NewGuid(), 10)).Error);
    }

    [Fact]
    public async Task Expected_stays_open_while_the_campaign_runs_and_after_it_closes()
    {
        var session = await _h.CreateAsync();

        _h.Gateway.Campaigns[_h.CampaignId] = _h.Campaign with { Status = "Active", IsEditable = false };
        Assert.True((await Expect(session.Id, 30)).IsSuccess);

        _h.Gateway.Campaigns[_h.CampaignId] = _h.Campaign with { Status = "Closed", IsEditable = false };
        Assert.True((await Expect(session.Id, 35)).IsSuccess);
    }

    [Fact]
    public async Task Expected_needs_a_signed_in_user()
    {
        var session = await _h.CreateAsync();
        _h.User.User = null;

        Assert.Equal(SessionErrors.NoUser, (await Expect(session.Id, 10)).Error);
    }

    // ---------- Actual attendance ----------

    [Fact]
    public async Task Attendance_records_females_and_males_with_their_total_marks_the_session_done_and_audits_it()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        _h.Repository.Audit.Clear();
        _h.SignInAs("officer-1", "Sokha Officer", Group.SelectionOfficer);

        var result = await Record(session.Id, 18, 12);

        Assert.True(result.IsSuccess);
        Assert.Equal("Done", result.Value.Status);
        var attendance = result.Value.Attendance!;
        Assert.Equal(18, attendance.Female);
        Assert.Equal(12, attendance.Male);
        Assert.Equal(30, attendance.Total);
        Assert.Equal("Sokha Officer", attendance.RecordedByName);
        Assert.Equal(_h.Clock.UtcNow, attendance.RecordedAt);

        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.AttendanceRecorded, audit.Action);
        Assert.Contains("\"actualFemale\":null", audit.BeforeJson);
        Assert.Contains("\"actualFemale\":18", audit.AfterJson);
        Assert.Contains("\"actualMale\":12", audit.AfterJson);
        Assert.Contains("\"status\":\"Done\"", audit.AfterJson);
    }

    [Fact]
    public async Task Attendance_can_be_recorded_on_the_day()
    {
        var session = await _h.CreateAsync(Request(date: Today));

        Assert.True((await Record(session.Id, 1, 2)).IsSuccess);
    }

    [Fact]
    public async Task Attendance_cannot_be_recorded_before_the_day()
    {
        var session = await _h.CreateAsync(Request(date: Future));

        var result = await Record(session.Id, 1, 2);

        Assert.Equal(SessionErrors.NotHeldYet, result.Error);
        Assert.Equal(SessionStatus.Planned, _h.Repository.Sessions[session.Id].Status);
        Assert.DoesNotContain(_h.Repository.Audit, a => a.Action == AuditAction.AttendanceRecorded);
    }

    [Fact]
    public async Task Attendance_zero_for_both_is_a_real_answer()
    {
        var session = await _h.CreateAsync(Request(date: Past));

        var result = await Record(session.Id, 0, 0);

        Assert.Equal(0, result.Value.Attendance!.Total);
        Assert.Equal("Done", result.Value.Status);
    }

    [Fact]
    public async Task Attendance_needs_both_numbers()
    {
        var session = await _h.CreateAsync(Request(date: Past));

        Assert.Equal(["Enter how many males came."], Errors(await Record(session.Id, 5, null), "male"));
        Assert.Equal(["Enter how many females came."], Errors(await Record(session.Id, null, 5), "female"));

        var neither = await Record(session.Id, null, null);
        Assert.Contains("female", neither.Error.FieldErrors!.Keys);
        Assert.Contains("male", neither.Error.FieldErrors.Keys);
        Assert.Equal(SessionStatus.Planned, _h.Repository.Sessions[session.Id].Status);
    }

    [Theory]
    [InlineData(-1, 5, "female")]
    [InlineData(5, -1, "male")]
    [InlineData(5001, 5, "female")]
    [InlineData(5, 5001, "male")]
    public async Task Attendance_numbers_outside_zero_to_five_thousand_are_refused(int female, int male, string field)
    {
        var session = await _h.CreateAsync(Request(date: Past));

        Assert.Single(Errors(await Record(session.Id, female, male), field));
        Assert.Null(_h.Repository.Sessions[session.Id].ActualFemale);
    }

    [Fact]
    public async Task Attendance_can_be_corrected_and_each_correction_is_audited()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        await Record(session.Id, 18, 12);
        _h.Repository.Audit.Clear();
        _h.SignInAs("manager-2", "Rith Manager", Group.SelectionManager);

        var result = await Record(session.Id, 20, 12);

        Assert.Equal(32, result.Value.Attendance!.Total);
        Assert.Equal("Rith Manager", result.Value.Attendance.RecordedByName);
        var audit = Assert.Single(_h.Repository.Audit);
        Assert.Contains("\"actualFemale\":18", audit.BeforeJson);
        Assert.Contains("\"actualFemale\":20", audit.AfterJson);
    }

    [Fact]
    public async Task Attendance_is_refused_for_a_cancelled_session()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        await _h.Service.CancelAsync(_h.CampaignId, session.Id, new CancelRequest("Rain"), CancellationToken.None);

        Assert.Equal(SessionErrors.AlreadyCancelled, (await Record(session.Id, 1, 1)).Error);
    }

    [Fact]
    public async Task Attendance_stays_open_after_the_campaign_closes()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        _h.Gateway.Campaigns[_h.CampaignId] = _h.Campaign with { Status = "Closed", IsEditable = false };

        Assert.True((await Record(session.Id, 3, 4)).IsSuccess);
    }

    [Fact]
    public async Task Attendance_follows_the_Cambodia_clock_at_midnight()
    {
        var session = await _h.CreateAsync(Request(date: new DateOnly(2027, 3, 11)));

        // 16:59 UTC on the 10th is 23:59 in Cambodia.
        _h.Clock.UtcNow = new DateTimeOffset(2027, 3, 10, 16, 59, 0, TimeSpan.Zero);
        Assert.Equal(SessionErrors.NotHeldYet, (await Record(session.Id, 1, 1)).Error);

        _h.Clock.UtcNow = new DateTimeOffset(2027, 3, 10, 17, 0, 0, TimeSpan.Zero);
        Assert.True((await Record(session.Id, 1, 1)).IsSuccess);
    }

    [Fact]
    public async Task Attendance_needs_a_known_session_in_that_campaign()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        var other = _h.AddCampaign();

        Assert.Equal(SessionErrors.NotFound, (await Record(Guid.NewGuid(), 1, 1)).Error);
        Assert.Equal(
            SessionErrors.NotFound,
            (await _h.Service.RecordAttendanceAsync(other.CampaignId, session.Id, new AttendanceRequest(1, 1), CancellationToken.None)).Error);
    }

    [Fact]
    public async Task A_save_that_loses_to_someone_else_is_reported_and_nothing_is_claimed()
    {
        var session = await _h.CreateAsync(Request(date: Past));
        _h.Repository.FailNextSave = SessionErrors.ConcurrentEdit;

        var result = await Record(session.Id, 1, 1);

        Assert.Equal(SessionErrors.ConcurrentEdit, result.Error);
    }

    // ---------- List and totals ----------

    [Fact]
    public async Task The_list_is_in_date_order_with_the_campaign_and_what_the_form_needs()
    {
        await _h.CreateAsync(Request(date: Future, province: 17));
        await _h.CreateAsync(Request(date: Past, hostUserId: "officer-2"));
        await _h.CreateAsync(Request(date: Past, start: "13:00", end: "14:00", hostType: "Partner", hostId: _h.Partner.Id, hostUserId: null));

        var list = (await _h.Service.ListAsync(_h.CampaignId, CancellationToken.None)).Value;

        Assert.Equal("Selection 2027", list.CampaignName);
        Assert.Equal("Draft", list.CampaignStatus);
        Assert.True(list.IsEditable);
        Assert.Equal(
            [new SessionProvinceDto(2, "Battambang"), new SessionProvinceDto(17, "Siem Reap")],
            list.TargetProvinces);
        Assert.Equal([Past, Past, Future], list.Sessions.Select(s => s.Date));
        Assert.Equal("09:00", list.Sessions[0].StartTime);
        Assert.Equal("Hope NGO", list.Sessions[1].Host.Name);
        Assert.Equal("Siem Reap", list.Sessions[2].Province!.Name);
    }

    [Fact]
    public async Task The_list_says_a_closed_campaign_can_no_longer_be_changed()
    {
        var closed = _h.AddCampaign("Closed");
        var active = _h.AddCampaign("Active");

        var closedList = (await _h.Service.ListAsync(closed.CampaignId, CancellationToken.None)).Value;
        var activeList = (await _h.Service.ListAsync(active.CampaignId, CancellationToken.None)).Value;

        Assert.False(closedList.IsEditable);
        Assert.True(activeList.IsEditable);
    }

    [Fact]
    public async Task The_list_of_an_unknown_campaign_is_not_found()
    {
        var result = await _h.Service.ListAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(ErrorType.NotFound, result.Error.Type);
    }

    [Fact]
    public async Task The_totals_add_up_expected_and_actual_females_and_males_and_leave_cancelled_sessions_out()
    {
        var a = await _h.CreateAsync(Request(date: Past));
        var b = await _h.CreateAsync(Request(date: Past, start: "13:00", end: "14:00"));
        var c = await _h.CreateAsync(Request(date: Future));
        var d = await _h.CreateAsync(Request(date: Future, start: "13:00", end: "14:00"));
        await Expect(a.Id, 40);
        await Expect(b.Id, 30);
        await Expect(c.Id, 25);
        await Expect(d.Id, 99);
        await Record(a.Id, 18, 12);
        await Record(b.Id, 10, 5);
        await _h.Service.CancelAsync(_h.CampaignId, d.Id, new CancelRequest("Rain"), CancellationToken.None);

        var summary = (await _h.Service.ListAsync(_h.CampaignId, CancellationToken.None)).Value.Summary;

        Assert.Equal(new SessionSummaryDto(
            Total: 3, Planned: 1, Done: 2, Cancelled: 1,
            ExpectedCandidates: 95, ActualFemale: 28, ActualMale: 17, ActualTotal: 45), summary);
    }

    [Fact]
    public async Task The_totals_of_a_campaign_with_no_sessions_are_all_zero()
    {
        var summary = (await _h.Service.ListAsync(_h.CampaignId, CancellationToken.None)).Value.Summary;

        Assert.Equal(new SessionSummaryDto(0, 0, 0, 0, 0, 0, 0, 0), summary);
    }

    [Fact]
    public async Task Get_returns_one_session_and_not_found_for_another_campaigns()
    {
        var session = await _h.CreateAsync();
        var other = _h.AddCampaign();

        Assert.Equal(session.Id, (await _h.Service.GetAsync(_h.CampaignId, session.Id, CancellationToken.None)).Value.Id);
        Assert.Equal(SessionErrors.NotFound, (await _h.Service.GetAsync(other.CampaignId, session.Id, CancellationToken.None)).Error);
        Assert.Equal(ErrorType.NotFound, (await _h.Service.GetAsync(Guid.NewGuid(), session.Id, CancellationToken.None)).Error.Type);
    }

    // ---------- My sessions ----------

    [Fact]
    public async Task My_sessions_are_the_ones_assigned_to_me_or_run_by_me_in_every_campaign_soonest_first()
    {
        var second = _h.AddCampaign("Active");
        await _h.CreateAsync(Request(date: Future, assignee: "officer-1", hostUserId: "officer-2"));
        await _h.CreateAsync(Request(date: Past, assignee: "manager-1", hostUserId: "officer-1"), second.CampaignId);
        await _h.CreateAsync(Request(date: Future, start: "13:00", end: "14:00", assignee: "officer-2", hostUserId: "officer-2"));
        _h.SignInAs("officer-1", "Sokha Officer", Group.SelectionOfficer);

        var mine = (await _h.Service.ListMineAsync(CancellationToken.None)).Value;

        Assert.Equal([Past, Future], mine.Select(m => m.Session.Date));
        Assert.Equal(["Active", "Draft"], mine.Select(m => m.CampaignStatus));
        Assert.All(mine, m => Assert.Equal("Selection 2027", m.CampaignName));
    }

    [Fact]
    public async Task My_sessions_are_empty_for_someone_with_none_and_need_a_signed_in_user()
    {
        await _h.CreateAsync();
        _h.SignInAs("officer-2", "Vanna Officer", Group.SelectionOfficer);

        Assert.Empty((await _h.Service.ListMineAsync(CancellationToken.None)).Value);

        _h.User.User = null;
        Assert.Equal(SessionErrors.NoUser, (await _h.Service.ListMineAsync(CancellationToken.None)).Error);
    }
}
