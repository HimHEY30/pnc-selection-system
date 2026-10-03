namespace Campaigns.Domain;

/// <summary>The five setup steps of a campaign, in display order. Stored as a smallint.</summary>
public enum SetupStepKey : short
{
    CampaignInfo = 1,
    EligibilityRules = 2,
    InformationSessions = 3,
    Candidates = 4,
    EntranceExam = 5,
}
