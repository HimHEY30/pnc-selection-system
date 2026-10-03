using System.Net;
using System.Net.Http.Json;
using Campaigns.Application;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Sessions.Application;
using Sessions.Domain;
using static Sessions.Tests.Integration.ApiHelpers;

namespace Sessions.Tests.Integration;

/// <summary>Create, change, cancel and the numbers, through the real API and a real PostgreSQL.</summary>
[Collection(SessionsApiCollection.Name)]
public sealed class SessionFlowTests
{
    private readonly SessionsApiFixture _fixture;

    public SessionFlowTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");
    private HttpClient Officer() => _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer).AsUser("officer-1");

    private async Task<Guid> NewCampaignAsync() => (await Manager().CreateCampaignAsync()).Id;

    private async Task<HostDto> NewHostAsync(string type = "Alumni") =>
        await (await Manager().PostAsJsonAsync("/api/session-hosts", new HostRequest(
            type,
            $"Host {Guid.NewGuid():N}",
            type == "Partner" ? "HighSchool" : null,
            null,
            "012 345 678",
            null))).ReadAsync<HostDto>();

    private async Task<string> Step3Async(Guid campaignId) =>
        (await Manager().GetFromJsonAsync<CampaignDetailDto>($"/api/campaigns/{campaignId}"))!
            .Steps.Single(s => s.Step == "InformationSessions").Status;

    private static async Task<ValidationProblemDetails> ProblemAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;

    // ---------- Create and read ----------

    [Fact]
    public async Task AManager_CreatesASessionAssignedToAnOfficer_AndItShowsInTheCampaignsList()
    {
        var campaign = await NewCampaignAsync();
        var form = SessionForm(province: 17);

        var response = await Manager().PostSessionAsync(campaign, form);
        var session = await response.ReadAsync<SessionDto>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/api/campaigns/{campaign}/sessions/{session.Id}", response.Headers.Location!.OriginalString);
        Assert.Equal("Planned", session.Status);
        Assert.Equal(new PersonDto("officer-1", "Sokha Officer"), session.Assignee);
        Assert.Equal("Officer", session.Host.Type);
        Assert.Equal("Siem Reap", session.Province!.Name);
        Assert.Equal("Dara Manager", session.CreatedByName);

        var list = await (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions")).ReadAsync<SessionListDto>();
        Assert.Equal([session.Id], list.Sessions.Select(s => s.Id));
        Assert.True(list.IsEditable);
        Assert.Equal(1, list.Summary.Total);
        Assert.Equal(1, list.Summary.Planned);
        Assert.Contains(list.TargetProvinces, p => p.Name == "Battambang");

        var one = await (await Officer().GetAsync($"/api/campaigns/{campaign}/sessions/{session.Id}")).ReadAsync<SessionDto>();
        Assert.Equal(session.Title, one.Title);
    }

    [Fact]
    public async Task AManager_CanAssignASessionToThemselvesAndHaveAnAlumnusOrAPartnerRunIt()
    {
        var campaign = await NewCampaignAsync();
        var alumnus = await NewHostAsync("Alumni");
        var partner = await NewHostAsync("Partner");

        var mine = await (await Manager().PostSessionAsync(campaign, SessionForm(
            assignee: "manager-1", hostType: "Alumni", hostId: alumnus.Id, hostUserId: null))).ReadAsync<SessionDto>();
        var online = await (await Manager().PostSessionAsync(campaign, SessionForm(
            assignee: "manager-1", format: "Online", venue: null, link: "https://meet.example.org/room",
            hostType: "Partner", hostId: partner.Id, hostUserId: null))).ReadAsync<SessionDto>();

        Assert.Equal(new PersonDto("manager-1", "Dara Manager"), mine.Assignee);
        Assert.Equal(alumnus.Name, mine.Host.Name);
        Assert.Equal("Alumni", mine.Host.Type);
        Assert.Equal("Partner", online.Host.Type);
        Assert.Equal("HighSchool", online.Host.PartnerKind);
        Assert.Equal("Online", online.Format);
        Assert.Equal("https://meet.example.org/room", online.MeetingLink);
    }

    [Fact]
    public async Task ABadForm_IsRefusedWithAMessagePerField_AndNothingIsSaved()
    {
        var campaign = await NewCampaignAsync();

        var response = await Manager().PostSessionAsync(campaign, SessionForm(title: " ", end: "08:00", venue: null, assignee: "nobody"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Equal(["assigneeId", "endTime", "title", "venue"], problem.Errors.Keys.Order(StringComparer.Ordinal));
        Assert.Equal("sessions.invalid", problem.Extensions["code"]!.ToString());

        var list = await (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions")).ReadAsync<SessionListDto>();
        Assert.Empty(list.Sessions);
    }

    [Fact]
    public async Task AProvinceTheCampaignDoesNotTarget_IsRefused()
    {
        var campaign = await NewCampaignAsync();

        var response = await Manager().PostSessionAsync(campaign, SessionForm(province: 5));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("provinceId", (await ProblemAsync(response)).Errors.Keys);
    }

    [Fact]
    public async Task AHostWhoAlreadyRunsASessionAtThatTime_IsRefusedAcrossCampaigns()
    {
        var first = await NewCampaignAsync();
        var second = await NewCampaignAsync();
        var day = NextFutureDay();
        await (await Manager().PostSessionAsync(first, SessionForm(day))).ReadAsync<SessionDto>();

        var clash = await Manager().PostSessionAsync(second, SessionForm(day, start: "10:30", end: "12:00"));
        var after = await Manager().PostSessionAsync(second, SessionForm(day, start: "11:00", end: "12:00"));

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal("sessions.host_busy", (await clash.Content.ReadFromJsonAsync<ProblemDetails>())!.Extensions["code"]!.ToString());
        Assert.Equal(HttpStatusCode.Created, after.StatusCode);
    }

    [Fact]
    public async Task WhenKeycloakCannotBeAsked_AssigningToSomeoneElseSaysSo_ButAssigningToYourselfStillWorks()
    {
        var campaign = await NewCampaignAsync();
        var alumnus = await NewHostAsync();
        var original = _fixture.StaffDirectory.Staff;
        _fixture.StaffDirectory.Staff = null;
        try
        {
            var other = await Manager().PostSessionAsync(campaign, SessionForm());
            var myself = await Manager().PostSessionAsync(campaign, SessionForm(
                assignee: "manager-1", hostType: "Alumni", hostId: alumnus.Id, hostUserId: null));

            Assert.Equal(HttpStatusCode.ServiceUnavailable, other.StatusCode);
            Assert.Equal(HttpStatusCode.Created, myself.StatusCode);
        }
        finally
        {
            _fixture.StaffDirectory.Staff = original;
        }
    }

    // ---------- Change and cancel ----------

    [Fact]
    public async Task AManager_ChangesAPlannedSession()
    {
        var campaign = await NewCampaignAsync();
        var session = await (await Manager().PostSessionAsync(campaign, SessionForm())).ReadAsync<SessionDto>();

        var updated = await (await Manager().PutSessionAsync(campaign, session.Id, SessionForm(
            session.Date, title: "Moved online", format: "Online", venue: null, link: "https://meet.example.org/x", assignee: "officer-2")))
            .ReadAsync<SessionDto>();

        Assert.Equal("Moved online", updated.Title);
        Assert.Equal("Online", updated.Format);
        Assert.Null(updated.Venue);
        Assert.Equal("Vanna Officer", updated.Assignee.Name);
    }

    [Fact]
    public async Task AManager_CancelsASession_WithAReason_AndItCannotBeChangedAfterwards()
    {
        var campaign = await NewCampaignAsync();
        var session = await (await Manager().PostSessionAsync(campaign, SessionForm())).ReadAsync<SessionDto>();

        var missingReason = await Manager().CancelSessionAsync(campaign, session.Id, " ");
        var cancelled = await (await Manager().CancelSessionAsync(campaign, session.Id, "School closed")).ReadAsync<SessionDto>();
        var again = await Manager().CancelSessionAsync(campaign, session.Id, "Again");
        var edit = await Manager().PutSessionAsync(campaign, session.Id, SessionForm(session.Date));

        Assert.Equal(HttpStatusCode.BadRequest, missingReason.StatusCode);
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal("School closed", cancelled.CancelReason);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
    }

    [Fact]
    public async Task AnUnknownSessionOrCampaign_IsNotFound()
    {
        var campaign = await NewCampaignAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{Guid.NewGuid()}/sessions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().PostSessionAsync(Guid.NewGuid(), SessionForm())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().PutSessionAsync(campaign, Guid.NewGuid(), SessionForm())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Officer().PutExpectedAsync(campaign, Guid.NewGuid(), 10)).StatusCode);
    }

    [Fact]
    public async Task ASessionOfAnotherCampaign_IsNotFoundUnderThisOne()
    {
        var first = await NewCampaignAsync();
        var second = await NewCampaignAsync();
        var session = await (await Manager().PostSessionAsync(first, SessionForm())).ReadAsync<SessionDto>();

        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{second}/sessions/{session.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().CancelSessionAsync(second, session.Id, "x")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Officer().PutAttendanceAsync(second, session.Id, 1, 1)).StatusCode);
    }

    // ---------- Step 3 ----------

    [Fact]
    public async Task Step3_FollowsTheSessions()
    {
        var campaign = await NewCampaignAsync();
        Assert.Equal("NotStarted", await Step3Async(campaign));

        var session = await (await Manager().PostSessionAsync(campaign, SessionForm())).ReadAsync<SessionDto>();
        Assert.Equal("Complete", await Step3Async(campaign));

        await Manager().CancelSessionAsync(campaign, session.Id, "Rain");
        Assert.Equal("InProgress", await Step3Async(campaign));

        await Manager().PostSessionAsync(campaign, SessionForm());
        Assert.Equal("Complete", await Step3Async(campaign));
    }

    // ---------- The numbers ----------

    [Fact]
    public async Task AnOfficer_SetsTheExpectedNumber_AndLaterRecordsFemalesAndMales()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();

        var expected = await (await Officer().PutExpectedAsync(campaign, held.Id, 40)).ReadAsync<SessionDto>();
        var done = await (await Officer().PutAttendanceAsync(campaign, held.Id, 18, 12)).ReadAsync<SessionDto>();

        Assert.Equal(40, expected.ExpectedCandidates);
        Assert.Equal("Done", done.Status);
        Assert.Equal(40, done.ExpectedCandidates);
        Assert.Equal(18, done.Attendance!.Female);
        Assert.Equal(12, done.Attendance.Male);
        Assert.Equal(30, done.Attendance.Total);
        Assert.Equal("Sokha Officer", done.Attendance.RecordedByName);

        var list = await (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions")).ReadAsync<SessionListDto>();
        Assert.Equal(new SessionSummaryDto(1, 0, 1, 0, 40, 18, 12, 30), list.Summary);
    }

    [Fact]
    public async Task ExpectedCanBeClearedAndAttendanceCorrected()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();
        await Officer().PutExpectedAsync(campaign, held.Id, 40);
        await Officer().PutAttendanceAsync(campaign, held.Id, 18, 12);

        var cleared = await (await Officer().PutExpectedAsync(campaign, held.Id, null)).ReadAsync<SessionDto>();
        var corrected = await (await Manager().PutAttendanceAsync(campaign, held.Id, 20, 12)).ReadAsync<SessionDto>();

        Assert.Null(cleared.ExpectedCandidates);
        Assert.Equal(32, corrected.Attendance!.Total);
        Assert.Equal("Dara Manager", corrected.Attendance.RecordedByName);
    }

    [Fact]
    public async Task AttendanceBeforeTheDay_IsRefused()
    {
        var campaign = await NewCampaignAsync();
        var future = await (await Manager().PostSessionAsync(campaign, SessionForm())).ReadAsync<SessionDto>();

        var response = await Officer().PutAttendanceAsync(campaign, future.Id, 5, 5);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("sessions.not_held_yet", (await response.Content.ReadFromJsonAsync<ProblemDetails>())!.Extensions["code"]!.ToString());
    }

    [Fact]
    public async Task BadNumbers_AreRefusedPerField()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();

        var negative = await Officer().PutAttendanceAsync(campaign, held.Id, -1, 5000);
        var missing = await Officer().PutAttendanceAsync(campaign, held.Id, 5, null);
        var tooMany = await Officer().PutExpectedAsync(campaign, held.Id, 5001);

        Assert.Equal(["female"], (await ProblemAsync(negative)).Errors.Keys);
        Assert.Equal(["male"], (await ProblemAsync(missing)).Errors.Keys);
        Assert.Equal(["expected"], (await ProblemAsync(tooMany)).Errors.Keys);
    }

    [Fact]
    public async Task NumbersCannotBeEnteredForACancelledSession()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();
        await Manager().CancelSessionAsync(campaign, held.Id, "Rain");

        Assert.Equal(HttpStatusCode.Conflict, (await Officer().PutExpectedAsync(campaign, held.Id, 10)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Officer().PutAttendanceAsync(campaign, held.Id, 1, 1)).StatusCode);
    }

    // ---------- My sessions ----------

    [Fact]
    public async Task MySessions_ListWhatIAmResponsibleForOrRun_AcrossCampaigns()
    {
        var first = await NewCampaignAsync();
        var second = await NewCampaignAsync();
        var mineAssigned = await (await Manager().PostSessionAsync(first, SessionForm(assignee: "officer-2", hostUserId: "officer-1"))).ReadAsync<SessionDto>();
        var mineRun = await (await Manager().PostSessionAsync(second, SessionForm(assignee: "officer-1", hostUserId: "officer-2"))).ReadAsync<SessionDto>();
        var notMine = await (await Manager().PostSessionAsync(first, SessionForm(assignee: "officer-2", hostUserId: "officer-2"))).ReadAsync<SessionDto>();

        var mine = await (await Officer().GetAsync("/api/sessions/mine")).ReadAsync<List<MySessionDto>>();

        Assert.Contains(mine, m => m.Session.Id == mineAssigned.Id);
        Assert.Contains(mine, m => m.Session.Id == mineRun.Id);
        Assert.DoesNotContain(mine, m => m.Session.Id == notMine.Id);
        Assert.All(mine, m => Assert.False(string.IsNullOrEmpty(m.CampaignName)));
    }

    // ---------- Campaign status ----------

    [Fact]
    public async Task WhileTheCampaignRuns_SessionsCanStillBeAdded_AndStep3IsLeftAlone()
    {
        var campaign = await NewCampaignAsync();
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 1 where id = @id", ("id", campaign)); // Active

        var response = await Manager().PostSessionAsync(campaign, SessionForm());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("NotStarted", await Step3Async(campaign));
    }

    [Fact]
    public async Task OnceTheCampaignIsClosed_SessionsCannotBeChanged_ButTheNumbersStillCan()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 2 where id = @id", ("id", campaign)); // Closed

        var create = await Manager().PostSessionAsync(campaign, SessionForm());
        var update = await Manager().PutSessionAsync(campaign, held.Id, SessionForm(held.Date));
        var cancel = await Manager().CancelSessionAsync(campaign, held.Id, "x");
        var expected = await Officer().PutExpectedAsync(campaign, held.Id, 20);
        var attendance = await Officer().PutAttendanceAsync(campaign, held.Id, 7, 8);
        var list = await (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions")).ReadAsync<SessionListDto>();

        Assert.Equal(HttpStatusCode.Conflict, create.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, update.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);
        Assert.Equal(HttpStatusCode.OK, expected.StatusCode);
        Assert.Equal(HttpStatusCode.OK, attendance.StatusCode);
        Assert.False(list.IsEditable);
        Assert.Equal("Closed", list.CampaignStatus);
    }

    // ---------- Audit ----------

    [Fact]
    public async Task EveryChangeIsWrittenToTheAuditLog_WithWhoDidIt()
    {
        var campaign = await NewCampaignAsync();
        var held = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();
        await Manager().PutSessionAsync(campaign, held.Id, SessionForm(held.Date, title: "Renamed"));
        await Officer().PutExpectedAsync(campaign, held.Id, 40);
        await Officer().PutAttendanceAsync(campaign, held.Id, 18, 12);

        var actions = await _fixture.ScalarAsync<string>(
            "select string_agg(action::text, ',' order by changed_at, action) from sessions.audit_log where entity = 1 and entity_id = @id",
            ("id", held.Id));
        var officerLines = await _fixture.ScalarAsync<long>(
            "select count(*) from sessions.audit_log where entity_id = @id and changed_by_id = 'officer-1' and changed_by_name = 'Sokha Officer'",
            ("id", held.Id));

        Assert.Equal("1,2,4,5", actions);
        Assert.Equal(2, officerLines);
    }

    // ---------- Two people at once ----------

    [Fact]
    public async Task TwoPeopleSavingTheSameSessionAtOnce_TheSecondIsToldToReload()
    {
        var campaign = await NewCampaignAsync();
        var session = await (await Manager().PostSessionAsync(campaign, SessionForm())).ReadAsync<SessionDto>();

        await using var first = _fixture.Services.CreateAsyncScope();
        await using var second = _fixture.Services.CreateAsyncScope();
        var firstRepo = first.ServiceProvider.GetRequiredService<ISessionRepository>();
        var secondRepo = second.ServiceProvider.GetRequiredService<ISessionRepository>();

        var mine = (await firstRepo.GetSessionAsync(campaign, session.Id, CancellationToken.None))!;
        var theirs = (await secondRepo.GetSessionAsync(campaign, session.Id, CancellationToken.None))!;
        var now = DateTimeOffset.UtcNow;
        mine.SetExpected(10, now);
        theirs.SetExpected(20, now);

        Assert.True((await firstRepo.SaveChangesAsync(CancellationToken.None)).IsSuccess);
        var lost = await secondRepo.SaveChangesAsync(CancellationToken.None);

        Assert.Equal(SessionErrors.ConcurrentEdit, lost.Error);
        var final = await (await Manager().GetAsync($"/api/campaigns/{campaign}/sessions/{session.Id}")).ReadAsync<SessionDto>();
        Assert.Equal(10, final.ExpectedCandidates);
    }
}
