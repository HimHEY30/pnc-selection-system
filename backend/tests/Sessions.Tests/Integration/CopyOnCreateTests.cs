using System.Net;
using System.Net.Http.Json;
using Campaigns.Application;
using Sessions.Application;
using static Sessions.Tests.Integration.ApiHelpers;

namespace Sessions.Tests.Integration;

/// <summary>Creating a campaign from a copy with the information sessions ticked, through the real API and a real PostgreSQL.</summary>
[Collection(SessionsApiCollection.Name)]
public sealed class CopyOnCreateTests
{
    private readonly SessionsApiFixture _fixture;

    public CopyOnCreateTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");

    /// <summary>A campaign with two sessions (one in Siem Reap) and a third that was cancelled.</summary>
    private async Task<Guid> SourceWithSessionsAsync()
    {
        var manager = Manager();
        var source = await manager.CreateCampaignAsync(2, 17);
        (await manager.PostSessionAsync(source.Id, SessionForm(title: "Open day", province: 17))).EnsureSuccessStatusCode();
        (await manager.PostSessionAsync(source.Id, SessionForm(title: "Visit to Hope School"))).EnsureSuccessStatusCode();
        var cancelled = await (await manager.PostSessionAsync(source.Id, SessionForm(title: "Called off"))).ReadAsync<SessionDto>();
        (await manager.CancelSessionAsync(source.Id, cancelled.Id, "Rain")).EnsureSuccessStatusCode();
        return source.Id;
    }

    private async Task<CampaignDetailDto> CopyAsync(Guid source, params string[] parts)
    {
        var response = await Manager().PostAsJsonAsync("/api/campaigns", new CreateCampaignRequest(
            $"Selection {Guid.NewGuid():N}", "2027–2028", null, StartModes.Copy, new CopyFromRequest(source, parts)));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
    }

    private Task<SessionListDto> ListAsync(Guid campaignId) =>
        Manager().GetFromJsonAsync<SessionListDto>($"/api/campaigns/{campaignId}/sessions")!;

    [Fact]
    public async Task Preview_CountsTheSessionsThatAreNotCancelled()
    {
        var source = await SourceWithSessionsAsync();

        var preview = await Manager().GetFromJsonAsync<CopyPreviewDto>($"/api/campaigns/{source}/copy-preview");

        var sessions = preview!.Parts.Single(p => p.Key == CopyParts.InformationSessions);
        Assert.True(sessions.Available);
        Assert.Equal(2, sessions.Count);
    }

    [Fact]
    public async Task Create_ByCopyingSessions_MakesUnscheduledOnesWithNoDateTimesPersonOrHost()
    {
        var source = await SourceWithSessionsAsync();

        var copy = await CopyAsync(source, CopyParts.Provinces, CopyParts.InformationSessions);

        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied", $"{CopyParts.InformationSessions}:Copied"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}"));
        Assert.Equal(2, copy.CopyResults![1].Count);

        var list = await ListAsync(copy.Id);
        Assert.Equal(["Open day", "Visit to Hope School"], list.Sessions.Select(s => s.Title).Order());
        Assert.All(list.Sessions, s =>
        {
            Assert.Equal("Unscheduled", s.Status);
            Assert.Null(s.Date);
            Assert.Null(s.StartTime);
            Assert.Null(s.EndTime);
            Assert.Null(s.Assignee);
            Assert.Null(s.Host);
            Assert.Null(s.ExpectedCandidates);
            Assert.Null(s.Attendance);
        });
        Assert.Equal(2, list.Summary.Unscheduled);
        Assert.Equal(0, list.Summary.Planned);
        Assert.Equal((short)17, list.Sessions.Single(s => s.Title == "Open day").Province!.Id);
    }

    [Fact]
    public async Task Create_ByCopyingSessions_LeavesStep3InProgress_AndTheSourceUnchanged()
    {
        var source = await SourceWithSessionsAsync();
        var before = await ListAsync(source);

        var copy = await CopyAsync(source, CopyParts.InformationSessions);

        Assert.Equal("InProgress", copy.Steps.Single(s => s.Step == "InformationSessions").Status);
        var after = await ListAsync(source);
        Assert.Equal(before.Sessions.Select(s => (s.Id, s.Status, s.UpdatedAt)), after.Sessions.Select(s => (s.Id, s.Status, s.UpdatedAt)));
    }

    [Fact]
    public async Task Create_ByCopyingSessionsWithoutProvinces_CopiesThemAndLeavesTheProvinceEmpty()
    {
        var source = await SourceWithSessionsAsync();

        var copy = await CopyAsync(source, CopyParts.InformationSessions);

        var result = Assert.Single(copy.CopyResults!);
        Assert.Equal(CopyOutcomes.Partly, result.Outcome);
        Assert.Equal(2, result.Count);
        Assert.Contains("1 session(s) had a province", Assert.Single(result.Issues));
        Assert.All((await ListAsync(copy.Id)).Sessions, s => Assert.Null(s.Province));
    }

    [Fact]
    public async Task ACopiedSession_CanBeScheduledLater_AndThenIsPlannedAndTheStepIsComplete()
    {
        var source = await SourceWithSessionsAsync();
        var copy = await CopyAsync(source, CopyParts.Provinces, CopyParts.InformationSessions);
        var session = (await ListAsync(copy.Id)).Sessions.First(s => s.Title == "Open day");
        var day = NextFutureDay();

        var scheduled = await (await Manager().PutSessionAsync(copy.Id, session.Id, SessionForm(day, title: "Open day", province: 17))).ReadAsync<SessionDto>();

        Assert.Equal("Planned", scheduled.Status);
        Assert.Equal(day, scheduled.Date);
        Assert.Equal("09:00", scheduled.StartTime);
        Assert.Equal("officer-1", scheduled.Assignee!.Id);
        Assert.Equal("Officer", scheduled.Host!.Type);
        var detail = await Manager().GetFromJsonAsync<CampaignDetailDto>($"/api/campaigns/{copy.Id}");
        Assert.Equal("Complete", detail!.Steps.Single(s => s.Step == "InformationSessions").Status);
        var list = await ListAsync(copy.Id);
        Assert.Equal(1, list.Summary.Planned);
        Assert.Equal(1, list.Summary.Unscheduled);
    }

    [Fact]
    public async Task ACopiedSession_CannotBeScheduledWithoutAHost_AndStaysUnscheduled()
    {
        var source = await SourceWithSessionsAsync();
        var copy = await CopyAsync(source, CopyParts.InformationSessions);
        var session = (await ListAsync(copy.Id)).Sessions.First();

        var response = await Manager().PutSessionAsync(copy.Id, session.Id, SessionForm(hostType: "", hostUserId: null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Unscheduled", (await ListAsync(copy.Id)).Sessions.Single(s => s.Id == session.Id).Status);
    }

    [Fact]
    public async Task ACopiedSession_RefusesAttendanceUntilItIsScheduled()
    {
        var source = await SourceWithSessionsAsync();
        var copy = await CopyAsync(source, CopyParts.InformationSessions);
        var session = (await ListAsync(copy.Id)).Sessions.First();

        var response = await Manager().PutAttendanceAsync(copy.Id, session.Id, 5, 5);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task ACopiedSession_CanBeCancelled()
    {
        var source = await SourceWithSessionsAsync();
        var copy = await CopyAsync(source, CopyParts.InformationSessions);
        var session = (await ListAsync(copy.Id)).Sessions.First();

        var cancelled = await (await Manager().CancelSessionAsync(copy.Id, session.Id, "Not this year")).ReadAsync<SessionDto>();

        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Null(cancelled.Date);
    }

    [Fact]
    public async Task Create_ByCopyingSessionsFromACampaignWithNone_StillCreatesTheCampaign_AndReportsTheFailure()
    {
        var empty = await Manager().CreateCampaignAsync();

        var copy = await CopyAsync(empty.Id, CopyParts.Provinces, CopyParts.InformationSessions);

        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied", $"{CopyParts.InformationSessions}:Failed"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}"));
        Assert.Empty((await ListAsync(copy.Id)).Sessions);
    }

    [Fact]
    public async Task CopyingEverything_BringsTheProvincesDetailsRulesAndSessionsTogether()
    {
        var source = await SourceWithSessionsAsync();

        var copy = await CopyAsync(source, [.. CopyParts.All]);

        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied", $"{CopyParts.Details}:Copied", $"{CopyParts.EligibilityRules}:Failed", $"{CopyParts.InformationSessions}:Copied"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}"));
        Assert.Equal(1500, copy.ExpectedCandidates);
        Assert.Equal(2, (await ListAsync(copy.Id)).Sessions.Count);
    }
}
