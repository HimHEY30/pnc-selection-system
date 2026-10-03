using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sessions.Application;

namespace Sessions.Api;

/// <summary>
/// HTTP surface for information sessions (Step 3 of campaign setup). Reading and entering the numbers (expected,
/// then actual females and males) are open to the operations tier (admin, manager, officer); creating, changing and
/// cancelling a session is limited to the management tier (admin, manager). No business rules live here: it only
/// translates HTTP to <see cref="ISessionService"/>.
/// </summary>
[ApiController]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
public sealed class SessionsController : ControllerBase
{
    private readonly ISessionService _sessions;

    public SessionsController(ISessionService sessions)
    {
        _sessions = sessions;
    }

    /// <summary>A campaign's sessions in date order, its totals, and what the page needs to show them.</summary>
    [HttpGet("api/campaigns/{campaignId:guid}/sessions")]
    [ProducesResponseType<SessionListDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SessionListDto>> List(Guid campaignId, CancellationToken ct)
    {
        var result = await _sessions.ListAsync(campaignId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    [HttpGet("api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}")]
    [ProducesResponseType<SessionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SessionDto>> Get(Guid campaignId, Guid sessionId, CancellationToken ct)
    {
        var result = await _sessions.GetAsync(campaignId, sessionId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>The sessions the caller is responsible for or runs, in every campaign, soonest first.</summary>
    [HttpGet("api/sessions/mine")]
    [ProducesResponseType<IReadOnlyList<MySessionDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<MySessionDto>>> Mine(CancellationToken ct)
    {
        var result = await _sessions.ListMineAsync(ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    [HttpPost("api/campaigns/{campaignId:guid}/sessions")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<SessionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<SessionDto>> Create(Guid campaignId, SessionRequest request, CancellationToken ct)
    {
        var result = await _sessions.CreateAsync(campaignId, request, ct);
        return result.IsSuccess
            ? Created($"/api/campaigns/{campaignId}/sessions/{result.Value.Id}", result.Value)
            : result.Error.ToProblem();
    }

    /// <summary>Changes a planned session's details.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<SessionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<SessionDto>> Update(Guid campaignId, Guid sessionId, SessionRequest request, CancellationToken ct)
    {
        var result = await _sessions.UpdateAsync(campaignId, sessionId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Calls off a planned session, with a reason. Final.</summary>
    [HttpPost("api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}/cancel")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<SessionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SessionDto>> Cancel(Guid campaignId, Guid sessionId, CancelRequest request, CancellationToken ct)
    {
        var result = await _sessions.CancelAsync(campaignId, sessionId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Sets, or clears with null, how many candidates are expected. Open to officers too.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}/expected")]
    [ProducesResponseType<SessionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SessionDto>> SetExpected(Guid campaignId, Guid sessionId, ExpectedRequest request, CancellationToken ct)
    {
        var result = await _sessions.SetExpectedAsync(campaignId, sessionId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Records how many females and males came, once the session's date has arrived. Marks it Done. Open to officers too.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}/attendance")]
    [ProducesResponseType<SessionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SessionDto>> RecordAttendance(
        Guid campaignId, Guid sessionId, AttendanceRequest request, CancellationToken ct)
    {
        var result = await _sessions.RecordAttendanceAsync(campaignId, sessionId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }
}
