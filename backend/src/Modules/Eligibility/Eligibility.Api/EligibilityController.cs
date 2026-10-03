using Eligibility.Application;
using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Eligibility.Api;

/// <summary>
/// HTTP surface for eligibility rules (Step 2 of campaign setup). Reading and testing are open
/// to the operations tier (admin, manager, officer); saving is limited to the management tier
/// (admin, manager). No business rules live here: it only translates HTTP to
/// <see cref="IEligibilityService"/>.
/// </summary>
[ApiController]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
public sealed class EligibilityController : ControllerBase
{
    private readonly IEligibilityService _eligibility;

    public EligibilityController(IEligibilityService eligibility)
    {
        _eligibility = eligibility;
    }

    /// <summary>The fields a rule can check, each with the operators and options it allows.</summary>
    [HttpGet("api/eligibility/catalogue")]
    [ProducesResponseType<CatalogueDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Catalogue(CancellationToken ct) =>
        Ok(await _eligibility.GetCatalogueAsync(ct));

    /// <summary>A campaign's rules, whether the step is locked, and the target provinces.</summary>
    [HttpGet("api/campaigns/{campaignId:guid}/eligibility")]
    [ProducesResponseType<RuleSetDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RuleSetDto>> Get(Guid campaignId, CancellationToken ct)
    {
        var result = await _eligibility.GetAsync(campaignId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>"Save draft": stores the whole rule set and marks Step 2 In progress.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/eligibility/draft")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<RuleSetDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RuleSetDto>> SaveDraft(Guid campaignId, RuleSetRequest request, CancellationToken ct)
    {
        var result = await _eligibility.SaveDraftAsync(campaignId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>"Save and continue": validates everything and marks Step 2 Complete.</summary>
    [HttpPut("api/campaigns/{campaignId:guid}/eligibility")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<RuleSetDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RuleSetDto>> Complete(Guid campaignId, RuleSetRequest request, CancellationToken ct)
    {
        var result = await _eligibility.CompleteAsync(campaignId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>
    /// Runs a sample candidate against the rules sent in the body (the ones on screen, saved or
    /// not) and says which rules passed or failed. Changes nothing, so anyone who can read can use it.
    /// </summary>
    [HttpPost("api/campaigns/{campaignId:guid}/eligibility/test")]
    [ProducesResponseType<TestResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TestResultDto>> Test(Guid campaignId, TestRequest request, CancellationToken ct)
    {
        var result = await _eligibility.TestAsync(campaignId, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>The starter rules for this campaign. Nothing is saved; the page adds them to its working copy.</summary>
    [HttpGet("api/campaigns/{campaignId:guid}/eligibility/suggested")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<SuggestedDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SuggestedDto>> Suggested(Guid campaignId, CancellationToken ct)
    {
        var result = await _eligibility.GetSuggestedAsync(campaignId, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }
}
