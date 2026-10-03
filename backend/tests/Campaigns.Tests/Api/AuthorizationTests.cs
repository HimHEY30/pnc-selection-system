using System.Net;
using System.Net.Http.Json;
using Campaigns.Tests.Infrastructure;

namespace Campaigns.Tests.Api;

/// <summary>
/// Who may do what: reading is for admin, manager and officer; creating and editing is for
/// admin and manager only; committee members and role-less users get nothing.
/// </summary>
[Collection(CampaignsApiCollection.Name)]
public sealed class AuthorizationTests
{
    private readonly CampaignsApiFixture _fixture;

    public AuthorizationTests(CampaignsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private static Guid AnyId => Guid.NewGuid();

    // ---------- Not signed in ----------

    [Fact]
    public async Task WithoutSigningIn_EveryEndpointReturns401()
    {
        var anonymous = _fixture.CreateClient();
        var id = AnyId;

        var responses = new[]
        {
            await anonymous.GetAsync("/api/campaigns"),
            await anonymous.GetAsync($"/api/campaigns/{id}"),
            await anonymous.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate()),
            await anonymous.SaveDraftAsync(id, TestData.MinimalInfo("x")),
            await anonymous.CompleteInfoAsync(id, TestData.ValidInfo("x")),
            await anonymous.GetAsync("/api/provinces"),
        };

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
    }

    // ---------- Read access ----------

    [Theory]
    [InlineData(Roles.SystemAdmin)]
    [InlineData(Roles.SelectionManager)]
    [InlineData(Roles.SelectionOfficer)]
    public async Task OperationsRoles_CanReadCampaignsAndProvinces(string role)
    {
        var client = _fixture.CreateClient(null, role);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/campaigns")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/provinces")).StatusCode);
    }

    [Theory]
    [InlineData(Roles.CommitteeUser)]
    [InlineData("some-other-role")]
    public async Task CommitteeAndRoleLessUsers_CannotReadCampaigns(string role)
    {
        var client = _fixture.CreateClient(null, role);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/campaigns")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/campaigns/{AnyId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/provinces")).StatusCode);
    }

    // ---------- Write access ----------

    [Theory]
    [InlineData(Roles.SystemAdmin)]
    [InlineData(Roles.SelectionManager)]
    public async Task ManagementRoles_CanCreateAndEdit(string role)
    {
        var client = _fixture.CreateClient("Someone", role);

        var campaign = await client.CreateCampaignAsync();
        var draft = await client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name));
        var complete = await client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name));

        Assert.Equal(HttpStatusCode.OK, draft.StatusCode);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
    }

    [Fact]
    public async Task SelectionOfficer_CannotCreateOrEdit_ButCanStillReadWhatAManagerCreated()
    {
        var manager = _fixture.CreateManagerClient();
        var campaign = await manager.CreateCampaignAsync();
        var officer = _fixture.CreateClient(null, Roles.SelectionOfficer);

        var create = await officer.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate());
        var draft = await officer.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name));
        var complete = await officer.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name));
        var read = await officer.GetAsync($"/api/campaigns/{campaign.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, draft.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, complete.StatusCode);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    [Fact]
    public async Task CommitteeUser_CannotCreateOrEdit()
    {
        var client = _fixture.CreateClient(null, Roles.CommitteeUser);

        var create = await client.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate());
        var draft = await client.SaveDraftAsync(AnyId, TestData.MinimalInfo("x"));

        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, draft.StatusCode);
    }

    [Fact]
    public async Task ForbiddenCreate_DoesNotCreateAnything()
    {
        var name = TestData.UniqueName();
        await _fixture.CreateClient(null, Roles.SelectionOfficer).PostAsJsonAsync("/api/campaigns", TestData.ValidCreate(name));

        var list = await _fixture.CreateManagerClient().GetFromJsonAsync<List<Campaigns.Application.CampaignSummaryDto>>("/api/campaigns");

        Assert.DoesNotContain(list!, c => c.Name == name);
    }

    [Fact]
    public async Task UserWithBothAnOperationsAndAManagementRole_CanWrite()
    {
        var client = _fixture.CreateClient(null, Roles.SelectionOfficer, Roles.SelectionManager);

        var response = await client.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }
}
