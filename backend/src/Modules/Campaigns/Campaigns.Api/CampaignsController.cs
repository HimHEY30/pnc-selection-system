using Microsoft.AspNetCore.Http;
using Campaigns.Application;
using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Campaigns.Api;

/// <summary>
/// HTTP surface for campaigns. Reading is open to the operations tier (admin, manager,
/// officer); creating and editing is limited to the management tier (admin, manager).
/// No business rules live here: it only translates HTTP to <see cref="ICampaignService"/>.
/// </summary>
[ApiController]
[Route("api/campaigns")]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
public sealed class CampaignsController : ControllerBase
{
    private readonly ICampaignService _campaigns;

    public CampaignsController(ICampaignService campaigns)
    {
        _campaigns = campaigns;
    }

    /// <summary>Lists campaigns, newest first. Feeds the campaign switcher.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CampaignSummaryDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await _campaigns.ListAsync(ct));

    /// <summary>Gets one campaign with its setup steps and progress.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<CampaignDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CampaignDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var result = await _campaigns.GetAsync(id, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>What this campaign has that a new campaign can copy, with counts. Feeds the "copy from" checklist.</summary>
    [HttpGet("{id:guid}/copy-preview")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<CopyPreviewDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CopyPreviewDto>> CopyPreview(Guid id, CancellationToken ct)
    {
        var result = await _campaigns.GetCopyPreviewAsync(id, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>Creates a Draft campaign, from scratch or by copying parts of another. Step 1 starts In progress.</summary>
    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<CampaignDetailDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CampaignDetailDto>> Create(CreateCampaignRequest request, CancellationToken ct)
    {
        var result = await _campaigns.CreateAsync(request, ct);
        return result.IsSuccess
            ? CreatedAtAction(nameof(Get), new { id = result.Value.Id }, result.Value)
            : result.Error.ToProblem();
    }

    /// <summary>"Save draft": stores partial Step 1 data and marks the step In progress.</summary>
    [HttpPut("{id:guid}/info/draft")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<CampaignDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CampaignDetailDto>> SaveInfoDraft(Guid id, CampaignInfoRequest request, CancellationToken ct)
    {
        var result = await _campaigns.SaveInfoDraftAsync(id, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }

    /// <summary>"Save and continue": validates everything and marks Step 1 Complete.</summary>
    [HttpPut("{id:guid}/info")]
    [Authorize(Policy = AuthorizationPolicies.ManagementTier)]
    [ProducesResponseType<CampaignDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CampaignDetailDto>> CompleteInfo(Guid id, CampaignInfoRequest request, CancellationToken ct)
    {
        var result = await _campaigns.CompleteInfoAsync(id, request, ct);
        return result.IsSuccess ? Ok(result.Value) : result.Error.ToProblem();
    }
}
