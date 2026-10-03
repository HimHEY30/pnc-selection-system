using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Identity.Api;

/// <summary>The person asking, as someone work can be assigned to.</summary>
public sealed record StaffPersonDto(string Id, string Name);

/// <summary>A staff member who can be picked, with their role.</summary>
public sealed record StaffMemberDto(string Id, string Name, string Role);

/// <summary>
/// Who work can be assigned to. <see cref="Staff"/> is empty and <see cref="DirectoryAvailable"/> false when
/// the list could not be loaded; <see cref="Me"/> is always there, so a manager can still pick themselves.
/// </summary>
public sealed record AssignableStaffDto(StaffPersonDto Me, IReadOnlyList<StaffMemberDto> Staff, bool DirectoryAvailable);

[ApiController]
[Route("api/staff")]
[Authorize(Policy = AuthorizationPolicies.ManagementTier)]
public sealed class StaffController : ControllerBase
{
    private readonly IStaffDirectory _directory;
    private readonly ICurrentUserService _currentUser;

    public StaffController(IStaffDirectory directory, ICurrentUserService currentUser)
    {
        _directory = directory;
        _currentUser = currentUser;
    }

    /// <summary>
    /// The admins, managers and officers a session can be assigned to or hosted by, plus the caller.
    /// Never fails because Keycloak is unreachable: it says so and still offers the caller.
    /// </summary>
    [HttpGet("assignable")]
    [ProducesResponseType<AssignableStaffDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AssignableStaffDto>> Assignable(CancellationToken ct)
    {
        var user = _currentUser.User;
        if (user is null)
        {
            return Unauthorized();
        }

        var me = new StaffPersonDto(user.Subject, user.DisplayName);
        var listed = await _directory.ListAsync(ct);

        return Ok(listed.IsSuccess
            ? new AssignableStaffDto(me, listed.Value.Select(s => new StaffMemberDto(s.Id, s.Name, s.Role)).ToList(), true)
            : new AssignableStaffDto(me, [], false));
    }
}
