using SharedKernel;

namespace Identity.Application;

/// <summary>A person who works on selection campaigns: an admin, a manager or an officer.</summary>
/// <param name="Id">The Keycloak subject, the same id that appears in a signed-in user's token.</param>
/// <param name="Name">The person's full name, or their username when they have no name.</param>
/// <param name="Role">The realm role name: system-admin, selection-manager or selection-officer.</param>
public sealed record StaffMember(string Id, string Name, string Role);

/// <summary>
/// Who the staff are. Users live only in Keycloak, so other modules (assigning a session to an officer,
/// for instance) ask this contract instead of keeping a copy of the user list. Published by Identity.
/// </summary>
public interface IStaffDirectory
{
    /// <summary>
    /// Every enabled admin, manager and officer, by name. Fails with an "unavailable" error when the
    /// identity provider cannot be asked (not set up, down, or refusing this system's credentials).
    /// </summary>
    Task<Result<IReadOnlyList<StaffMember>>> ListAsync(CancellationToken ct);
}

public static class IdentityErrors
{
    public static readonly Error StaffDirectoryUnavailable = Error.Unavailable(
        "identity.staff_directory_unavailable",
        "The list of staff could not be loaded right now. You can still choose yourself.");
}
