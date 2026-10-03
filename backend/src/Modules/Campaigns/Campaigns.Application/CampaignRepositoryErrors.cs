using SharedKernel;

namespace Campaigns.Application;

/// <summary>Failures the repository reports from <see cref="ICampaignRepository.SaveChangesAsync"/>.</summary>
public static class CampaignRepositoryErrors
{
    public static readonly Error DuplicateName =
        Error.Conflict("campaign.duplicate_name", "A campaign with this name already exists.");
}
