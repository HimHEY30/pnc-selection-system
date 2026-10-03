using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sessions.Application;

namespace Sessions.Api;

/// <summary>Switches a host off or on.</summary>
public sealed record ActiveRequest(bool? IsActive);

/// <summary>
/// HTTP surface for the alumni and partner directory. Anyone in the operations tier (admin, manager, officer) can
/// read it; adding, changing and switching off is limited to the management tier (admin, manager). No business rules
/// live here: it only translates HTTP to <see cref="IHostService"/>.
/// </summary>
[ApiController]
[Route("api/session-hosts")]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
public sealed class HostsController : ControllerBase
{
    private readonly IHostService _hosts;

    public HostsController(IHostService hosts)
    {
        _hosts = hosts;
    }

    /// <summary>The alumni and partners that can run a session, by name. Switched-off ones only when asked for.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<HostDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<HostDto>>> List(
        [FromQuery] string? type, [FromQuery] bool includeInactive, CancellationToken ct)
    {
        var result = await _hosts.ListAsync(type, includeInactive, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<HostDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<HostDto>> Create(HostRequest request, CancellationToken ct)
    {
        var result = await _hosts.CreateAsync(request, ct);
        return result.IsSuccess
            ? Created($"/api/session-hosts/{result.Value.Id}", result.Value)
            : result.Error.ToProblem();
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<HostDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<HostDto>> Update(Guid id, HostRequest request, CancellationToken ct)
    {
        var result = await _hosts.UpdateAsync(id, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Switches a host off (no new sessions can choose it) or back on. Its past sessions keep it.</summary>
    [HttpPut("{id:guid}/active")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<HostDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<HostDto>> SetActive(Guid id, ActiveRequest request, CancellationToken ct)
    {
        if (request.IsActive is not { } active)
        {
            return ValidationProblem(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["isActive"] = ["Say whether the host is switched on or off."] }));
        }

        var result = await _hosts.SetActiveAsync(id, active, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }
}
