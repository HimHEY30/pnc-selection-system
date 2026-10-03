namespace Campaigns.Domain;

/// <summary>
/// The stored status of one setup step of one campaign. It is persisted, not
/// derived, so steps 2-5 can set their own status once their features exist.
/// </summary>
public sealed class SetupStep
{
    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }
    public SetupStepKey Step { get; private set; }
    public StepStatus Status { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    private SetupStep() { }

    internal SetupStep(Guid campaignId, SetupStepKey step, StepStatus status, DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        CampaignId = campaignId;
        Step = step;
        Status = status;
        UpdatedAt = now;
    }

    internal void SetStatus(StepStatus status, DateTimeOffset now)
    {
        Status = status;
        UpdatedAt = now;
    }
}
