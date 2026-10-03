using System.Net;
using System.Text;
using System.Text.Json;
using Identity.Application;
using Identity.Infrastructure;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel;

namespace Identity.Tests;

public sealed class KeycloakStaffDirectoryTests
{
    private const string Authority = "http://keycloak:8080/realms/pnc-selection";

    /// <summary>A pretend Keycloak: answers by URL path and remembers what it was asked.</summary>
    private sealed class FakeKeycloak : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];
        public List<string> Bodies { get; } = [];
        public HttpStatusCode TokenStatus { get; set; } = HttpStatusCode.OK;
        public Dictionary<string, string> GroupIds { get; } = new()
        {
            ["system-admin"] = "g-admin",
            ["selection-manager"] = "g-manager",
            ["selection-officer"] = "g-officer",
        };

        public Dictionary<string, object[]> Members { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            Bodies.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));

            var path = request.RequestUri!.AbsolutePath;
            var query = request.RequestUri.Query;

            if (path.EndsWith("/protocol/openid-connect/token", StringComparison.Ordinal))
            {
                return TokenStatus == HttpStatusCode.OK
                    ? Json(new { access_token = "token-" + Requests.Count, expires_in = 300 })
                    : new HttpResponseMessage(TokenStatus);
            }

            if (path.EndsWith("/groups", StringComparison.Ordinal))
            {
                var wanted = System.Web.HttpUtility.ParseQueryString(query)["search"]!;
                return GroupIds.TryGetValue(wanted, out var id)
                    ? Json(new[] { new { id, name = wanted }, new { id = "decoy", name = wanted + "-extra" } })
                    : Json(Array.Empty<object>());
            }

            if (path.Contains("/groups/", StringComparison.Ordinal) && path.EndsWith("/members", StringComparison.Ordinal))
            {
                var groupId = path.Split('/')[^2];
                var first = int.Parse(System.Web.HttpUtility.ParseQueryString(query)["first"] ?? "0");
                var all = Members.GetValueOrDefault(groupId) ?? [];
                return Json(all.Skip(first).Take(200).ToArray());
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };
    }

    private static object User(string id, string? first, string? last, string username = "someone", bool enabled = true) =>
        new { id, username, firstName = first, lastName = last, enabled };

    private static KeycloakStaffDirectory Create(
        FakeKeycloak keycloak, bool configured = true, IMemoryCache? cache = null, string authority = Authority)
    {
        var settings = new Dictionary<string, string?> { ["Keycloak:Authority"] = authority };
        if (configured)
        {
            settings["Keycloak:StaffDirectory:ClientId"] = "selection-system-staff-reader";
            settings["Keycloak:StaffDirectory:ClientSecret"] = "secret";
        }

        return new KeycloakStaffDirectory(
            new HttpClient(keycloak),
            cache ?? new MemoryCache(new MemoryCacheOptions()),
            new ConfigurationBuilder().AddInMemoryCollection(settings).Build(),
            NullLogger<KeycloakStaffDirectory>.Instance);
    }

    [Fact]
    public async Task Lists_the_members_of_the_three_staff_groups_by_name_with_their_role()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-admin"] = [User("a1", "Admin", "Demo")];
        keycloak.Members["g-manager"] = [User("m1", "Dara", "Manager")];
        keycloak.Members["g-officer"] = [User("o2", "Vanna", "Officer"), User("o1", "Sokha", "Officer")];

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(
            [
                new StaffMember("a1", "Admin Demo", "system-admin"),
                new StaffMember("m1", "Dara Manager", "selection-manager"),
                new StaffMember("o1", "Sokha Officer", "selection-officer"),
                new StaffMember("o2", "Vanna Officer", "selection-officer"),
            ],
            result.Value);
    }

    [Fact]
    public async Task A_person_in_two_groups_is_listed_once_with_their_highest_role()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-manager"] = [User("p1", "Dara", "Manager")];
        keycloak.Members["g-officer"] = [User("p1", "Dara", "Manager")];

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.Equal([new StaffMember("p1", "Dara Manager", "selection-manager")], result.Value);
    }

    [Fact]
    public async Task Disabled_users_are_left_out_and_a_missing_name_falls_back_to_the_username()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-officer"] =
        [
            User("o1", "Sokha", "Officer", enabled: false),
            User("o2", null, null, username: "officer.demo"),
            User("o3", "Chenda", null),
        ];

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.Equal(
            [new StaffMember("o3", "Chenda", "selection-officer"), new StaffMember("o2", "officer.demo", "selection-officer")],
            result.Value);
    }

    [Fact]
    public async Task A_group_the_realm_does_not_have_just_has_no_members()
    {
        var keycloak = new FakeKeycloak();
        keycloak.GroupIds.Remove("system-admin");
        keycloak.Members["g-officer"] = [User("o1", "Sokha", "Officer")];

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.Equal([new StaffMember("o1", "Sokha Officer", "selection-officer")], result.Value);
    }

    [Fact]
    public async Task Only_the_group_with_the_exact_name_counts()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["decoy"] = [User("x1", "Not", "Staff")];
        keycloak.Members["g-officer"] = [User("o1", "Sokha", "Officer")];

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.DoesNotContain(result.Value, s => s.Id == "x1");
    }

    [Fact]
    public async Task Reads_every_page_of_a_large_group()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-officer"] = Enumerable.Range(0, 230).Select(i => User($"o{i:000}", "Officer", $"{i:000}")).ToArray();

        var result = await Create(keycloak).ListAsync(CancellationToken.None);

        Assert.Equal(230, result.Value.Count);
    }

    [Fact]
    public async Task Signs_in_with_the_service_client_and_sends_the_token_to_the_admin_api()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-officer"] = [User("o1", "Sokha", "Officer")];

        await Create(keycloak).ListAsync(CancellationToken.None);

        var token = keycloak.Requests[0];
        Assert.Equal(HttpMethod.Post, token.Method);
        Assert.Equal("http://keycloak:8080/realms/pnc-selection/protocol/openid-connect/token", token.RequestUri!.ToString());
        Assert.Equal(
            "grant_type=client_credentials&client_id=selection-system-staff-reader&client_secret=secret",
            keycloak.Bodies[0]);

        var admin = keycloak.Requests.Skip(1).ToList();
        Assert.NotEmpty(admin);
        Assert.All(admin, r =>
        {
            Assert.Equal("Bearer", r.Headers.Authorization!.Scheme);
            Assert.StartsWith("token-", r.Headers.Authorization.Parameter);
            Assert.StartsWith("http://keycloak:8080/admin/realms/pnc-selection/groups", r.RequestUri!.ToString());
        });
    }

    [Fact]
    public async Task Keeps_the_list_for_a_minute()
    {
        var keycloak = new FakeKeycloak();
        keycloak.Members["g-officer"] = [User("o1", "Sokha", "Officer")];
        var directory = Create(keycloak);

        await directory.ListAsync(CancellationToken.None);
        var calls = keycloak.Requests.Count;
        var again = await directory.ListAsync(CancellationToken.None);

        Assert.Equal(calls, keycloak.Requests.Count);
        Assert.Single(again.Value);
    }

    [Fact]
    public async Task Reuses_the_token_when_the_list_has_to_be_read_again()
    {
        var keycloak = new FakeKeycloak();
        var cache = new MemoryCache(new MemoryCacheOptions());
        await Create(keycloak, cache: cache).ListAsync(CancellationToken.None);
        cache.Remove("identity.staff");

        await Create(keycloak, cache: cache).ListAsync(CancellationToken.None);

        Assert.Equal(1, keycloak.Requests.Count(r => r.RequestUri!.AbsolutePath.EndsWith("/token", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Without_a_client_id_and_secret_the_directory_is_unavailable_and_asks_nobody()
    {
        var keycloak = new FakeKeycloak();

        var result = await Create(keycloak, configured: false).ListAsync(CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Unavailable, result.Error.Type);
        Assert.Equal(IdentityErrors.StaffDirectoryUnavailable, result.Error);
        Assert.Empty(keycloak.Requests);
    }

    [Fact]
    public async Task An_authority_that_is_not_a_realm_address_is_unavailable()
    {
        var result = await Create(new FakeKeycloak(), authority: "http://keycloak:8080").ListAsync(CancellationToken.None);

        Assert.Equal(IdentityErrors.StaffDirectoryUnavailable, result.Error);
    }

    [Fact]
    public async Task Refused_credentials_make_it_unavailable_and_are_not_cached()
    {
        var keycloak = new FakeKeycloak { TokenStatus = HttpStatusCode.Unauthorized };
        var directory = Create(keycloak);

        var refused = await directory.ListAsync(CancellationToken.None);
        Assert.Equal(IdentityErrors.StaffDirectoryUnavailable, refused.Error);

        keycloak.TokenStatus = HttpStatusCode.OK;
        keycloak.Members["g-officer"] = [User("o1", "Sokha", "Officer")];
        var recovered = await directory.ListAsync(CancellationToken.None);

        Assert.True(recovered.IsSuccess);
        Assert.Single(recovered.Value);
    }

    [Fact]
    public async Task A_keycloak_that_is_down_makes_it_unavailable()
    {
        var directory = new KeycloakStaffDirectory(
            new HttpClient(new ThrowingHandler()),
            new MemoryCache(new MemoryCacheOptions()),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Keycloak:Authority"] = Authority,
                ["Keycloak:StaffDirectory:ClientId"] = "c",
                ["Keycloak:StaffDirectory:ClientSecret"] = "s",
            }).Build(),
            NullLogger<KeycloakStaffDirectory>.Instance);

        var result = await directory.ListAsync(CancellationToken.None);

        Assert.Equal(IdentityErrors.StaffDirectoryUnavailable, result.Error);
    }

    [Fact]
    public async Task Cancelling_the_request_is_not_reported_as_unavailable()
    {
        var directory = Create(new FakeKeycloak());
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => directory.ListAsync(cts.Token));
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("connection refused");
    }
}
