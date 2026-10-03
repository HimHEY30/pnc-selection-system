using System.Net;
using System.Net.Http.Json;
using Campaigns.Application;
using Campaigns.Tests.Infrastructure;

namespace Campaigns.Tests.Api;

[Collection(CampaignsApiCollection.Name)]
public sealed class CreateCampaignTests
{
    private readonly CampaignsApiFixture _fixture;

    public CreateCampaignTests(CampaignsApiFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Create_WithValidData_ReturnsADraftCampaign()
    {
        var client = _fixture.CreateManagerClient("Sreyneang Chea");
        var request = TestData.ValidCreate();

        var response = await client.PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var campaign = await response.ReadCampaignAsync();
        Assert.Equal("Draft", campaign.Status);
        Assert.Equal(request.Name, campaign.Name);
        Assert.Equal("2027–2028", campaign.AcademicYear);
        Assert.Equal(request.Description, campaign.Description);
        Assert.Equal("Sreyneang Chea", campaign.CreatedByName);
        Assert.False(campaign.CanActivate);
        Assert.Equal($"/api/campaigns/{campaign.Id}", response.Headers.Location!.AbsolutePath);
    }

    [Fact]
    public async Task Create_SetsStep1InProgressAndTheOtherStepsNotStarted()
    {
        var campaign = await _fixture.CreateManagerClient().CreateCampaignAsync();

        Assert.Equal(
            ["CampaignInfo:InProgress", "EligibilityRules:NotStarted", "InformationSessions:NotStarted", "Candidates:NotStarted", "EntranceExam:NotStarted"],
            campaign.Steps.OrderBy(s => s.Order).Select(s => $"{s.Step}:{s.Status}"));
        Assert.Equal(new ProgressDto(Total: 5, Complete: 0, InProgress: 1), campaign.Progress);
    }

    [Fact]
    public async Task Create_ThenGet_ReturnsTheStoredCampaign()
    {
        var client = _fixture.CreateManagerClient();
        var created = await client.CreateCampaignAsync();

        var fetched = await client.GetCampaignAsync(created.Id);

        Assert.Equal(created.Name, fetched.Name);
        Assert.Equal("Draft", fetched.Status);
        Assert.Empty(fetched.ProvinceIds);
    }

    [Fact]
    public async Task Create_TrimsNameAndTreatsBlankDescriptionAsEmpty()
    {
        var name = TestData.UniqueName();
        var request = TestData.ValidCreate($"  {name}  ") with { Description = "   " };

        var response = await _fixture.CreateManagerClient().PostAsJsonAsync("/api/campaigns", request);

        var campaign = await response.ReadCampaignAsync();
        Assert.Equal(name, campaign.Name);
        Assert.Null(campaign.Description);
    }

    [Fact]
    public async Task Create_WithoutNameOrAcademicYear_ReturnsFieldErrors()
    {
        var request = new CreateCampaignRequest(null, null, null, StartModes.Scratch);

        var response = await _fixture.CreateManagerClient().PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal("campaign.invalid", problem.Code);
        Assert.Equal(["Enter a campaign name."], problem.Errors!["name"]);
        Assert.Equal(["Choose an academic year."], problem.Errors["academicYear"]);
        Assert.False(problem.Errors.ContainsKey("description"));
    }

    [Fact]
    public async Task Create_WithADuplicateName_ReturnsANameError()
    {
        var client = _fixture.CreateManagerClient();
        var existing = await client.CreateCampaignAsync();

        var response = await client.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate(existing.Name));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal(["A campaign with this name already exists."], problem.Errors!["name"]);
    }

    [Fact]
    public async Task Create_DuplicateNameCheckIgnoresCaseAndSurroundingSpaces()
    {
        var client = _fixture.CreateManagerClient();
        var existing = await client.CreateCampaignAsync();

        var response = await client.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate($"  {existing.Name.ToUpperInvariant()} "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("name", (await response.ReadProblemAsync()).Errors!.Keys);
    }

    [Fact]
    public async Task Create_WhenSeveralRequestsUseTheSameNameAtOnce_OnlyOneSucceeds()
    {
        var name = TestData.UniqueName("Race");
        var clients = Enumerable.Range(0, 4).Select(_ => _fixture.CreateManagerClient()).ToArray();

        var responses = await Task.WhenAll(
            clients.Select(c => c.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate(name))));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        var rejected = responses.Where(r => r.StatusCode != HttpStatusCode.Created).ToArray();
        Assert.All(rejected, r => Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode));
        foreach (var response in rejected)
        {
            Assert.Equal(["A campaign with this name already exists."], (await response.ReadProblemAsync()).Errors!["name"]);
        }
    }

    // ---------- Copy from another campaign ----------

    /// <summary>A campaign with a description, numbers, dates and four provinces, ready to be copied.</summary>
    private async Task<CampaignDetailDto> CreateSourceAsync(HttpClient client)
    {
        var source = await client.CreateCampaignAsync();
        var saved = await client.CompleteInfoAsync(source.Id, TestData.ValidInfo(source.Name));
        saved.EnsureSuccessStatusCode();
        return await client.GetCampaignAsync(source.Id);
    }

    private static CreateCampaignRequest CopyRequest(Guid source, params string[] parts) =>
        TestData.ValidCreate() with { StartMode = StartModes.Copy, CopyFrom = new CopyFromRequest(source, parts) };

    [Fact]
    public async Task Create_WithCopyMode_AndNoSource_IsRejectedWithFieldErrors()
    {
        var request = TestData.ValidCreate() with { StartMode = StartModes.Copy };

        var response = await _fixture.CreateManagerClient().PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.ReadProblemAsync()).Errors!;
        Assert.Contains("copyFrom.sourceCampaignId", errors.Keys);
        Assert.Contains("copyFrom.parts", errors.Keys);
    }

    [Fact]
    public async Task Create_WithCopyMode_AndAnUnknownSource_IsRejectedAndCreatesNothing()
    {
        var client = _fixture.CreateManagerClient();
        var request = CopyRequest(Guid.NewGuid(), CopyParts.Provinces);

        var response = await client.PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("copyFrom.sourceCampaignId", (await response.ReadProblemAsync()).Errors!.Keys);
        Assert.DoesNotContain((await client.GetFromJsonAsync<List<CampaignSummaryDto>>("/api/campaigns"))!, c => c.Name == request.Name);
    }

    [Fact]
    public async Task Create_ByCopying_TakesTheProvincesAndDetailsChosen_NotTheDatesOrTheName()
    {
        var client = _fixture.CreateManagerClient();
        var source = await CreateSourceAsync(client);
        var request = CopyRequest(source.Id, CopyParts.Provinces, CopyParts.Details) with { Description = null };

        var response = await client.PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = await response.ReadCampaignAsync();
        Assert.NotEqual(source.Id, copy.Id);
        Assert.Equal(request.Name, copy.Name);
        Assert.Equal(TestData.FourProvinces.Order(), copy.ProvinceIds);
        Assert.Equal(1500, copy.ExpectedCandidates);
        Assert.Equal(150, copy.SeatsAvailable);
        Assert.Equal(source.Description, copy.Description);
        Assert.Null(copy.StartDate);
        Assert.Null(copy.EndDate);
        Assert.Equal(
            [$"{CopyParts.Provinces}:Copied:4", $"{CopyParts.Details}:Copied:1"],
            copy.CopyResults!.Select(r => $"{r.Part}:{r.Outcome}:{r.Count}"));
    }

    [Fact]
    public async Task Create_ByCopying_OnlyWhatWasTicked()
    {
        var client = _fixture.CreateManagerClient();
        var source = await CreateSourceAsync(client);

        var copy = await (await client.PostAsJsonAsync("/api/campaigns", CopyRequest(source.Id, CopyParts.Provinces))).ReadCampaignAsync();

        Assert.Equal(TestData.FourProvinces.Order(), copy.ProvinceIds);
        Assert.Null(copy.ExpectedCandidates);
        Assert.Null(copy.SeatsAvailable);
    }

    [Fact]
    public async Task Create_ByCopying_LeavesStep1InProgress_AndTheSourceUnchanged()
    {
        var client = _fixture.CreateManagerClient();
        var source = await CreateSourceAsync(client);

        var copy = await (await client.PostAsJsonAsync("/api/campaigns", CopyRequest(source.Id, CopyParts.Provinces, CopyParts.Details))).ReadCampaignAsync();

        Assert.Equal("InProgress", copy.Steps.Single(s => s.Step == "CampaignInfo").Status);
        var after = await client.GetCampaignAsync(source.Id);
        Assert.Equal(source.Version, after.Version);
        Assert.Equal(source.ProvinceIds, after.ProvinceIds);
        Assert.Equal(source.UpdatedAt, after.UpdatedAt);
    }

    [Fact]
    public async Task Create_ByCopying_APartThatIsNotOnTheList_IsRefusedBeforeAnythingIsCreated()
    {
        var client = _fixture.CreateManagerClient();
        var source = await CreateSourceAsync(client);
        var request = CopyRequest(source.Id, CopyParts.Provinces, "Candidates");

        var response = await client.PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain((await client.GetFromJsonAsync<List<CampaignSummaryDto>>("/api/campaigns"))!, c => c.Name == request.Name);
    }

    [Fact]
    public async Task CopyPreview_ListsEveryPartWithItsCount()
    {
        var client = _fixture.CreateManagerClient();
        var source = await CreateSourceAsync(client);

        var preview = await client.GetFromJsonAsync<CopyPreviewDto>($"/api/campaigns/{source.Id}/copy-preview");

        Assert.Equal(source.Name, preview!.Name);
        Assert.Equal(CopyParts.All, preview.Parts.Select(p => p.Key));
        var provinces = preview.Parts.Single(p => p.Key == CopyParts.Provinces);
        Assert.True(provinces.Available);
        Assert.Equal(4, provinces.Count);
        var details = preview.Parts.Single(p => p.Key == CopyParts.Details);
        Assert.True(details.Available);
        Assert.Equal(3, details.Count);
    }

    [Fact]
    public async Task CopyPreview_SaysWhenACampaignHasNothingToCopyForAPart()
    {
        var client = _fixture.CreateManagerClient();
        var empty = await client.CreateCampaignAsync();
        await client.SaveDraftAsync(empty.Id, TestData.MinimalInfo(empty.Name));

        var preview = await client.GetFromJsonAsync<CopyPreviewDto>($"/api/campaigns/{empty.Id}/copy-preview");

        var provinces = preview!.Parts.Single(p => p.Key == CopyParts.Provinces);
        Assert.False(provinces.Available);
        Assert.Equal(0, provinces.Count);
        Assert.NotNull(provinces.Note);
    }

    [Fact]
    public async Task CopyPreview_OfAnUnknownCampaign_Returns404()
    {
        var response = await _fixture.CreateManagerClient().GetAsync($"/api/campaigns/{Guid.NewGuid()}/copy-preview");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CopyPreview_AnOfficerCannotSeeIt()
    {
        var source = await CreateSourceAsync(_fixture.CreateManagerClient());
        var officer = _fixture.CreateClient("Officer", Roles.SelectionOfficer);

        var response = await officer.GetAsync($"/api/campaigns/{source.Id}/copy-preview");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_ByCopying_AnOfficerCannot()
    {
        var source = await CreateSourceAsync(_fixture.CreateManagerClient());
        var officer = _fixture.CreateClient("Officer", Roles.SelectionOfficer);

        var response = await officer.PostAsJsonAsync("/api/campaigns", CopyRequest(source.Id, CopyParts.Provinces));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_WithAnUnknownId_Returns404()
    {
        var response = await _fixture.CreateManagerClient().GetAsync($"/api/campaigns/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("campaign.not_found", (await response.ReadProblemAsync()).Code);
    }

    [Fact]
    public async Task List_ReturnsNewestFirst()
    {
        var client = _fixture.CreateManagerClient();
        var older = await client.CreateCampaignAsync();
        var newer = await client.CreateCampaignAsync();

        var list = (await client.GetFromJsonAsync<List<CampaignSummaryDto>>("/api/campaigns"))!;

        var ids = list.Select(c => c.Id).ToList();
        Assert.True(ids.IndexOf(newer.Id) < ids.IndexOf(older.Id));
        Assert.Equal("Draft", list.Single(c => c.Id == newer.Id).Status);
    }

    [Fact]
    public async Task Provinces_ReturnsAll25SortedByName()
    {
        var provinces = (await _fixture.CreateManagerClient().GetFromJsonAsync<List<ProvinceDto>>("/api/provinces"))!;

        Assert.Equal(25, provinces.Count);
        Assert.Equal(provinces.Select(p => p.Name).Order(StringComparer.Ordinal), provinces.Select(p => p.Name));
        Assert.Contains(provinces, p => p.Name == "Siem Reap" && p.Id == 17);
        Assert.Contains(provinces, p => p.Name == "Phnom Penh");
        Assert.Equal(25, provinces.Select(p => p.Code).Distinct().Count());
    }
}
