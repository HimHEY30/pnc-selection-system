using Api.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class AuthController : ControllerBase
{
    /// <summary>
    /// Returns the caller's identity as the backend sees it. Used by the frontend
    /// to confirm the access token is valid and to read the caller's groups.
    /// </summary>
    [HttpGet("me")]
    public IActionResult Me()
    {
        var roles = User.FindAll(System.Security.Claims.ClaimTypes.Role)
            .Select(c => c.Value)
            .ToArray();

        return Ok(new
        {
            username = User.Identity?.Name,
            roles,
        });
    }

    [HttpGet("system-admin/ping")]
    [Authorize(Policy = SelectionGroups.SystemAdmin)]
    public IActionResult SystemAdminPing() => Ok(new { message = "system-admin access confirmed" });

    [HttpGet("selection-manager/ping")]
    [Authorize(Policy = SelectionGroups.ManagementTier)]
    public IActionResult SelectionManagerPing() => Ok(new { message = "selection-manager (or system-admin) access confirmed" });

    [HttpGet("selection-officer/ping")]
    [Authorize(Policy = SelectionGroups.OperationsTier)]
    public IActionResult SelectionOfficerPing() => Ok(new { message = "selection-officer tier access confirmed" });

    [HttpGet("committee/ping")]
    [Authorize(Policy = SelectionGroups.CommitteeUser)]
    public IActionResult CommitteePing() => Ok(new { message = "committee-user access confirmed" });
}
