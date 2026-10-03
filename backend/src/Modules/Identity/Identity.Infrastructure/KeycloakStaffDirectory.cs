using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Identity.Application;
using Identity.Domain;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Identity.Infrastructure;

/// <summary>
/// Reads the staff list from Keycloak's admin API: the members of the groups system-admin,
/// selection-manager and selection-officer, which is how the realm hands out roles. It signs in as a
/// read-only service client (client credentials), so no person's password is involved. The answer is
/// kept for a minute so a page that opens a picker does not hit Keycloak every time.
/// </summary>
public sealed class KeycloakStaffDirectory : IStaffDirectory
{
    /// <summary>Most roles first: a person in two groups is shown once, as their highest role.</summary>
    private static readonly string[] RolesByRank =
        [GroupNames.SystemAdmin, GroupNames.SelectionManager, GroupNames.SelectionOfficer];

    private const int PageSize = 200;
    private const int MaxPages = 5;
    private const string ListCacheKey = "identity.staff";
    private const string TokenCacheKey = "identity.staff.token";

    private static readonly TimeSpan ListLifetime = TimeSpan.FromMinutes(1);

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<KeycloakStaffDirectory> _logger;
    private readonly string? _baseUrl;
    private readonly string? _realm;
    private readonly string? _clientId;
    private readonly string? _clientSecret;

    public KeycloakStaffDirectory(
        HttpClient http,
        IMemoryCache cache,
        IConfiguration configuration,
        ILogger<KeycloakStaffDirectory> logger)
    {
        _http = http;
        _cache = cache;
        _logger = logger;

        var keycloak = configuration.GetSection("Keycloak");
        var section = keycloak.GetSection("StaffDirectory");

        // Where this process reaches Keycloak is already known from the authority: .../realms/{realm}.
        var authority = keycloak["Authority"];
        if (!string.IsNullOrWhiteSpace(authority) && authority.IndexOf("/realms/", StringComparison.Ordinal) is var at and > 0)
        {
            _baseUrl = authority[..at];
            _realm = authority[(at + "/realms/".Length)..].Trim('/');
        }

        _clientId = section["ClientId"];
        _clientSecret = section["ClientSecret"];
    }

    private bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_baseUrl)
        && !string.IsNullOrWhiteSpace(_realm)
        && !string.IsNullOrWhiteSpace(_clientId)
        && !string.IsNullOrWhiteSpace(_clientSecret);

    public async Task<Result<IReadOnlyList<StaffMember>>> ListAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue(ListCacheKey, out IReadOnlyList<StaffMember>? cached) && cached is not null)
        {
            return Result.Success(cached);
        }

        if (!IsConfigured)
        {
            _logger.LogWarning(
                "The staff directory is not set up: give Keycloak:StaffDirectory:ClientId and ClientSecret to read staff from Keycloak.");
            return Result.Failure<IReadOnlyList<StaffMember>>(IdentityErrors.StaffDirectoryUnavailable);
        }

        try
        {
            var token = await GetTokenAsync(ct);
            var byId = new Dictionary<string, StaffMember>();

            foreach (var role in RolesByRank)
            {
                foreach (var user in await ListGroupMembersAsync(token, role, ct))
                {
                    // Highest role first, so a later group never replaces an earlier one.
                    byId.TryAdd(user.Id, new StaffMember(user.Id, user.DisplayName(), role));
                }
            }

            IReadOnlyList<StaffMember> staff = byId.Values
                .OrderBy(s => s.Name, StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(s => s.Id, StringComparer.Ordinal)
                .ToList();

            _cache.Set(ListCacheKey, staff, ListLifetime);
            return Result.Success(staff);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException or System.Text.Json.JsonException)
        {
            if (ct.IsCancellationRequested)
            {
                throw;
            }

            _logger.LogWarning(ex, "The staff list could not be read from Keycloak.");
            _cache.Remove(TokenCacheKey);
            return Result.Failure<IReadOnlyList<StaffMember>>(IdentityErrors.StaffDirectoryUnavailable);
        }
    }

    private async Task<string> GetTokenAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue(TokenCacheKey, out string? cached) && cached is not null)
        {
            return cached;
        }

        using var response = await _http.PostAsync(
            $"{_baseUrl}/realms/{_realm}/protocol/openid-connect/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _clientId!,
                ["client_secret"] = _clientSecret!,
            }),
            ct);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<TokenResponse>(ct)
            ?? throw new InvalidOperationException("Keycloak sent an empty token response.");
        if (string.IsNullOrEmpty(body.AccessToken))
        {
            throw new InvalidOperationException("Keycloak sent no access token.");
        }

        // Reuse it until shortly before it runs out.
        var lifetime = TimeSpan.FromSeconds(Math.Max(body.ExpiresIn - 30, 5));
        _cache.Set(TokenCacheKey, body.AccessToken, lifetime);
        return body.AccessToken;
    }

    private async Task<List<KeycloakUser>> ListGroupMembersAsync(string token, string groupName, CancellationToken ct)
    {
        var groups = await GetAsync<List<KeycloakGroup>>(
            token, $"/admin/realms/{_realm}/groups?search={Uri.EscapeDataString(groupName)}&exact=true&max=10", ct);
        var group = groups?.FirstOrDefault(g => string.Equals(g.Name, groupName, StringComparison.Ordinal));
        if (group is null)
        {
            // A realm without this group simply has no one in this role.
            return [];
        }

        var members = new List<KeycloakUser>();
        for (var page = 0; page < MaxPages; page++)
        {
            var batch = await GetAsync<List<KeycloakUser>>(
                token, $"/admin/realms/{_realm}/groups/{group.Id}/members?first={page * PageSize}&max={PageSize}", ct) ?? [];
            members.AddRange(batch.Where(u => u.Enabled && !string.IsNullOrWhiteSpace(u.Id)));
            if (batch.Count < PageSize)
            {
                break;
            }
        }

        return members;
    }

    private async Task<T?> GetAsync<T>(string token, string path, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, _baseUrl + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(ct);
    }

    private sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);

    private sealed record KeycloakGroup(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name);

    private sealed record KeycloakUser(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("username")] string? Username,
        [property: JsonPropertyName("firstName")] string? FirstName,
        [property: JsonPropertyName("lastName")] string? LastName,
        [property: JsonPropertyName("enabled")] bool Enabled)
    {
        public string DisplayName()
        {
            var full = $"{FirstName} {LastName}".Trim();
            return full.Length > 0 ? full : Username ?? Id;
        }
    }
}
