using Campaigns.Application;
using Campaigns.Domain;
using Campaigns.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Campaigns.Tests.Persistence;

/// <summary>The gateway other modules use to read a campaign's setup and report a step's status.</summary>
[Collection(CampaignsApiCollection.Name)]
public sealed class CampaignSetupGatewayTests
{
    private readonly CampaignsApiFixture _fixture;

    public CampaignSetupGatewayTests(CampaignsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<T> WithGateway<T>(Func<ICampaignSetupGateway, Task<T>> action)
    {
        await using var scope = _fixture.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<ICampaignSetupGateway>());
    }

    [Fact]
    public async Task GetContext_ReturnsTheCampaignsBasics()
    {
        var client = _fixture.CreateManagerClient();
        var campaign = await client.CreateCampaignAsync();
        await client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ProvinceIds = [17, 2] });

        var context = await WithGateway(g => g.GetContextAsync(campaign.Id, default));

        Assert.NotNull(context);
        Assert.Equal(campaign.Id, context.CampaignId);
        Assert.Equal(campaign.Name, context.Name);
        Assert.Equal("Draft", context.Status);
        Assert.True(context.IsEditable);
        Assert.Equal(new DateOnly(2026, 11, 2), context.StartDate);
    }

    [Fact]
    public async Task GetContext_ListsTheTargetProvincesWithNames_AZ()
    {
        var client = _fixture.CreateManagerClient();
        var campaign = await client.CreateCampaignAsync();
        await client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name) with { ProvinceIds = [17, 2, 21] });

        var context = await WithGateway(g => g.GetContextAsync(campaign.Id, default));

        Assert.Equal(
            [("2", "Battambang"), ("17", "Siem Reap"), ("21", "Takeo")],
            context!.TargetProvinces.Select(p => (p.Id, p.Name)));
    }

    [Fact]
    public async Task GetContext_ReportsEveryStepsStatus()
    {
        var campaign = await _fixture.CreateManagerClient().CreateCampaignAsync();

        var context = await WithGateway(g => g.GetContextAsync(campaign.Id, default));

        Assert.Equal(StepStatus.InProgress, context!.StepStatuses[SetupStepKey.CampaignInfo]);
        Assert.Equal(StepStatus.NotStarted, context.StepStatuses[SetupStepKey.EligibilityRules]);
        Assert.Equal(5, context.StepStatuses.Count);
    }

    [Fact]
    public async Task GetContext_ForAnUnknownCampaign_IsNull()
    {
        Assert.Null(await WithGateway(g => g.GetContextAsync(Guid.NewGuid(), default)));
    }

    [Fact]
    public async Task SetStepStatus_IsStored_AndShownByTheCampaignApi()
    {
        var client = _fixture.CreateManagerClient();
        var campaign = await client.CreateCampaignAsync();

        var result = await WithGateway(g => g.SetStepStatusAsync(campaign.Id, SetupStepKey.EligibilityRules, StepStatus.InProgress, default));

        Assert.True(result.IsSuccess);
        var reloaded = await client.GetCampaignAsync(campaign.Id);
        Assert.Equal("InProgress", reloaded.Steps.Single(s => s.Step == "EligibilityRules").Status);
        Assert.Equal(new ProgressDto(5, 0, 2), reloaded.Progress);
    }

    [Fact]
    public async Task SetStepStatus_ForAnUnknownCampaign_Fails()
    {
        var result = await WithGateway(g => g.SetStepStatusAsync(Guid.NewGuid(), SetupStepKey.EligibilityRules, StepStatus.Complete, default));

        Assert.True(result.IsFailure);
        Assert.Equal(CampaignErrors.NotFound, result.Error);
    }
}
