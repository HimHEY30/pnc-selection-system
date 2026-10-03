using System.Security.Claims;
using Identity.Application;
using Identity.Domain;
using Microsoft.AspNetCore.Http;

namespace Identity.Infrastructure;

public sealed class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public AuthenticatedUser? User
    {
        get
        {
            var principal = _httpContextAccessor.HttpContext?.User;
            if (principal?.Identity is not { IsAuthenticated: true })
            {
                return null;
            }

            var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal.FindFirstValue("sub")
                ?? string.Empty;

            var username = principal.FindFirstValue("preferred_username")
                ?? principal.Identity.Name
                ?? string.Empty;

            var groups = principal.FindAll(ClaimTypes.Role)
                .Select(c => GroupNames.FromKeycloakName(c.Value))
                .Where(g => g is not null)
                .Select(g => g!.Value)
                .ToArray();

            return new AuthenticatedUser(subject, username, groups, principal.FindFirstValue("name"));
        }
    }
}
