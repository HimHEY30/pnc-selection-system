using System.Net;
using Sessions.Application;
using static Sessions.Tests.Integration.ApiHelpers;

namespace Sessions.Tests.Integration;

/// <summary>
/// Who may do what. Admin and manager create, change and cancel sessions. Officers read everything and can enter the
/// expected and actual numbers, but not create, change or cancel. Committee members and people with no role get nothing.
/// </summary>
[Collection(SessionsApiCollection.Name)]
public sealed class SessionAuthorizationTests
{
    private readonly SessionsApiFixture _fixture;

    public SessionAuthorizationTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");

    /// <summary>A campaign with one session whose date has passed, so every endpoint has something real to act on.</summary>
    private async Task<(Guid Campaign, SessionDto Session)> SetUpAsync()
    {
        var campaign = (await Manager().CreateCampaignAsync()).Id;
        var session = await (await Manager().PostSessionAsync(campaign, SessionForm(NextPastDay()))).ReadAsync<SessionDto>();
        return (campaign, session);
    }

    private static Task<HttpResponseMessage>[] EveryEndpoint(HttpClient client, Guid campaign, SessionDto session) =>
    [
        client.GetAsync($"/api/campaigns/{campaign}/sessions"),
        client.GetAsync($"/api/campaigns/{campaign}/sessions/{session.Id}"),
        client.GetAsync("/api/sessions/mine"),
        client.PostSessionAsync(campaign, SessionForm()),
        client.PutSessionAsync(campaign, session.Id, SessionForm(session.Date)),
        client.CancelSessionAsync(campaign, session.Id, "x"),
        client.PutExpectedAsync(campaign, session.Id, 5),
        client.PutAttendanceAsync(campaign, session.Id, 1, 1),
    ];

    [Fact]
    public async Task WithoutSigningIn_EveryEndpointReturns401()
    {
        var (campaign, session) = await SetUpAsync();

        var responses = await Task.WhenAll(EveryEndpoint(_fixture.CreateClient(), campaign, session));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
    }

    [Theory]
    [InlineData(Roles.CommitteeUser)]
    [InlineData("some-other-role")]
    public async Task CommitteeMembersAndRoleLessUsers_GetNothing(string role)
    {
        var (campaign, session) = await SetUpAsync();

        var responses = await Task.WhenAll(EveryEndpoint(_fixture.CreateClient("Someone", role).AsUser("someone"), campaign, session));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
    }

    [Fact]
    public async Task AnOfficer_CanReadAndEnterTheNumbers_ButNotCreateChangeOrCancel()
    {
        var (campaign, session) = await SetUpAsync();
        var officer = _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer).AsUser("officer-1");

        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync($"/api/campaigns/{campaign}/sessions")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync($"/api/campaigns/{campaign}/sessions/{session.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync("/api/sessions/mine")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.PutExpectedAsync(campaign, session.Id, 30)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.PutAttendanceAsync(campaign, session.Id, 10, 12)).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await officer.PostSessionAsync(campaign, SessionForm())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.PutSessionAsync(campaign, session.Id, SessionForm(session.Date))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.CancelSessionAsync(campaign, session.Id, "x")).StatusCode);
    }

    [Fact]
    public async Task AnAdmin_CanDoWhatAManagerCan()
    {
        var campaign = (await Manager().CreateCampaignAsync()).Id;
        var admin = _fixture.CreateClient("Admin Demo", Roles.SystemAdmin).AsUser("admin-1");

        var created = await admin.PostSessionAsync(campaign, SessionForm(NextPastDay()));
        var session = await created.ReadAsync<SessionDto>();

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutSessionAsync(campaign, session.Id, SessionForm(session.Date, title: "Changed"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutExpectedAsync(campaign, session.Id, 10)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAttendanceAsync(campaign, session.Id, 3, 4)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.CancelSessionAsync(campaign, session.Id, "x")).StatusCode); // already done
    }

    [Fact]
    public async Task ABrokenRequestBody_IsA400NotA500()
    {
        var (campaign, _) = await SetUpAsync();
        var manager = Manager();

        var response = await manager.PostAsync($"/api/campaigns/{campaign}/sessions", new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ANameThatTheServerDoesNotKnow_IsRefusedNotGuessed()
    {
        var (campaign, _) = await SetUpAsync();

        var format = await Manager().PostSessionAsync(campaign, SessionForm(format: "Telepathy"));
        var host = await Manager().PostSessionAsync(campaign, SessionForm(hostType: "Robot"));

        Assert.Equal(HttpStatusCode.BadRequest, format.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, host.StatusCode);
    }
}
