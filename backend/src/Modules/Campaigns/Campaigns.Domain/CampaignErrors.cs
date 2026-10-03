using SharedKernel;

namespace Campaigns.Domain;

public static class CampaignErrors
{
    public static readonly Error NotFound =
        Error.NotFound("campaign.not_found", "This campaign does not exist.");

    public static readonly Error NotEditable =
        Error.Conflict("campaign.not_editable", "Only a draft campaign can be edited.");

    public static readonly Error ConcurrentEdit =
        Error.Conflict("campaign.concurrent_edit", "Someone else changed this campaign. Reload the page and try again.");

    public static Error Invalid(IReadOnlyDictionary<string, string[]> fieldErrors) =>
        Error.Validation("campaign.invalid", "Some fields need your attention.", fieldErrors);
}
