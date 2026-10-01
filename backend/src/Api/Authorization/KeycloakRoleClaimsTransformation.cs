using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;

namespace Api.Authorization;

/// <summary>
/// Keycloak puts realm roles inside a nested "realm_access": { "roles": [...] } claim,
/// not as individual "role" claims. ASP.NET Core authorization policies expect
/// ClaimTypes.Role, so this flattens realm_access.roles into real role claims
/// right after token validation.
/// </summary>
public sealed class KeycloakRoleClaimsTransformation : IClaimsTransformation
{
    private const string RealmAccessClaimType = "realm_access";

    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        var identity = principal.Identity as ClaimsIdentity;
        if (identity is null || !identity.IsAuthenticated)
        {
            return Task.FromResult(principal);
        }

        if (identity.HasClaim(c => c.Type == ClaimTypes.Role))
        {
            // Already transformed (claims transformation can run more than once per request).
            return Task.FromResult(principal);
        }

        var realmAccessClaim = identity.FindFirst(RealmAccessClaimType);
        if (realmAccessClaim is null)
        {
            return Task.FromResult(principal);
        }

        using var realmAccess = JsonDocument.Parse(realmAccessClaim.Value);
        if (!realmAccess.RootElement.TryGetProperty("roles", out var roles))
        {
            return Task.FromResult(principal);
        }

        foreach (var role in roles.EnumerateArray())
        {
            var roleName = role.GetString();
            if (!string.IsNullOrWhiteSpace(roleName))
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, roleName));
            }
        }

        return Task.FromResult(principal);
    }
}
