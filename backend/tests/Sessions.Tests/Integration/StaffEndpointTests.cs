using System.Net;
using System.Net.Http.Json;
using Identity.Api;

namespace Sessions.Tests.Integration;

[Collection(SessionsApiCollection.Name)]
public sealed class StaffEndpointTests
{
    private readonly SessionsApiFixture _fixture;

    public StaffEndpointTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task AManager_GetsTheStaffAndThemselves()
    {
        var client = _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");

        var response = await client.GetAsync("/api/staff/assignable");

        response.EnsureSuccessStatusCode();
        var body = (await response.Content.ReadFromJsonAsync<AssignableStaffDto>())!;
        Assert.Equal(new StaffPersonDto("manager-1", "Dara Manager"), body.Me);
        Assert.True(body.DirectoryAvailable);
        Assert.Equal(["officer-1", "officer-2", "manager-1", "admin-1"], body.Staff.Select(s => s.Id));
        Assert.Equal("selection-officer", body.Staff[0].Role);
    }

    [Fact]
    public async Task AnAdmin_CanAskToo()
    {
        var response = await _fixture.CreateClient("Admin Demo", Roles.SystemAdmin).GetAsync("/api/staff/assignable");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task WhenKeycloakCannotBeAsked_TheCallerCanStillPickThemselves()
    {
        var original = _fixture.StaffDirectory.Staff;
        _fixture.StaffDirectory.Staff = null;
        try
        {
            var client = _fixture.CreateClient("Dara Manager", Roles.SelectionManager).AsUser("manager-1");

            var response = await client.GetAsync("/api/staff/assignable");

            response.EnsureSuccessStatusCode();
            var body = (await response.Content.ReadFromJsonAsync<AssignableStaffDto>())!;
            Assert.False(body.DirectoryAvailable);
            Assert.Empty(body.Staff);
            Assert.Equal("manager-1", body.Me.Id);
        }
        finally
        {
            _fixture.StaffDirectory.Staff = original;
        }
    }

    [Theory]
    [InlineData(Roles.SelectionOfficer)]
    [InlineData(Roles.CommitteeUser)]
    public async Task OfficersAndCommitteeUsers_CannotListStaff(string role)
    {
        var response = await _fixture.CreateClient("Someone", role).GetAsync("/api/staff/assignable");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task SomeoneNotSignedIn_IsTurnedAway()
    {
        var response = await _fixture.CreateClient().GetAsync("/api/staff/assignable");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
