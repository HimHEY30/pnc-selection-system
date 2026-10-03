using Microsoft.AspNetCore.Http;
using Campaigns.Application;
using Identity.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Campaigns.Api;

[ApiController]
[Route("api/provinces")]
[Authorize(Policy = AuthorizationPolicies.OperationsTier)]
public sealed class ProvincesController : ControllerBase
{
    private readonly ICampaignService _campaigns;

    public ProvincesController(ICampaignService campaigns)
    {
        _campaigns = campaigns;
    }

    /// <summary>Lists Cambodia's 25 provinces, A to Z. Feeds the target-province picker.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ProvinceDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(await _campaigns.ListProvincesAsync(ct));
}
