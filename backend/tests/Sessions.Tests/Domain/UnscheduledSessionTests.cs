using Sessions.Domain;
using SharedKernel;
using static Sessions.Tests.Domain.InformationSessionTests;

namespace Sessions.Tests.Domain;

/// <summary>A session copied from another campaign: no date, times, person responsible or host until it is scheduled.</summary>
public sealed class UnscheduledSessionTests
{
    // 2027-03-10 12:00 in Cambodia is 05:00 UTC.
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Later = Now.AddHours(1);
    private static readonly Guid CampaignId = Guid.NewGuid();

    private static SessionTemplate Template(
        string title = "Open day at Kampong Cham High School",
        SessionFormat format = SessionFormat.InPerson,
        string? venue = "School hall",
        string? link = null,
        short? province = 2,
        string? notes = "Bring the banner.") => new(title, format, venue, link, province, notes);

    private static InformationSession Unscheduled(SessionTemplate? template = null) =>
        InformationSession.CreateUnscheduled(CampaignId, template ?? Template(), "manager-1", "Dara Manager", Now).Value;

    // ---------- Create ----------

    [Fact]
    public void CreateUnscheduled_keeps_what_the_template_says_and_leaves_out_when_and_who()
    {
        var session = Unscheduled();

        Assert.Equal(SessionStatus.Unscheduled, session.Status);
        Assert.Equal("Open day at Kampong Cham High School", session.Title);
        Assert.Equal(SessionFormat.InPerson, session.Format);
        Assert.Equal("School hall", session.Venue);
        Assert.Equal((short)2, session.ProvinceId);
        Assert.Equal("Bring the banner.", session.Notes);
        Assert.Null(session.Date);
        Assert.Null(session.StartTime);
        Assert.Null(session.EndTime);
        Assert.Null(session.AssigneeId);
        Assert.Null(session.AssigneeName);
        Assert.Null(session.HostType);
        Assert.Null(session.HostId);
        Assert.Null(session.HostUserId);
        Assert.Null(session.ExpectedCandidates);
        Assert.False(session.HasAttendance);
        Assert.Equal("manager-1", session.CreatedById);
        Assert.Equal(CampaignId, session.CampaignId);
    }

    [Fact]
    public void CreateUnscheduled_checks_the_title_the_venue_and_the_link_like_any_session()
    {
        var blank = InformationSession.CreateUnscheduled(CampaignId, Template(title: "  "), "m", "M", Now);
        var noVenue = InformationSession.CreateUnscheduled(CampaignId, Template(venue: null), "m", "M", Now);
        var noLink = InformationSession.CreateUnscheduled(CampaignId, Template(format: SessionFormat.Online, venue: null, link: null), "m", "M", Now);

        Assert.Equal(["Enter a title."], blank.Error.FieldErrors!["title"]);
        Assert.Equal(["Enter where the session takes place."], noVenue.Error.FieldErrors!["venue"]);
        Assert.Equal(["Enter the link people will join with."], noLink.Error.FieldErrors!["meetingLink"]);
    }

    [Fact]
    public void CreateUnscheduled_drops_a_venue_an_online_session_does_not_need()
    {
        var session = Unscheduled(Template(format: SessionFormat.Online, venue: "Old hall", link: "https://meet.example.org/x"));

        Assert.Null(session.Venue);
        Assert.Equal("https://meet.example.org/x", session.MeetingLink);
    }

    // ---------- Schedule ----------

    [Fact]
    public void Schedule_gives_everything_at_once_and_makes_the_session_planned()
    {
        var session = Unscheduled();

        var result = session.Schedule(Details(), Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(SessionStatus.Planned, session.Status);
        Assert.Equal(new DateOnly(2027, 3, 20), session.Date);
        Assert.Equal(new TimeOnly(9, 0), session.StartTime);
        Assert.Equal(new TimeOnly(11, 0), session.EndTime);
        Assert.Equal("officer-1", session.AssigneeId);
        Assert.Equal(HostType.Officer, session.HostType);
        Assert.Equal("officer-1", session.HostUserId);
        Assert.Equal(Later, session.UpdatedAt);
    }

    [Fact]
    public void Schedule_applies_the_details_as_given_including_a_new_title()
    {
        var session = Unscheduled();

        session.Schedule(Details(title: "Renamed for this year", venue: "New hall"), Later);

        Assert.Equal("Renamed for this year", session.Title);
        Assert.Equal("New hall", session.Venue);
    }

    [Fact]
    public void Schedule_runs_the_same_checks_as_a_new_session_and_changes_nothing_when_they_fail()
    {
        var session = Unscheduled();

        var result = session.Schedule(Details(start: new TimeOnly(11, 0), end: new TimeOnly(9, 0)), Later);

        Assert.Equal(["The end must be after the start."], result.Error.FieldErrors!["endTime"]);
        Assert.Equal(SessionStatus.Unscheduled, session.Status);
        Assert.Null(session.Date);
        Assert.Null(session.HostType);
    }

    [Fact]
    public void Schedule_needs_a_host_and_a_person_responsible()
    {
        var session = Unscheduled();
        var details = Details(host: new HostRef(HostType.Alumni, null, null, null)) with { AssigneeId = " ", AssigneeName = " " };

        var result = session.Schedule(details, Later);

        Assert.Equal(["Choose who is responsible for this session."], result.Error.FieldErrors!["assigneeId"]);
        Assert.Contains("hostId", result.Error.FieldErrors.Keys);
    }

    [Fact]
    public void Schedule_is_only_for_an_unscheduled_session()
    {
        var planned = InformationSession.Create(CampaignId, Details(), "manager-1", "Dara Manager", Now).Value;

        var result = planned.Schedule(Details(), Later);

        Assert.Equal(SessionErrors.NotUnscheduled, result.Error);
    }

    // ---------- What an unscheduled session can and cannot do ----------

    [Fact]
    public void Update_is_only_for_a_planned_session_so_an_unscheduled_one_must_be_scheduled()
    {
        var session = Unscheduled();

        var result = session.Update(Details(), Later);

        Assert.Equal(SessionErrors.NotPlanned, result.Error);
        Assert.Null(session.Date);
    }

    [Fact]
    public void An_unscheduled_session_can_be_cancelled_and_stays_without_a_date()
    {
        var session = Unscheduled();

        var result = session.Cancel("Not running this year", Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(SessionStatus.Cancelled, session.Status);
        Assert.Null(session.Date);
        Assert.Equal("Not running this year", session.CancelReason);
    }

    [Fact]
    public void An_unscheduled_session_can_have_an_expected_number()
    {
        var session = Unscheduled();

        var result = session.SetExpected(40, Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(40, session.ExpectedCandidates);
        Assert.Equal(SessionStatus.Unscheduled, session.Status);
    }

    [Fact]
    public void Attendance_cannot_be_recorded_before_the_session_has_a_date()
    {
        var session = Unscheduled();

        var result = session.RecordAttendance(10, 12, "officer-1", "Sokha Officer", Later);

        Assert.Equal(SessionErrors.NotScheduled, result.Error);
        Assert.Equal(SessionStatus.Unscheduled, session.Status);
        Assert.False(session.HasAttendance);
    }

    [Fact]
    public void Attendance_still_works_on_a_scheduled_session_whose_date_has_come()
    {
        var session = Unscheduled();
        session.Schedule(Details(date: new DateOnly(2027, 3, 10)), Later);

        var result = session.RecordAttendance(10, 12, "officer-1", "Sokha Officer", Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(SessionStatus.Done, session.Status);
        Assert.Equal(22, session.ActualTotal);
    }
}
