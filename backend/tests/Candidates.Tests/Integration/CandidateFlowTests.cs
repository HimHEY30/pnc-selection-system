using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Candidates.Application;
using Sessions.Application;
using static Candidates.Tests.Integration.ApiHelpers;

namespace Candidates.Tests.Integration;

/// <summary>A person's journey through the API: add, look up, change, delete, and what is refused along the way.</summary>
[Collection(CandidatesApiCollection.Name)]
public sealed class CandidateFlowTests
{
    private readonly CandidatesApiFixture _fixture;

    public CandidateFlowTests(CandidatesApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager);

    private async Task<Guid> InsertSessionAsync(Guid campaignId, short status = 1)
    {
        var id = Guid.NewGuid();
        await _fixture.ExecuteAsync(
            """
            insert into sessions.information_sessions
                (id, campaign_id, title, session_date, start_time, end_time, format, venue, assignee_id, assignee_name,
                 host_type, host_user_id, host_user_name, status, cancel_reason, created_by_id, created_by_name, created_at, updated_at)
            values
                (@id, @c, 'Battambang open day', date '2027-03-20', time '09:00', time '11:00', 1, 'Hall', 'o1', 'Sokha',
                 1, 'o1', 'Sokha', @st, case when @st = 3 then 'Rain' else null end, 'u', 'U', now(), now())
            """,
            ("id", id), ("c", campaignId), ("st", status));
        return id;
    }

    // ---------- The journey ----------

    [Fact]
    public async Task AddALookItUpChangeItAndDeleteIt()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var manager = Manager();
        var school = await manager.AddSchoolAsync("Bak Touk High School " + Guid.NewGuid().ToString("N")[..6]);
        var session = await InsertSessionAsync(campaign);

        var posted = await manager.PostCandidateAsync(
            campaign, CandidateForm(schoolHostId: school.Id, schoolName: null, sessionId: session, ngo: true, ngoName: "Hope NGO"));

        Assert.Equal(HttpStatusCode.Created, posted.StatusCode);
        var created = await posted.ReadAsync<CandidateDto>();
        Assert.Equal($"/api/campaigns/{campaign}/candidates/{created.Id}", posted.Headers.Location!.OriginalString);
        Assert.Equal(school.Name, created.SchoolName);
        Assert.Equal(school.Id, created.SchoolHostId);
        Assert.Equal("Battambang open day", created.Session!.Title);
        Assert.True(created.HasNgoSupport);
        Assert.Equal("Hope NGO", created.NgoName);
        Assert.NotEqual(0u, created.Version);

        var read = await (await manager.GetAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).ReadAsync<CandidateDto>();
        Assert.Equal(created.Id, read.Id);
        Assert.Equal(created.Version, read.Version);
        Assert.Equal("Tonle Bassac", read.Address.Commune!.Name);
        Assert.Null(read.Address.Village);

        var listed = await (await manager.GetAsync($"/api/campaigns/{campaign}/candidates")).ReadAsync<CandidateListDto>();
        Assert.Equal(created.Id, Assert.Single(listed.Items).Id);
        Assert.True(listed.CanChange);
        Assert.Equal(["Phnom Penh"], listed.Provinces);

        var changed = await (await manager.PutCandidateAsync(
            campaign, created.Id, CandidateForm(nameEn: "Sok Dara", phone: created.Phone, schoolHostId: school.Id, schoolName: null, sessionId: null, version: created.Version)))
            .ReadAsync<CandidateDto>();
        Assert.Equal("Sok Dara", changed.NameEn);
        Assert.Null(changed.Session);
        Assert.False(changed.HasNgoSupport);
        Assert.NotEqual(created.Version, changed.Version);

        Assert.Equal(HttpStatusCode.NoContent, (await manager.DeleteAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await manager.GetAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).StatusCode);

        var actions = await _fixture.ScalarAsync<string>(
            "select string_agg(action::text, ',' order by changed_at, action) from candidates.audit_log where candidate_id = @c", ("c", created.Id));
        Assert.Equal("1,2,3", actions);
    }

    // ---------- Refused ----------

    [Fact]
    public async Task AFormWithProblems_Gets400WithAMessageUnderEachField()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        var response = await Manager().PostCandidateAsync(campaign, CandidateForm(nameEn: "Sok 123", phone: "bad") with { Gender = null });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var errors = body.GetProperty("errors");
        Assert.True(errors.TryGetProperty("nameEn", out _));
        Assert.True(errors.TryGetProperty("phone", out _));
        Assert.True(errors.TryGetProperty("gender", out _));
        Assert.Equal("candidates.invalid", body.GetProperty("code").GetString());
        Assert.Empty((await (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates")).ReadAsync<CandidateListDto>()).Items);
    }

    [Fact]
    public async Task ATakenPhone_Gets409NamingTheExistingCandidate_AndAnotherCampaignMayUseIt()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var phone = NextPhone();
        await (await Manager().PostCandidateAsync(campaign, CandidateForm(nameEn: "Vann Dara", phone: phone))).ReadAsync<CandidateDto>();

        var clash = await Manager().PostCandidateAsync(campaign, CandidateForm(phone: phone));
        var fine = await Manager().PostCandidateAsync(other, CandidateForm(phone: phone));

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        var body = await clash.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("candidates.duplicate_phone", body.GetProperty("code").GetString());
        Assert.Contains("Vann Dara", body.GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.Created, fine.StatusCode);
    }

    [Fact]
    public async Task AStaleVersion_Gets409_AndTheNewerChangeSurvives()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var created = await (await Manager().PostCandidateAsync(campaign, CandidateForm())).ReadAsync<CandidateDto>();
        var first = _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer);
        var second = _fixture.CreateClient("Vanna Officer", Roles.SelectionOfficer);

        var saved = await first.PutCandidateAsync(campaign, created.Id, CandidateForm(nameEn: "Changed First", phone: created.Phone, version: created.Version));
        var lost = await second.PutCandidateAsync(campaign, created.Id, CandidateForm(nameEn: "Changed Second", phone: created.Phone, version: created.Version));

        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, lost.StatusCode);
        Assert.Equal("candidates.concurrent_edit", (await lost.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        var now = await (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).ReadAsync<CandidateDto>();
        Assert.Equal("Changed First", now.NameEn);
    }

    [Fact]
    public async Task ACandidateIsNotFoundThroughAnotherCampaign()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var created = await (await Manager().PostCandidateAsync(campaign, CandidateForm())).ReadAsync<CandidateDto>();

        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{other}/candidates/{created.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Manager().PutCandidateAsync(other, created.Id, CandidateForm(phone: created.Phone, version: created.Version))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().DeleteAsync($"/api/campaigns/{other}/candidates/{created.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task AnUnknownCampaign_Gets404()
    {
        var unknown = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{unknown}/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().PostCandidateAsync(unknown, CandidateForm())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Manager().GetAsync($"/api/campaigns/{unknown}/candidates/session-choices")).StatusCode);
    }

    [Fact]
    public async Task ASessionOfAnotherCampaignOrACancelledOne_IsRefusedWithAMessageUnderSessionId()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var elsewhere = await InsertSessionAsync(other);
        var cancelled = await InsertSessionAsync(campaign, status: 3);

        foreach (var session in new[] { elsewhere, cancelled })
        {
            var response = await Manager().PostCandidateAsync(campaign, CandidateForm(sessionId: session));

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").TryGetProperty("sessionId", out _));
        }
    }

    [Fact]
    public async Task ASchoolThatIsNotAnActiveHighSchool_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var ngo = await Manager().AddSchoolAsync("Hope NGO " + Guid.NewGuid().ToString("N")[..6], kind: "Ngo");

        var response = await Manager().PostCandidateAsync(campaign, CandidateForm(schoolHostId: ngo.Id));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors").TryGetProperty("schoolHostId", out _));
    }

    [Fact]
    public async Task OnceTheCampaignIsClosed_CandidatesCanBeReadButNotAddedChangedOrDeleted()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var created = await (await Manager().PostCandidateAsync(campaign, CandidateForm())).ReadAsync<CandidateDto>();
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 2 where id = @id", ("id", campaign)); // Closed

        Assert.Equal(HttpStatusCode.Conflict, (await Manager().PostCandidateAsync(campaign, CandidateForm())).StatusCode);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await Manager().PutCandidateAsync(campaign, created.Id, CandidateForm(nameEn: "Sok Dara", phone: created.Phone, version: created.Version))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Manager().DeleteAsync($"/api/campaigns/{campaign}/candidates/{created.Id}")).StatusCode);

        var list = await (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates")).ReadAsync<CandidateListDto>();
        Assert.Equal("Closed", list.CampaignStatus);
        Assert.False(list.CanChange);
        Assert.Single(list.Items);
    }

    // ---------- Lists for the form ----------

    [Fact]
    public async Task TheFormsLists_OfferOnlyChoosableSessionsAndActiveHighSchools()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var planned = await InsertSessionAsync(campaign);
        await InsertSessionAsync(campaign, status: 3);
        var name = "Choosable High School " + Guid.NewGuid().ToString("N")[..6];
        var school = await Manager().AddSchoolAsync(name);
        var off = await Manager().AddSchoolAsync("Closed High School " + Guid.NewGuid().ToString("N")[..6]);
        await Manager().PutAsJsonAsync($"/api/session-hosts/{off.Id}/active", new { isActive = false });
        var ngo = await Manager().AddSchoolAsync("Some NGO " + Guid.NewGuid().ToString("N")[..6], kind: "Ngo");

        var sessions = await (await Manager().GetAsync($"/api/campaigns/{campaign}/candidates/session-choices")).ReadAsync<List<SessionChoice>>();
        var schools = await (await Manager().GetAsync("/api/candidate-schools")).ReadAsync<List<SchoolChoice>>();

        Assert.Equal(planned, Assert.Single(sessions).Id);
        Assert.Contains(schools, s => s.Id == school.Id && s.Name == name);
        Assert.DoesNotContain(schools, s => s.Id == off.Id);
        Assert.DoesNotContain(schools, s => s.Id == ngo.Id);
    }

    [Fact]
    public async Task TheListSearchesFiltersAndPages()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var manager = Manager();
        await manager.PostCandidateAsync(campaign, CandidateForm(nameEn: "Sok Chenda", province: "Battambang", phone: "0911111111"));
        await manager.PostCandidateAsync(campaign, CandidateForm(nameEn: "Vann Dara", province: "Siem Reap", ngo: true, ngoName: "Hope NGO", phone: "0922222222"));
        await manager.PostCandidateAsync(campaign, CandidateForm(nameEn: "Chea Sophea", province: "Siem Reap", phone: "0933333333"));

        async Task<CandidateListDto> List(string query) =>
            await (await manager.GetAsync($"/api/campaigns/{campaign}/candidates{query}")).ReadAsync<CandidateListDto>();

        Assert.Equal("Vann Dara", Assert.Single((await List("?q=vann")).Items).NameEn);
        Assert.Equal("Chea Sophea", Assert.Single((await List("?q=%2B855%2093%20333")).Items).NameEn);
        Assert.Equal(2, (await List("?province=Siem%20Reap")).TotalCount);
        Assert.Equal("Vann Dara", Assert.Single((await List("?ngo=true")).Items).NameEn);
        Assert.Equal(2, (await List("?ngo=false")).TotalCount);

        var paged = await List("?page=2&pageSize=2");
        Assert.Single(paged.Items);
        Assert.Equal(3, paged.TotalCount);
        Assert.Equal(2, paged.TotalPages);
        Assert.Equal(["Battambang", "Siem Reap"], paged.Provinces);
    }
}
