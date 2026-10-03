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

    [Fact]
    public async Task Create_WithCopyMode_IsRejectedBecauseNoCampaignHasBeenCompleted()
    {
        var request = TestData.ValidCreate() with { StartMode = StartModes.Copy };

        var response = await _fixture.CreateManagerClient().PostAsJsonAsync("/api/campaigns", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("startMode", (await response.ReadProblemAsync()).Errors!.Keys);
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
