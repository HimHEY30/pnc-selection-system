namespace Eligibility.Domain.Catalogue;

/// <summary>
/// Records that a campaign's exam subjects have been set up (the default Math, Logic and English
/// added). Without it, a campaign whose subjects were all removed on purpose would get the
/// defaults back the next time its page opened.
/// </summary>
public sealed class ExamSetup
{
    public Guid CampaignId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private ExamSetup() { }

    public static ExamSetup Create(Guid campaignId, DateTimeOffset at) => new() { CampaignId = campaignId, CreatedAt = at };
}
