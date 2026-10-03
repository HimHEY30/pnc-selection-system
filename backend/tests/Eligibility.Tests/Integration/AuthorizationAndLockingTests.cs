using System.Net;
using System.Net.Http.Json;
using Eligibility.Application;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>
/// Who may do what, and what happens once a campaign is no longer a draft. Reading and testing
/// are for admin, manager and officer; saving and suggesting for admin and manager; committee
/// members and people with no role get nothing.
/// </summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class AuthorizationAndLockingTests
{
    private readonly EligibilityApiFixture _fixture;

    public AuthorizationAndLockingTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<Guid> NewCampaignAsync() => (await _fixture.CreateManagerClient().CreateCampaignAsync()).Id;

    private static Task<HttpResponseMessage>[] AllEndpoints(HttpClient client, Guid id) =>
    [
        client.GetAsync("/api/eligibility/catalogue"),
        client.GetRulesAsync(id),
        client.SaveDraftAsync(id, Completable()),
        client.CompleteAsync(id, Completable()),
        client.TestAsync(id, new TestRequest(Completable(), new())),
        client.GetAsync($"/api/campaigns/{id}/eligibility/suggested"),
        client.GetSubjectsAsync(id),
        client.AddSubjectAsync(id, "Physics"),
        client.RenameSubjectAsync(id, "exam_0", "Physics"),
        client.RemoveSubjectAsync(id, "exam_0"),
    ];

    // ---------- Not signed in, wrong role ----------

    [Fact]
    public async Task WithoutSigningIn_EveryEndpointReturns401()
    {
        var id = await NewCampaignAsync();

        var responses = await Task.WhenAll(AllEndpoints(_fixture.CreateClient(), id));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
    }

    [Theory]
    [InlineData(Roles.CommitteeUser)]
    [InlineData("some-other-role")]
    public async Task CommitteeMembersAndRoleLessUsers_GetNothing(string role)
    {
        var id = await NewCampaignAsync();

        var responses = await Task.WhenAll(AllEndpoints(_fixture.CreateClient(null, role), id));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
    }

    // ---------- Officer: view only ----------

    [Fact]
    public async Task AnOfficer_CanReadAndTest_ButNotSaveOrSuggest()
    {
        var id = await NewCampaignAsync();
        var officer = _fixture.CreateClient("Vanna Sok", Roles.SelectionOfficer);

        Assert.Equal(HttpStatusCode.OK, (await officer.GetAsync("/api/eligibility/catalogue")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.GetRulesAsync(id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await officer.TestAsync(id, new TestRequest(Completable(), new() { ["gender"] = "female" }))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.SaveDraftAsync(id, Completable())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.CompleteAsync(id, Completable())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.GetAsync($"/api/campaigns/{id}/eligibility/suggested")).StatusCode);
    }

    [Fact]
    public async Task AnOfficer_CanSeeTheExamSubjects_ButNotChangeThem()
    {
        var id = await NewCampaignAsync();
        var officer = _fixture.CreateClient("Vanna Sok", Roles.SelectionOfficer);
        var key = (await officer.LoadSubjectsAsync(id)).Subjects[0].Key;

        Assert.Equal(HttpStatusCode.Forbidden, (await officer.AddSubjectAsync(id, "Physics")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.RenameSubjectAsync(id, key, "Physics")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await officer.RemoveSubjectAsync(id, key)).StatusCode);
        Assert.Equal(["Math", "Logic", "English"], (await officer.LoadSubjectsAsync(id)).Subjects.Select(s => s.Name));
    }

    [Fact]
    public async Task AnOfficersRefusedSave_ChangesNothing()
    {
        var id = await NewCampaignAsync();

        await _fixture.CreateClient(null, Roles.SelectionOfficer).SaveDraftAsync(id, Completable());

        var manager = _fixture.CreateManagerClient();
        Assert.Empty((await manager.LoadRulesAsync(id)).Groups);
        Assert.Equal("NotStarted", (await manager.GetCampaignAsync(id)).StepStatus());
    }

    [Fact]
    public async Task AnOfficer_SeesTheRulesAManagerSaved()
    {
        var id = await NewCampaignAsync();
        await _fixture.CreateManagerClient().SaveDraftAsync(id, Completable());

        var seen = await _fixture.CreateClient(null, Roles.SelectionOfficer).LoadRulesAsync(id);

        Assert.Single(seen.Groups[0].Rules);
    }

    // ---------- Admin and manager ----------

    [Theory]
    [InlineData(Roles.SystemAdmin)]
    [InlineData(Roles.SelectionManager)]
    public async Task AdminAndManager_CanDoEverything(string role)
    {
        var id = await NewCampaignAsync();
        var client = _fixture.CreateClient("Someone", role);

        var responses = await Task.WhenAll(
        [
            client.GetAsync("/api/eligibility/catalogue"),
            client.GetRulesAsync(id),
            client.TestAsync(id, new TestRequest(Completable(), new())),
            client.GetAsync($"/api/campaigns/{id}/eligibility/suggested"),
            client.GetSubjectsAsync(id),
            client.AddSubjectAsync(id, "Physics"),
        ]);
        var draft = await client.SaveDraftAsync(id, Completable());
        var complete = await client.CompleteAsync(id, Completable(await draft.ReadRuleSetAsync() is { } d ? d.Version : null));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(HttpStatusCode.OK, draft.StatusCode);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
    }

    [Fact]
    public async Task AUserWithAnOperationsRoleAndAManagementRole_CanSave()
    {
        var id = await NewCampaignAsync();
        var client = _fixture.CreateClient(null, Roles.SelectionOfficer, Roles.SelectionManager);

        Assert.Equal(HttpStatusCode.OK, (await client.SaveDraftAsync(id, Completable())).StatusCode);
    }

    // ---------- A campaign that is no longer a draft ----------

    private async Task<Guid> LockedCampaignWithRulesAsync()
    {
        var manager = _fixture.CreateManagerClient();
        var id = (await manager.CreateCampaignAsync()).Id;
        await manager.CompleteAsync(id, Completable());
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 1 where id = @id", ("id", id)); // Active
        return id;
    }

    [Fact]
    public async Task OnceTheCampaignIsActive_TheRulesCannotBeChanged_ByAnyone()
    {
        var id = await LockedCampaignWithRulesAsync();

        foreach (var role in new[] { Roles.SelectionManager, Roles.SystemAdmin })
        {
            var client = _fixture.CreateClient("Someone", role);
            var draft = await client.SaveDraftAsync(id, Completable(null, Rule("gender", "is", ["male"])));
            var complete = await client.CompleteAsync(id, Completable(null, Rule("gender", "is", ["male"])));

            Assert.Equal(HttpStatusCode.Conflict, draft.StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, complete.StatusCode);
            Assert.Equal("campaign.not_editable", (await draft.ReadProblemAsync()).Code);
        }
    }

    [Fact]
    public async Task ARefusedSaveOnALockedCampaign_ChangesNothing()
    {
        var id = await LockedCampaignWithRulesAsync();
        var manager = _fixture.CreateManagerClient();
        var before = await manager.LoadRulesAsync(id);

        await manager.SaveDraftAsync(id, Completable(before.Version, Rule("gender", "is", ["male"])));

        var after = await manager.LoadRulesAsync(id);
        Assert.Equal(before.Groups[0].Rules[0].Values, after.Groups[0].Rules[0].Values);
        Assert.Equal(before.Version, after.Version);
        Assert.Equal("Complete", after.StepStatus);
    }

    [Fact]
    public async Task OnceTheCampaignIsActive_TheRulesAreStillVisible_AndSaidToBeLocked()
    {
        var id = await LockedCampaignWithRulesAsync();

        foreach (var role in new[] { Roles.SelectionOfficer, Roles.SelectionManager })
        {
            var rules = await _fixture.CreateClient(null, role).LoadRulesAsync(id);

            Assert.True(rules.IsLocked);
            Assert.Equal("Active", rules.CampaignStatus);
            Assert.Single(rules.Groups[0].Rules);
        }
    }

    [Fact]
    public async Task OnceTheCampaignIsActive_TestingAndSuggestionsStillWork()
    {
        var id = await LockedCampaignWithRulesAsync();
        var manager = _fixture.CreateManagerClient();

        var test = await manager.TestAsync(id, new TestRequest(Completable(), new() { ["gender"] = "female" }));
        var suggested = await manager.GetAsync($"/api/campaigns/{id}/eligibility/suggested");

        Assert.Equal(HttpStatusCode.OK, test.StatusCode);
        Assert.True((await test.Content.ReadFromJsonAsync<TestResultDto>())!.Eligible);
        Assert.Equal(HttpStatusCode.OK, suggested.StatusCode);
    }

    [Fact]
    public async Task OnceTheCampaignIsActive_TheExamSubjectsCannotBeChanged_ButCanBeSeen()
    {
        var manager = _fixture.CreateManagerClient();
        var id = (await manager.CreateCampaignAsync()).Id;
        var key = (await manager.LoadSubjectsAsync(id)).Subjects[0].Key;
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 1 where id = @id", ("id", id)); // Active

        var add = await manager.AddSubjectAsync(id, "Physics");
        var rename = await manager.RenameSubjectAsync(id, key, "Mathematics");
        var remove = await manager.RemoveSubjectAsync(id, key);

        Assert.All([add, rename, remove], r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal("campaign.not_editable", (await add.ReadProblemAsync()).Code);
        Assert.Equal(["Math", "Logic", "English"], (await manager.LoadSubjectsAsync(id)).Subjects.Select(s => s.Name));
    }

    [Fact]
    public async Task ACampaignThatIsClosed_IsLockedToo()
    {
        var id = await LockedCampaignWithRulesAsync();
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 2 where id = @id", ("id", id)); // Closed

        var response = await _fixture.CreateManagerClient().SaveDraftAsync(id, Completable());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }
}
