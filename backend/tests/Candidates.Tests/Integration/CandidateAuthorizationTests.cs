using System.Net;
using Candidates.Application;
using static Candidates.Tests.Integration.ApiHelpers;

namespace Candidates.Tests.Integration;

/// <summary>
/// Who may do what. Admin, manager and officer read, add and change candidates; only admin and manager delete.
/// Committee members and people with no role get nothing, and nobody gets in without signing in.
/// </summary>
[Collection(CandidatesApiCollection.Name)]
public sealed class CandidateAuthorizationTests
{
    private readonly CandidatesApiFixture _fixture;

    public CandidateAuthorizationTests(CandidatesApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager);

    private async Task<(Guid Campaign, CandidateDto Candidate)> SetUpAsync()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var candidate = await (await Manager().PostCandidateAsync(campaign, CandidateForm())).ReadAsync<CandidateDto>();
        return (campaign, candidate);
    }

    private static Task<HttpResponseMessage>[] EveryEndpoint(HttpClient client, Guid campaign, CandidateDto candidate) =>
    [
        client.GetAsync($"/api/campaigns/{campaign}/candidates"),
        client.GetAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}"),
        client.GetAsync($"/api/campaigns/{campaign}/candidates/session-choices"),
        client.GetAsync("/api/candidate-schools"),
        client.PostCandidateAsync(campaign, CandidateForm()),
        client.PutCandidateAsync(campaign, candidate.Id, CandidateForm(phone: candidate.Phone, version: candidate.Version)),
        client.DeleteAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}"),
    ];

    [Fact]
    public async Task WithoutSigningIn_EveryEndpointReturns401()
    {
        var (campaign, candidate) = await SetUpAsync();

        var responses = await Task.WhenAll(EveryEndpoint(_fixture.CreateClient(), campaign, candidate));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
    }

    [Theory]
    [InlineData(Roles.CommitteeUser)]
    [InlineData("some-other-role")]
    public async Task CommitteeMembersAndRoleLessUsers_GetNothing(string role)
    {
        var (campaign, candidate) = await SetUpAsync();

        var responses = await Task.WhenAll(EveryEndpoint(_fixture.CreateClient("Someone", role), campaign, candidate));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
        Assert.Single((await Manager().GetAsync($"/api/campaigns/{campaign}/candidates").Result.ReadAsync<CandidateListDto>()).Items);
    }

    [Fact]
    public async Task AnOfficer_CanReadAddAndChange_ButNotDelete()
    {
        var (campaign, candidate) = await SetUpAsync();
        var officer = _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer);

        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync($"/api/campaigns/{campaign}/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync($"/api/campaigns/{campaign}/candidates/session-choices")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync("/api/candidate-schools")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await officer.PostCandidateAsync(campaign, CandidateForm())).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await officer.PutCandidateAsync(campaign, candidate.Id, CandidateForm(nameEn: "Sok Dara", phone: candidate.Phone, version: candidate.Version))).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await officer.DeleteAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}")).StatusCode);
    }

    [Theory]
    [InlineData(Roles.SelectionManager)]
    [InlineData(Roles.SystemAdmin)]
    public async Task ManagementCanDelete(string role)
    {
        var (campaign, candidate) = await SetUpAsync();

        var deleted = await _fixture.CreateClient("Boss", role).DeleteAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}");

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
    }

    [Fact]
    public async Task TheAuditLineNamesWhoDidIt_FromTheirLoginNotFromTheForm()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var officer = _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer);

        var candidate = await (await officer.PostCandidateAsync(campaign, CandidateForm())).ReadAsync<CandidateDto>();

        Assert.Equal("Sokha Officer", candidate.CreatedByName);
        Assert.Equal("Sokha Officer", await _fixture.ScalarAsync<string>(
            "select changed_by_name from candidates.audit_log where candidate_id = @c", ("c", candidate.Id)));
    }

    [Fact]
    public async Task EveryResponseCarriesNoStore_BecauseItHoldsPersonalData()
    {
        var (campaign, candidate) = await SetUpAsync();

        var list = await Manager().GetAsync($"/api/campaigns/{campaign}/candidates");
        var one = await Manager().GetAsync($"/api/campaigns/{campaign}/candidates/{candidate.Id}");

        Assert.Contains("no-store", list.Headers.CacheControl!.ToString());
        Assert.Contains("no-store", one.Headers.CacheControl!.ToString());
    }
}
