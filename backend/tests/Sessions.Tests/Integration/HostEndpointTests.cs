using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Sessions.Application;

namespace Sessions.Tests.Integration;

[Collection(SessionsApiCollection.Name)]
public sealed class HostEndpointTests
{
    private readonly SessionsApiFixture _fixture;

    public HostEndpointTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient Manager() => _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");
    private HttpClient Officer() => _fixture.CreateClient("Sokha Officer", Roles.SelectionOfficer).AsUser("officer-1");

    private static string Unique(string name) => $"{name} {Guid.NewGuid():N}";

    private static HostRequest Alumnus(string? name = null) =>
        new("Alumni", name ?? Unique("Chenda"), null, null, "012 345 678", null);

    private static HostRequest Partner(string? name = null) =>
        new("Partner", name ?? Unique("Hope NGO"), "Ngo", "Mr Rith", null, "info@hope.example.org");

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<ValidationProblemDetails> ProblemAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!;

    // ---------- Create and read ----------

    [Fact]
    public async Task AManager_AddsAnAlumnusAndAPartner_AndTheyAppearInTheList()
    {
        var alumnus = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));
        var partnerResponse = await Manager().PostAsJsonAsync("/api/session-hosts", Partner());
        var partner = await ReadAsync<HostDto>(partnerResponse);

        Assert.Equal(HttpStatusCode.Created, partnerResponse.StatusCode);
        Assert.Equal($"/api/session-hosts/{partner.Id}", partnerResponse.Headers.Location!.OriginalString);
        Assert.Equal("Alumni", alumnus.Type);
        Assert.Equal("Ngo", partner.PartnerKind);

        var list = await ReadAsync<List<HostDto>>(await Manager().GetAsync("/api/session-hosts"));
        Assert.Contains(list, h => h.Id == alumnus.Id);
        Assert.Contains(list, h => h.Id == partner.Id);
    }

    [Fact]
    public async Task TheListCanBeFilteredByType()
    {
        var alumnus = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));
        var partner = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Partner()));

        var partners = await ReadAsync<List<HostDto>>(await Manager().GetAsync("/api/session-hosts?type=Partner"));

        Assert.Contains(partners, h => h.Id == partner.Id);
        Assert.DoesNotContain(partners, h => h.Id == alumnus.Id);
        Assert.All(partners, h => Assert.Equal("Partner", h.Type));
    }

    [Fact]
    public async Task AnUnknownTypeFilter_IsRefused()
    {
        var response = await Manager().GetAsync("/api/session-hosts?type=Officer");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("type", (await ProblemAsync(response)).Errors.Keys);
    }

    [Fact]
    public async Task ABadForm_IsRefusedWithAMessagePerField()
    {
        var response = await Manager().PostAsJsonAsync("/api/session-hosts", new HostRequest("Partner", " ", null, null, "12", null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Contains("name", problem.Errors.Keys);
        Assert.Contains("partnerKind", problem.Errors.Keys);
        Assert.Contains("phone", problem.Errors.Keys);
        Assert.Equal("sessions.invalid", problem.Extensions["code"]!.ToString());
    }

    [Fact]
    public async Task ASecondHostWithTheSameName_IsRefusedIgnoringCase_ButAnAlumnusMayShareAPartnersName()
    {
        var name = Unique("Hope");
        await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Partner(name)));

        var duplicate = await Manager().PostAsJsonAsync("/api/session-hosts", Partner(name.ToUpperInvariant()));
        var alumnus = await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus(name));

        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Equal(["A partner with this name is already in the list."], (await ProblemAsync(duplicate)).Errors["name"]);
        Assert.Equal(HttpStatusCode.Created, alumnus.StatusCode);
    }

    // ---------- Change ----------

    [Fact]
    public async Task AManager_ChangesAHost()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Partner()));
        var name = Unique("Hope Foundation");

        var updated = await ReadAsync<HostDto>(await Manager().PutAsJsonAsync(
            $"/api/session-hosts/{host.Id}", new HostRequest("Partner", name, "University", null, "012 111 222", null)));

        Assert.Equal(name, updated.Name);
        Assert.Equal("University", updated.PartnerKind);
        Assert.Null(updated.ContactPerson);
    }

    [Fact]
    public async Task ChangingAnUnknownHost_IsNotFound()
    {
        var response = await Manager().PutAsJsonAsync($"/api/session-hosts/{Guid.NewGuid()}", Alumnus());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AnAlumnusCannotBecomeAPartner()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));

        var response = await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}", Partner());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("type", (await ProblemAsync(response)).Errors.Keys);
    }

    [Fact]
    public async Task ASwitchedOffHost_LeavesTheListUntilAskedFor_AndCanComeBack()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));

        var off = await ReadAsync<HostDto>(await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}/active", new ActiveRequestBody(false)));
        var shown = await ReadAsync<List<HostDto>>(await Manager().GetAsync("/api/session-hosts"));
        var all = await ReadAsync<List<HostDto>>(await Manager().GetAsync("/api/session-hosts?includeInactive=true"));
        var on = await ReadAsync<HostDto>(await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}/active", new ActiveRequestBody(true)));

        Assert.False(off.IsActive);
        Assert.DoesNotContain(shown, h => h.Id == host.Id);
        Assert.Contains(all, h => h.Id == host.Id && !h.IsActive);
        Assert.True(on.IsActive);
    }

    [Fact]
    public async Task SwitchingWithoutSayingWhichWay_IsRefused()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));

        var response = await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}/active", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("isActive", (await ProblemAsync(response)).Errors.Keys);
    }

    [Fact]
    public async Task EveryChangeIsWrittenToTheAuditLog_WithWhoDidIt()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));
        await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}", Alumnus(Unique("Renamed")));
        await Manager().PutAsJsonAsync($"/api/session-hosts/{host.Id}/active", new ActiveRequestBody(false));

        var rows = await _fixture.ScalarAsync<long>(
            "select count(*) from sessions.audit_log where entity = 2 and entity_id = @id and campaign_id is null and changed_by_id = 'manager-1' and changed_by_name = 'Dara Manager'",
            ("id", host.Id));
        var actions = await _fixture.ScalarAsync<string>(
            "select string_agg(action::text, ',' order by changed_at, action) from sessions.audit_log where entity_id = @id", ("id", host.Id));

        Assert.Equal(3, rows);
        Assert.Equal("1,2,6", actions);
    }

    // ---------- Who may do what ----------

    [Fact]
    public async Task AnOfficer_CanReadTheDirectory_ButNotChangeIt()
    {
        var host = await ReadAsync<HostDto>(await Manager().PostAsJsonAsync("/api/session-hosts", Alumnus()));

        Assert.Equal(HttpStatusCode.OK, (await Officer().GetAsync("/api/session-hosts")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Officer().PostAsJsonAsync("/api/session-hosts", Alumnus())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Officer().PutAsJsonAsync($"/api/session-hosts/{host.Id}", Alumnus())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Officer().PutAsJsonAsync($"/api/session-hosts/{host.Id}/active", new ActiveRequestBody(false))).StatusCode);
    }

    [Fact]
    public async Task AnAdmin_CanDoWhatAManagerCan()
    {
        var admin = _fixture.CreateClient("Admin Demo", Roles.SystemAdmin).AsUser("admin-1");

        var response = await admin.PostAsJsonAsync("/api/session-hosts", Alumnus());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task ACommitteeUser_CannotEvenReadIt()
    {
        var committee = _fixture.CreateClient("Committee", Roles.CommitteeUser);

        Assert.Equal(HttpStatusCode.Forbidden, (await committee.GetAsync("/api/session-hosts")).StatusCode);
    }

    [Fact]
    public async Task SomeoneNotSignedIn_IsTurnedAway()
    {
        var anonymous = _fixture.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/session-hosts")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/session-hosts", Alumnus())).StatusCode);
    }

    private sealed record ActiveRequestBody(bool IsActive);
}
