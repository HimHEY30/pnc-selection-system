namespace Campaigns.Domain;

/// <summary>Link row: a province the campaign recruits from.</summary>
public sealed class CampaignProvince
{
    public Guid CampaignId { get; private set; }
    public short ProvinceId { get; private set; }

    private CampaignProvince() { }

    public CampaignProvince(Guid campaignId, short provinceId)
    {
        CampaignId = campaignId;
        ProvinceId = provinceId;
    }
}
