using Identity.Application;
using Identity.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Identity.Infrastructure;

/// <summary>
/// Everything needed to compose the Identity module into the Host: JWT Bearer
/// authentication against Keycloak, role flattening, authorization policies,
/// and the current-user service other modules consume via ICurrentUserService.
/// Host.Program.cs should only ever need to call this one method.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddIdentityInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var keycloak = configuration.GetSection("Keycloak");

        // Authority is where THIS process actually reaches Keycloak to fetch JWKS
        // (the Docker-internal address when containerized). Issuer is the identity
        // Keycloak puts in every token's `iss` claim - fixed to the publicly
        // published address via KC_HOSTNAME regardless of who's asking, so the
        // browser's login and this server's validation agree on one issuer even
        // though they reach Keycloak through two different addresses. They're the
        // same value outside Docker, where there's no internal/public split.
        var authority = keycloak["Authority"];
        var issuer = keycloak["Issuer"] ?? authority;

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = authority;
                options.Audience = keycloak["Audience"];
                options.RequireHttpsMetadata = keycloak.GetValue<bool>("RequireHttpsMetadata");
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    NameClaimType = "preferred_username",
                };
            });

        services.AddTransient<IClaimsTransformation, KeycloakRoleClaimsTransformation>();

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.SystemAdmin, p => p.RequireRole(GroupNames.SystemAdmin))
            .AddPolicy(AuthorizationPolicies.SelectionManager, p => p.RequireRole(GroupNames.SelectionManager))
            .AddPolicy(AuthorizationPolicies.SelectionOfficer, p => p.RequireRole(GroupNames.SelectionOfficer))
            .AddPolicy(AuthorizationPolicies.CommitteeUser, p => p.RequireRole(GroupNames.CommitteeUser))
            .AddPolicy(AuthorizationPolicies.ManagementTier, p => p.RequireRole(
                GroupNames.SystemAdmin, GroupNames.SelectionManager))
            .AddPolicy(AuthorizationPolicies.OperationsTier, p => p.RequireRole(
                GroupNames.SystemAdmin, GroupNames.SelectionManager, GroupNames.SelectionOfficer));

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();

        return services;
    }
}
