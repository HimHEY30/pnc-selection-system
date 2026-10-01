using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Identity.Api;

[ApiController]
[Route("api/auth")]
[Authorize]
public sealed class AuthController : ControllerBase
{
    private readonly ICurrentUserService _currentUserService;

    public AuthController(ICurrentUserService currentUserService)
    {
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// Returns the caller's identity as the backend sees it. Used by the frontend
    /// to confirm the access token is valid and to read the caller's groups.
    /// </summary>
    [HttpGet("me")]
    public IActionResult Me()
    {
        var user = _currentUserService.User;
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(new
        {
            username = user.Username,
            groups = user.Groups.Select(g => g.ToString()),
        });
    }

    [HttpGet("system-admin/ping")]
    [Authorize(Policy = AuthorizationPolicies.SystemAdmin)]
    public IActionResult SystemAdminPing() => Ok(new { message = "system-admin access confirmed" });

    [HttpGet("selection-manager/ping")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    public IActionResult SelectionManagerPing() => Ok(new { message = "selection-manager (or system-admin) access confirmed" });

    [HttpGet("selection-officer/ping")]
    [Authorize(Policy = AuthorizationPolicies.OperationsTier)]
    public IActionResult SelectionOfficerPing() => Ok(new { message = "selection-officer tier access confirmed" });

    [HttpGet("committee/ping")]
    [Authorize(Policy = AuthorizationPolicies.CommitteeUser)]
    public IActionResult CommitteePing() => Ok(new { message = "committee-user access confirmed" });
}
