using System.Net;
using Campaigns.Application;
using Campaigns.Tests.Infrastructure;

namespace Campaigns.Tests.Api;

/// <summary>Step 1 (Campaign info): "Save draft", "Save and continue" and the step statuses they drive.</summary>
[Collection(CampaignsApiCollection.Name)]
public sealed class CampaignInfoStepTests
{
    private readonly CampaignsApiFixture _fixture;
    private readonly HttpClient _client;

    public CampaignInfoStepTests(CampaignsApiFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.CreateManagerClient();
    }

    private static string StatusOf(CampaignDetailDto campaign, string step) =>
        campaign.Steps.Single(s => s.Step == step).Status;

    // ---------- Save draft ----------

    [Fact]
    public async Task SaveDraft_WithPartialData_StoresItAndKeepsStep1InProgress()
    {
        var campaign = await _client.CreateCampaignAsync();
        var partial = TestData.MinimalInfo(campaign.Name) with { StartDate = new DateOnly(2026, 11, 2), ExpectedCandidates = 1500 };

        var response = await _client.SaveDraftAsync(campaign.Id, partial);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await _client.GetCampaignAsync(campaign.Id);
        Assert.Equal(new DateOnly(2026, 11, 2), saved.StartDate);
        Assert.Null(saved.EndDate);
        Assert.Equal(1500, saved.ExpectedCandidates);
        Assert.Null(saved.SeatsAvailable);
        Assert.Empty(saved.ProvinceIds);
        Assert.Equal("InProgress", StatusOf(saved, "CampaignInfo"));
        Assert.Equal(new ProgressDto(5, 0, 1), saved.Progress);
    }

    [Fact]
    public async Task SaveDraft_UpdatesTheLastSavedTime()
    {
        var campaign = await _client.CreateCampaignAsync();
        await Task.Delay(50);

        var saved = await (await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name))).ReadCampaignAsync();

        Assert.True(saved.InfoSavedAt > campaign.InfoSavedAt);
    }

    [Fact]
    public async Task SaveDraft_WithEndDateBeforeStartDate_ReturnsTheEndDateError()
    {
        var campaign = await _client.CreateCampaignAsync();
        var body = TestData.MinimalInfo(campaign.Name) with
        {
            StartDate = new DateOnly(2026, 11, 2),
            EndDate = new DateOnly(2026, 10, 30),
        };

        var response = await _client.SaveDraftAsync(campaign.Id, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal(["End date must be after the start date (2 Nov 2026)."], problem.Errors!["endDate"]);
    }

    [Fact]
    public async Task SaveDraft_WhenValidationFails_ChangesNothing()
    {
        var campaign = await _client.CreateCampaignAsync();
        var body = TestData.MinimalInfo(campaign.Name) with { Description = "changed", ExpectedCandidates = 0 };

        await _client.SaveDraftAsync(campaign.Id, body);

        var unchanged = await _client.GetCampaignAsync(campaign.Id);
        Assert.NotEqual("changed", unchanged.Description);
        Assert.Null(unchanged.ExpectedCandidates);
    }

    [Fact]
    public async Task SaveDraft_WithAnUnknownProvince_ReturnsAProvinceError()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name) with { ProvinceIds = [999] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("provinceIds", (await response.ReadProblemAsync()).Errors!.Keys);
    }

    [Fact]
    public async Task SaveDraft_CanRenameTheCampaign_AndKeepingTheSameNameIsNotADuplicate()
    {
        var campaign = await _client.CreateCampaignAsync();

        var sameName = await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name));
        var newName = TestData.UniqueName("Renamed");
        var renamed = await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(newName));

        Assert.Equal(HttpStatusCode.OK, sameName.StatusCode);
        Assert.Equal(newName, (await renamed.ReadCampaignAsync()).Name);
    }

    [Fact]
    public async Task SaveDraft_WithTheNameOfAnotherCampaign_ReturnsANameError()
    {
        var other = await _client.CreateCampaignAsync();
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(other.Name.ToUpperInvariant()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["A campaign with this name already exists."], (await response.ReadProblemAsync()).Errors!["name"]);
    }

    [Fact]
    public async Task SaveDraft_ForAnUnknownCampaign_Returns404()
    {
        var response = await _client.SaveDraftAsync(Guid.NewGuid(), TestData.MinimalInfo("x"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SaveDraft_WithAStaleVersion_ReturnsAConflict()
    {
        var campaign = await _client.CreateCampaignAsync();
        var first = await (await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name) with { Version = campaign.Version })).ReadCampaignAsync();

        // A second person still holds the version from before the first save.
        var stale = await _fixture.CreateManagerClient()
            .SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name) with { Version = campaign.Version });

        Assert.NotEqual(campaign.Version, first.Version);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("campaign.concurrent_edit", (await stale.ReadProblemAsync()).Code);
    }

    [Fact]
    public async Task SaveDraft_WithTheCurrentVersion_Succeeds()
    {
        var campaign = await _client.CreateCampaignAsync();
        var first = await (await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name) with { Version = campaign.Version })).ReadCampaignAsync();

        var second = await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name) with { Version = first.Version });

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    // ---------- Save and continue ----------

    [Fact]
    public async Task Complete_WithValidData_MarksStep1Complete()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await _client.GetCampaignAsync(campaign.Id);
        Assert.Equal("Complete", StatusOf(saved, "CampaignInfo"));
        Assert.Equal(new DateOnly(2026, 11, 2), saved.StartDate);
        Assert.Equal(new DateOnly(2027, 3, 31), saved.EndDate);
        Assert.Equal(1500, saved.ExpectedCandidates);
        Assert.Equal(150, saved.SeatsAvailable);
        Assert.Equal(TestData.FourProvinces, saved.ProvinceIds);
        Assert.Equal(new ProgressDto(5, 1, 0), saved.Progress);
    }

    [Fact]
    public async Task Complete_LeavesTheOtherFourStepsNotStarted_SoTheCampaignCannotBeActivated()
    {
        var campaign = await _client.CreateCampaignAsync();

        var saved = await (await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name))).ReadCampaignAsync();

        Assert.Equal(4, saved.Steps.Count(s => s.Status == "NotStarted"));
        Assert.False(saved.CanActivate);
    }

    [Fact]
    public async Task Complete_WithMissingFields_ReturnsAnErrorForEachOne_AndStaysInProgress()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.CompleteInfoAsync(campaign.Id, TestData.MinimalInfo(campaign.Name));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadProblemAsync()).Errors!;
        Assert.Equal(
            ["endDate", "expectedCandidates", "provinceIds", "seatsAvailable", "startDate"],
            errors.Keys.Order());
        Assert.Equal("InProgress", StatusOf(await _client.GetCampaignAsync(campaign.Id), "CampaignInfo"));
    }

    [Fact]
    public async Task Complete_WithNoProvinces_ReturnsAProvinceError()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ProvinceIds = [] });

        Assert.Equal(["Choose at least one target province."], (await response.ReadProblemAsync()).Errors!["provinceIds"]);
    }

    [Fact]
    public async Task Complete_WithMoreSeatsThanExpectedCandidates_ReturnsASeatsError()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.CompleteInfoAsync(
            campaign.Id, TestData.ValidInfo(campaign.Name) with { ExpectedCandidates = 100, SeatsAvailable = 101 });

        Assert.Equal(["Seats available cannot be more than expected candidates (100)."], (await response.ReadProblemAsync()).Errors!["seatsAvailable"]);
    }

    [Fact]
    public async Task Complete_WithEndDateBeforeStartDate_IsRejected()
    {
        var campaign = await _client.CreateCampaignAsync();

        var response = await _client.CompleteInfoAsync(
            campaign.Id, TestData.ValidInfo(campaign.Name) with { EndDate = new DateOnly(2026, 10, 30) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("endDate", (await response.ReadProblemAsync()).Errors!.Keys);
    }

    [Fact]
    public async Task Complete_ReplacesTheSelectedProvinces()
    {
        var campaign = await _client.CreateCampaignAsync();
        await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ProvinceIds = [2, 17, 3, 21] });

        await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ProvinceIds = [12, 17] });

        Assert.Equal(new short[] { 12, 17 }, (await _client.GetCampaignAsync(campaign.Id)).ProvinceIds);
    }

    [Fact]
    public async Task SaveDraft_AfterComplete_MovesStep1BackToInProgress_AndCompleteRestoresIt()
    {
        var campaign = await _client.CreateCampaignAsync();
        await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name));

        await _client.SaveDraftAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ExpectedCandidates = 1600 });
        var afterDraft = await _client.GetCampaignAsync(campaign.Id);
        await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ExpectedCandidates = 1600 });
        var afterComplete = await _client.GetCampaignAsync(campaign.Id);

        Assert.Equal("InProgress", StatusOf(afterDraft, "CampaignInfo"));
        Assert.Equal(1600, afterDraft.ExpectedCandidates);
        Assert.Equal("Complete", StatusOf(afterComplete, "CampaignInfo"));
    }

    [Fact]
    public async Task Complete_ForAnUnknownCampaign_Returns404()
    {
        var response = await _client.CompleteInfoAsync(Guid.NewGuid(), TestData.ValidInfo("x"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Complete_WithAStaleVersion_ReturnsAConflict()
    {
        var campaign = await _client.CreateCampaignAsync();
        await _client.SaveDraftAsync(campaign.Id, TestData.MinimalInfo(campaign.Name));

        var response = await _client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { Version = campaign.Version });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }
}
