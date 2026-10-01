using Identity.Domain;

namespace Identity.Application;

/// <summary>
/// The Application Contract other modules depend on to know who is making the
/// current request (e.g. for CreatedBy/ModifiedBy), without referencing
/// Identity.Infrastructure or ASP.NET's ClaimsPrincipal directly.
/// </summary>
public interface ICurrentUserService
{
    AuthenticatedUser? User { get; }
}
