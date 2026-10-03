using Candidates.Application;
using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sessions.Application;

namespace Candidates.Api;

/// <summary>
/// HTTP surface for candidates (Step 4 of campaign setup). Anyone in the operations tier (admin, manager, officer) can
/// read, add and change a candidate; deleting is limited to the management tier (admin, manager). A candidate is
/// personal data about young people, so nothing here may be cached by the browser or a proxy. No business rules live
/// here: it only translates HTTP to <see cref="ICandidateService"/>.
/// </summary>
[ApiController]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class CandidatesController : ControllerBase
{
    private readonly ICandidateService _candidates;

    public CandidatesController(ICandidateService candidates)
    {
        _candidates = candidates;
    }

    /// <summary>A page of the campaign's candidates, newest first. Search matches names and phone numbers.</summary>
    [HttpGet("api/campaigns/{campaignId:guid}/candidates")]
    [ProducesResponseType<CandidateListDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CandidateListDto>> List(
        Guid campaignId,
        [FromQuery] string? q,
        [FromQuery] string? province,
        [FromQuery] Guid? sessionId,
        [FromQuery] bool? ngo,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var result = await _candidates.ListAsync(campaignId, new CandidateListRequest(q, province, sessionId, ngo, page, pageSize), ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    [HttpGet("api/campaigns/{campaignId:guid}/candidates/{candidateId:guid}")]
    [ProducesResponseType<CandidateDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CandidateDto>> Get(Guid campaignId, Guid candidateId, CancellationToken ct)
    {
        var result = await _candidates.GetAsync(campaignId, candidateId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    [HttpPost("api/campaigns/{campaignId:guid}/candidates")]
    [ProducesResponseType<CandidateDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CandidateDto>> Create(Guid campaignId, CandidateRequest request, CancellationToken ct)
    {
        var result = await _candidates.CreateAsync(campaignId, request, ct);
        return result.IsSuccess
            ? Created($"/api/campaigns/{campaignId}/candidates/{result.Value.Id}", result.Value)
            : result.Error.ToProblem();
    }

    /// <summary>Changes a candidate. The request carries the version the person was looking at.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/candidates/{candidateId:guid}")]
    [ProducesResponseType<CandidateDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CandidateDto>> Update(Guid campaignId, Guid candidateId, CandidateRequest request, CancellationToken ct)
    {
        var result = await _candidates.UpdateAsync(campaignId, candidateId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Deletes a candidate for good. The audit trail keeps what it looked like. Management only.</summary>
    [HttpDelete("api/campaigns/{campaignId:guid}/candidates/{candidateId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(Guid campaignId, Guid candidateId, CancellationToken ct)
    {
        var result = await _candidates.DeleteAsync(campaignId, candidateId, ct);
        return result.IsSuccess ? NoContent() : result.Error.ToProblem();
    }

    /// <summary>The campaign's sessions that a candidate can be said to have come to.</summary>
    [HttpGet("api/campaigns/{campaignId:guid}/candidates/session-choices")]
    [ProducesResponseType<IReadOnlyList<SessionChoice>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<SessionChoice>>> SessionChoices(Guid campaignId, CancellationToken ct)
    {
        var result = await _candidates.ListSessionChoicesAsync(campaignId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>The high schools in the partner directory that are switched on, by name.</summary>
    [HttpGet("api/candidate-schools")]
    [ProducesResponseType<IReadOnlyList<SchoolChoice>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SchoolChoice>>> Schools(CancellationToken ct) =>
        Ok(await _candidates.ListSchoolsAsync(ct));
}
