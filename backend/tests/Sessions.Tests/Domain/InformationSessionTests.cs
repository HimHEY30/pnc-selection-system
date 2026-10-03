using Sessions.Domain;
using SharedKernel;

namespace Sessions.Tests.Domain;

public sealed class InformationSessionTests
{
    // 2027-03-10 12:00 in Cambodia is 05:00 UTC.
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
    private static readonly Guid CampaignId = Guid.NewGuid();

    public static SessionDetails Details(
        string title = "Open day at Kampong Cham High School",
        DateOnly? date = null,
        TimeOnly? start = null,
        TimeOnly? end = null,
        SessionFormat format = SessionFormat.InPerson,
        string? venue = "School hall",
        string? link = null,
        HostRef? host = null) => new(
        title,
        date ?? new DateOnly(2027, 3, 20),
        start ?? new TimeOnly(9, 0),
        end ?? new TimeOnly(11, 0),
        format,
        venue,
        link,
        ProvinceId: null,
        Notes: null,
        AssigneeId: "officer-1",
        AssigneeName: "Sokha Officer",
        host ?? new HostRef(HostType.Officer, null, "officer-1", "Sokha Officer"));

    private static InformationSession Planned(SessionDetails? details = null) =>
        InformationSession.Create(CampaignId, details ?? Details(), "manager-1", "Dara Manager", Now).Value;

    private static string[] Errors(Result result, string field)
    {
        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    // ---------- Create ----------

    [Fact]
    public void Create_makes_a_planned_session_with_no_numbers()
    {
        var session = Planned();

        Assert.Equal(SessionStatus.Planned, session.Status);
        Assert.Equal(CampaignId, session.CampaignId);
        Assert.Null(session.ExpectedCandidates);
        Assert.Null(session.ActualFemale);
        Assert.Null(session.ActualTotal);
        Assert.False(session.HasAttendance);
        Assert.Equal("manager-1", session.CreatedById);
        Assert.Equal("officer-1", session.AssigneeId);
    }

    [Fact]
    public void Create_tidies_the_title_and_notes()
    {
        var session = Planned(Details(title: "  Open   day  ") with { Notes = "  bring posters\nand forms  " });

        Assert.Equal("Open day", session.Title);
        Assert.Equal("bring posters\nand forms", session.Notes);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_needs_a_title(string title) =>
        Assert.Equal(["Enter a title."], Errors(InformationSession.Create(CampaignId, Details(title: title), "u", "U", Now), "title"));

    [Fact]
    public void Create_limits_the_title_to_120_characters()
    {
        Assert.True(InformationSession.Create(CampaignId, Details(title: new string('a', 120)), "u", "U", Now).IsSuccess);
        Assert.Single(Errors(InformationSession.Create(CampaignId, Details(title: new string('a', 121)), "u", "U", Now), "title"));
    }

    [Theory]
    [InlineData(9, 0, 9, 0)]
    [InlineData(10, 0, 9, 0)]
    public void Create_needs_the_end_after_the_start(int sh, int sm, int eh, int em)
    {
        var details = Details(start: new TimeOnly(sh, sm), end: new TimeOnly(eh, em));
        Assert.Equal(["The end must be after the start."], Errors(InformationSession.Create(CampaignId, details, "u", "U", Now), "endTime"));
    }

    [Fact]
    public void Create_allows_a_session_that_already_took_place()
    {
        var session = InformationSession.Create(CampaignId, Details(date: new DateOnly(2027, 1, 5)), "u", "U", Now);
        Assert.True(session.IsSuccess);
    }

    [Fact]
    public void An_in_person_session_needs_a_venue_and_drops_a_link()
    {
        Assert.Equal(
            ["Enter where the session takes place."],
            Errors(InformationSession.Create(CampaignId, Details(venue: " "), "u", "U", Now), "venue"));

        var session = Planned(Details(venue: "Hall", link: "https://meet.example.org/x"));
        Assert.Equal("Hall", session.Venue);
        Assert.Null(session.MeetingLink);
    }

    [Fact]
    public void An_online_session_needs_a_web_link_and_drops_a_venue()
    {
        Assert.Equal(
            ["Enter the link people will join with."],
            Errors(InformationSession.Create(CampaignId, Details(format: SessionFormat.Online, venue: null), "u", "U", Now), "meetingLink"));

        var session = Planned(Details(format: SessionFormat.Online, venue: "ignored", link: " https://meet.example.org/x "));
        Assert.Null(session.Venue);
        Assert.Equal("https://meet.example.org/x", session.MeetingLink);
    }

    [Theory]
    [InlineData("meet.example.org")]
    [InlineData("ftp://example.org/room")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://")]
    public void A_link_must_be_a_web_address(string link)
    {
        var details = Details(format: SessionFormat.Online, venue: null, link: link);
        Assert.Single(Errors(InformationSession.Create(CampaignId, details, "u", "U", Now), "meetingLink"));
    }

    [Fact]
    public void A_hybrid_session_needs_both_a_venue_and_a_link()
    {
        var result = InformationSession.Create(CampaignId, Details(format: SessionFormat.Hybrid, venue: null, link: null), "u", "U", Now);

        Assert.True(result.IsFailure);
        Assert.Contains("venue", result.Error.FieldErrors!.Keys);
        Assert.Contains("meetingLink", result.Error.FieldErrors.Keys);
    }

    [Fact]
    public void Create_limits_notes_to_1000_characters()
    {
        Assert.True(InformationSession.Create(CampaignId, Details() with { Notes = new string('n', 1000) }, "u", "U", Now).IsSuccess);
        Assert.Single(Errors(InformationSession.Create(CampaignId, Details() with { Notes = new string('n', 1001) }, "u", "U", Now), "notes"));
    }

    [Fact]
    public void Create_needs_an_assignee()
    {
        var result = InformationSession.Create(CampaignId, Details() with { AssigneeId = " " }, "u", "U", Now);
        Assert.Equal(["Choose who is responsible for this session."], Errors(result, "assigneeId"));
    }

    [Fact]
    public void An_officer_host_needs_a_user_and_keeps_no_directory_id()
    {
        var missing = Details(host: new HostRef(HostType.Officer, null, null, null));
        Assert.Single(Errors(InformationSession.Create(CampaignId, missing, "u", "U", Now), "hostUserId"));

        var session = Planned(Details(host: new HostRef(HostType.Officer, Guid.NewGuid(), "officer-2", "Vanna")));
        Assert.Equal(HostType.Officer, session.HostType);
        Assert.Null(session.HostId);
        Assert.Equal("officer-2", session.HostUserId);
        Assert.Equal("Vanna", session.HostUserName);
    }

    [Theory]
    [InlineData(HostType.Alumni)]
    [InlineData(HostType.Partner)]
    public void An_alumni_or_partner_host_needs_a_directory_record_and_keeps_no_user(HostType type)
    {
        var missing = Details(host: new HostRef(type, null, null, null));
        Assert.Single(Errors(InformationSession.Create(CampaignId, missing, "u", "U", Now), "hostId"));

        var hostId = Guid.NewGuid();
        var session = Planned(Details(host: new HostRef(type, hostId, "stray-user", "Stray")));
        Assert.Equal(type, session.HostType);
        Assert.Equal(hostId, session.HostId);
        Assert.Null(session.HostUserId);
        Assert.Null(session.HostUserName);
    }

    [Fact]
    public void An_unknown_host_type_is_refused()
    {
        var details = Details(host: new HostRef((HostType)9, null, null, null));
        Assert.Single(Errors(InformationSession.Create(CampaignId, details, "u", "U", Now), "hostType"));
    }

    [Fact]
    public void Create_reports_every_problem_at_once()
    {
        var details = Details(title: "", venue: null, end: new TimeOnly(8, 0)) with { AssigneeId = "" };
        var result = InformationSession.Create(CampaignId, details, "u", "U", Now);

        Assert.True(result.IsFailure);
        Assert.Equal(
            ["assigneeId", "endTime", "title", "venue"],
            result.Error.FieldErrors!.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    // ---------- Update ----------

    [Fact]
    public void Update_changes_a_planned_session()
    {
        var session = Planned();
        var later = Now.AddMinutes(5);

        var result = session.Update(Details(title: "Moved", date: new DateOnly(2027, 4, 1), host: new HostRef(HostType.Partner, Guid.NewGuid(), null, null)), later);

        Assert.True(result.IsSuccess);
        Assert.Equal("Moved", session.Title);
        Assert.Equal(new DateOnly(2027, 4, 1), session.Date);
        Assert.Equal(HostType.Partner, session.HostType);
        Assert.Equal(later, session.UpdatedAt);
    }

    [Fact]
    public void Update_with_a_problem_changes_nothing()
    {
        var session = Planned();

        var result = session.Update(Details(title: ""), Now.AddMinutes(5));

        Assert.True(result.IsFailure);
        Assert.Equal("Open day at Kampong Cham High School", session.Title);
        Assert.Equal(Now, session.UpdatedAt);
    }

    [Fact]
    public void A_done_or_cancelled_session_cannot_be_updated()
    {
        var done = Planned(Details(date: new DateOnly(2027, 3, 1)));
        done.RecordAttendance(1, 1, "u", "U", Now);
        Assert.Equal(SessionErrors.NotPlanned, done.Update(Details(), Now).Error);

        var cancelled = Planned();
        cancelled.Cancel("Rain", Now);
        Assert.Equal(SessionErrors.NotPlanned, cancelled.Update(Details(), Now).Error);
    }

    // ---------- Cancel ----------

    [Fact]
    public void Cancel_needs_a_reason_and_is_final()
    {
        var session = Planned();

        Assert.Equal(["Say why the session is cancelled."], Errors(session.Cancel("  ", Now), "reason"));
        Assert.Single(Errors(session.Cancel(new string('r', 301), Now), "reason"));
        Assert.Equal(SessionStatus.Planned, session.Status);

        Assert.True(session.Cancel("  Heavy   rain ", Now).IsSuccess);
        Assert.Equal(SessionStatus.Cancelled, session.Status);
        Assert.Equal("Heavy rain", session.CancelReason);

        Assert.Equal(SessionErrors.AlreadyCancelled, session.Cancel("Again", Now).Error);
    }

    [Fact]
    public void A_session_that_took_place_cannot_be_cancelled()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 1)));
        session.RecordAttendance(10, 12, "u", "U", Now);

        Assert.Equal(SessionErrors.CannotCancelDone, session.Cancel("Oops", Now).Error);
        Assert.Equal(SessionStatus.Done, session.Status);
    }

    // ---------- Expected ----------

    [Theory]
    [InlineData(0)]
    [InlineData(40)]
    [InlineData(5000)]
    public void Expected_accepts_zero_to_five_thousand(int expected)
    {
        var session = Planned();

        Assert.True(session.SetExpected(expected, Now).IsSuccess);
        Assert.Equal(expected, session.ExpectedCandidates);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(5001)]
    public void Expected_outside_the_range_is_refused(int expected)
    {
        var session = Planned();
        session.SetExpected(30, Now);

        Assert.Single(Errors(session.SetExpected(expected, Now), "expected"));
        Assert.Equal(30, session.ExpectedCandidates);
    }

    [Fact]
    public void Expected_can_be_cleared_and_stays_open_after_the_session_is_done()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 1)));
        session.SetExpected(30, Now);
        session.RecordAttendance(10, 12, "u", "U", Now);

        Assert.True(session.SetExpected(35, Now).IsSuccess);
        Assert.True(session.SetExpected(null, Now).IsSuccess);
        Assert.Null(session.ExpectedCandidates);
    }

    [Fact]
    public void Expected_cannot_change_on_a_cancelled_session()
    {
        var session = Planned();
        session.Cancel("Rain", Now);

        Assert.Equal(SessionErrors.AlreadyCancelled, session.SetExpected(10, Now).Error);
    }

    // ---------- Actual attendance ----------

    [Fact]
    public void Attendance_records_females_and_males_and_marks_the_session_done()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 10)));
        var at = Now.AddHours(3);

        var result = session.RecordAttendance(18, 12, "officer-1", "Sokha Officer", at);

        Assert.True(result.IsSuccess);
        Assert.Equal(18, session.ActualFemale);
        Assert.Equal(12, session.ActualMale);
        Assert.Equal(30, session.ActualTotal);
        Assert.True(session.HasAttendance);
        Assert.Equal(SessionStatus.Done, session.Status);
        Assert.Equal(at, session.AttendanceRecordedAt);
        Assert.Equal("officer-1", session.AttendanceRecordedById);
        Assert.Equal("Sokha Officer", session.AttendanceRecordedByName);
    }

    [Fact]
    public void Attendance_of_zero_is_a_real_answer()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 10)));

        Assert.True(session.RecordAttendance(0, 0, "u", "U", Now).IsSuccess);
        Assert.Equal(0, session.ActualTotal);
        Assert.True(session.HasAttendance);
    }

    [Fact]
    public void Attendance_waits_for_the_session_date_on_the_Cambodia_clock()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 11)));

        // 2027-03-10 16:59 UTC is 23:59 on the 10th in Cambodia: the session is still tomorrow.
        Assert.Equal(SessionErrors.NotHeldYet, session.RecordAttendance(1, 1, "u", "U", new DateTimeOffset(2027, 3, 10, 16, 59, 0, TimeSpan.Zero)).Error);
        Assert.Equal(SessionStatus.Planned, session.Status);
        Assert.Null(session.ActualFemale);

        // One minute later it is midnight in Cambodia, so the 11th has arrived.
        Assert.True(session.RecordAttendance(1, 1, "u", "U", new DateTimeOffset(2027, 3, 10, 17, 0, 0, TimeSpan.Zero)).IsSuccess);
    }

    [Theory]
    [InlineData(-1, 5, "female")]
    [InlineData(5, -1, "male")]
    [InlineData(5001, 5, "female")]
    [InlineData(5, 5001, "male")]
    public void Attendance_numbers_must_be_in_range(int female, int male, string field)
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 10)));

        Assert.Single(Errors(session.RecordAttendance(female, male, "u", "U", Now), field));
        Assert.False(session.HasAttendance);
        Assert.Equal(SessionStatus.Planned, session.Status);
    }

    [Fact]
    public void Attendance_can_be_corrected_later()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 10)));
        session.RecordAttendance(18, 12, "u", "U", Now);

        Assert.True(session.RecordAttendance(20, 12, "v", "V", Now.AddDays(1)).IsSuccess);

        Assert.Equal(32, session.ActualTotal);
        Assert.Equal("v", session.AttendanceRecordedById);
    }

    [Fact]
    public void Attendance_cannot_be_recorded_for_a_cancelled_session()
    {
        var session = Planned(Details(date: new DateOnly(2027, 3, 10)));
        session.Cancel("Rain", Now);

        Assert.Equal(SessionErrors.AlreadyCancelled, session.RecordAttendance(1, 1, "u", "U", Now).Error);
    }
}
