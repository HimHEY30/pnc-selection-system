using Campaigns.Domain;

namespace Campaigns.Tests.Domain;

public sealed class CampaignTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 3, 9, 12, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Later = Now.AddMinutes(30);

    private static Campaign NewCampaign(string name = "Selection 2027") =>
        Campaign.Create(name, "2027–2028", "A description", "user-1", "Sreyneang Chea", Now);

    private static CampaignInfo FullInfo(string name = "Selection 2027", params short[] provinces) =>
        new(name, "2027–2028", "A description", new DateOnly(2026, 11, 2), new DateOnly(2027, 3, 31), 1500, 150,
            provinces.Length == 0 ? [2, 17] : provinces);

    [Fact]
    public void Create_StartsAsDraft()
    {
        var campaign = NewCampaign();

        Assert.Equal(CampaignStatus.Draft, campaign.Status);
        Assert.True(campaign.IsEditable);
        Assert.Equal("user-1", campaign.CreatedById);
        Assert.Equal("Sreyneang Chea", campaign.CreatedByName);
        Assert.Equal(Now, campaign.CreatedAt);
    }

    [Fact]
    public void Create_AddsAllFiveSteps_Step1InProgressAndTheRestNotStarted()
    {
        var campaign = NewCampaign();

        Assert.Equal(5, campaign.Steps.Count);
        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
        foreach (var key in new[]
                 {
                     SetupStepKey.EligibilityRules, SetupStepKey.InformationSessions,
                     SetupStepKey.Candidates, SetupStepKey.EntranceExam,
                 })
        {
            Assert.Equal(StepStatus.NotStarted, campaign.GetStep(key).Status);
        }
    }

    [Fact]
    public void Create_TrimsNameAndStoresACaseInsensitiveKey()
    {
        var campaign = NewCampaign("  Selection 2027 ");

        Assert.Equal("Selection 2027", campaign.Name);
        Assert.Equal("selection 2027", campaign.NameNormalized);
        Assert.Equal(Campaign.Normalize("SELECTION 2027"), campaign.NameNormalized);
    }

    [Fact]
    public void Create_TurnsBlankDescriptionIntoNull()
    {
        var campaign = Campaign.Create("Selection 2027", "2027–2028", "   ", "user-1", "Name", Now);

        Assert.Null(campaign.Description);
    }

    [Fact]
    public void SaveInfoDraft_StoresPartialDataAndKeepsStep1InProgress()
    {
        var campaign = NewCampaign();
        var partial = new CampaignInfo("Selection 2027", "2027–2028", null, new DateOnly(2026, 11, 2), null, null, null, []);

        var result = campaign.SaveInfoDraft(partial, Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(new DateOnly(2026, 11, 2), campaign.StartDate);
        Assert.Null(campaign.EndDate);
        Assert.Empty(campaign.Provinces);
        var step = campaign.GetStep(SetupStepKey.CampaignInfo);
        Assert.Equal(StepStatus.InProgress, step.Status);
        Assert.Equal(Later, step.UpdatedAt);
        Assert.Equal(Later, campaign.UpdatedAt);
    }

    [Fact]
    public void CompleteInfo_MarksStep1Complete()
    {
        var campaign = NewCampaign();

        var result = campaign.CompleteInfo(FullInfo(), Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(StepStatus.Complete, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
        Assert.Equal(1500, campaign.ExpectedCandidates);
        Assert.Equal(150, campaign.SeatsAvailable);
    }

    [Fact]
    public void CompleteInfo_DoesNotTouchTheOtherSteps()
    {
        var campaign = NewCampaign();

        campaign.CompleteInfo(FullInfo(), Later);

        Assert.All(
            campaign.Steps.Where(s => s.Step != SetupStepKey.CampaignInfo),
            s => Assert.Equal(StepStatus.NotStarted, s.Status));
    }

    [Fact]
    public void SaveInfoDraft_AfterComplete_MovesStep1BackToInProgress()
    {
        var campaign = NewCampaign();
        campaign.CompleteInfo(FullInfo(), Later);

        campaign.SaveInfoDraft(FullInfo(), Later.AddMinutes(5));

        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
    }

    [Fact]
    public void ApplyInfo_ReplacesProvincesWithExactlyTheSelectedOnes()
    {
        var campaign = NewCampaign();
        campaign.SaveInfoDraft(FullInfo(provinces: [2, 17, 3]), Later);

        campaign.SaveInfoDraft(FullInfo(provinces: [17, 21]), Later.AddMinutes(1));

        Assert.Equal(new short[] { 17, 21 }, campaign.Provinces.Select(p => p.ProvinceId).Order().ToArray());
    }

    [Fact]
    public void ApplyInfo_IgnoresDuplicateProvinceIds()
    {
        var campaign = NewCampaign();

        campaign.SaveInfoDraft(FullInfo(provinces: [17, 17, 2]), Later);

        Assert.Equal(2, campaign.Provinces.Count);
    }

    [Fact]
    public void ApplyInfo_CanRenameTheCampaign()
    {
        var campaign = NewCampaign();

        campaign.SaveInfoDraft(FullInfo("Selection 2028"), Later);

        Assert.Equal("Selection 2028", campaign.Name);
        Assert.Equal("selection 2028", campaign.NameNormalized);
    }

    [Fact]
    public void CanActivate_IsFalseWhileAnyStepIsIncomplete()
    {
        var campaign = NewCampaign();
        campaign.CompleteInfo(FullInfo(), Later);

        Assert.False(campaign.CanActivate);
    }

    [Fact]
    public void SetStepStatus_ChangesOnlyThatStep()
    {
        var campaign = NewCampaign();

        var result = campaign.SetStepStatus(SetupStepKey.EligibilityRules, StepStatus.InProgress, Later);

        Assert.True(result.IsSuccess);
        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.EligibilityRules).Status);
        Assert.Equal(Later, campaign.GetStep(SetupStepKey.EligibilityRules).UpdatedAt);
        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
        Assert.Equal(StepStatus.NotStarted, campaign.GetStep(SetupStepKey.Candidates).Status);
        Assert.Equal(Later, campaign.UpdatedAt);
    }

    [Fact]
    public void SetStepStatus_IsRejectedOnceTheCampaignIsNoLongerADraft()
    {
        var campaign = NewCampaign();
        typeof(Campaign).GetProperty(nameof(Campaign.Status))!.SetValue(campaign, CampaignStatus.Active);

        var result = campaign.SetStepStatus(SetupStepKey.EligibilityRules, StepStatus.Complete, Later);

        Assert.True(result.IsFailure);
        Assert.Equal(CampaignErrors.NotEditable, result.Error);
        Assert.Equal(StepStatus.NotStarted, campaign.GetStep(SetupStepKey.EligibilityRules).Status);
    }

    [Theory]
    [InlineData(CampaignStatus.Active)]
    [InlineData(CampaignStatus.Closed)]
    public void SaveInfoDraft_AndCompleteInfo_AreRejectedOnceTheCampaignIsNoLongerADraft(CampaignStatus status)
    {
        var campaign = NewCampaign();
        typeof(Campaign).GetProperty(nameof(Campaign.Status))!.SetValue(campaign, status);

        var draft = campaign.SaveInfoDraft(FullInfo(), Later);
        var complete = campaign.CompleteInfo(FullInfo(), Later);

        Assert.True(draft.IsFailure);
        Assert.Equal(CampaignErrors.NotEditable, draft.Error);
        Assert.True(complete.IsFailure);
        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
    }

    // ---------- Copy settings from another campaign ----------

    /// <summary>A finished-looking campaign to copy from: dates, numbers, provinces and a description.</summary>
    private static Campaign SourceCampaign()
    {
        var source = Campaign.Create("Selection 2026", "2026–2027", "Last year's description", "user-2", "Dara Manager", Now);
        source.CompleteInfo(FullInfo("Selection 2026", 2, 17), Now);
        return source;
    }

    private static Campaign BlankCampaign(string? description = null) =>
        Campaign.Create("Selection 2027", "2027–2028", description, "user-1", "Sreyneang Chea", Later);

    [Fact]
    public void CopySettingsFrom_CopiesTheNumbersAndTheDescriptionWhenDetailsAreChosen()
    {
        var campaign = BlankCampaign();

        var result = campaign.CopySettingsFrom(SourceCampaign(), details: true, provinces: false, Later);

        Assert.True(result.IsSuccess);
        Assert.Equal("A description", campaign.Description);
        Assert.Equal(1500, campaign.ExpectedCandidates);
        Assert.Equal(150, campaign.SeatsAvailable);
        Assert.Empty(campaign.Provinces);
    }

    [Fact]
    public void CopySettingsFrom_KeepsTheDescriptionTheUserTypedForTheNewCampaign()
    {
        var campaign = BlankCampaign("Typed for the new cycle");

        campaign.CopySettingsFrom(SourceCampaign(), details: true, provinces: false, Later);

        Assert.Equal("Typed for the new cycle", campaign.Description);
    }

    [Fact]
    public void CopySettingsFrom_CopiesTheProvincesWhenChosen_AndOnlyThen()
    {
        var withProvinces = BlankCampaign();
        var without = BlankCampaign();

        withProvinces.CopySettingsFrom(SourceCampaign(), details: false, provinces: true, Later);
        without.CopySettingsFrom(SourceCampaign(), details: true, provinces: false, Later);

        Assert.Equal(new short[] { 2, 17 }, withProvinces.Provinces.Select(p => p.ProvinceId).Order().ToArray());
        Assert.Null(withProvinces.ExpectedCandidates);
        Assert.Empty(without.Provinces);
    }

    [Fact]
    public void CopySettingsFrom_NeverCopiesTheNameTheYearOrTheDates()
    {
        var campaign = BlankCampaign();

        campaign.CopySettingsFrom(SourceCampaign(), details: true, provinces: true, Later);

        Assert.Equal("Selection 2027", campaign.Name);
        Assert.Equal("2027–2028", campaign.AcademicYear);
        Assert.Null(campaign.StartDate);
        Assert.Null(campaign.EndDate);
    }

    [Fact]
    public void CopySettingsFrom_DoesNotCompleteStep1_AndLeavesTheSourceAlone()
    {
        var source = SourceCampaign();
        var before = (source.Name, source.Description, source.ExpectedCandidates, source.StartDate, source.UpdatedAt, Provinces: source.Provinces.Count);
        var campaign = BlankCampaign();

        campaign.CopySettingsFrom(source, details: true, provinces: true, Later);

        Assert.Equal(StepStatus.InProgress, campaign.GetStep(SetupStepKey.CampaignInfo).Status);
        Assert.Equal(before, (source.Name, source.Description, source.ExpectedCandidates, source.StartDate, source.UpdatedAt, Provinces: source.Provinces.Count));
        Assert.Equal(Later, campaign.UpdatedAt);
    }

    [Fact]
    public void CopySettingsFrom_IsRejectedOnceTheCampaignIsNoLongerADraft()
    {
        var campaign = BlankCampaign();
        typeof(Campaign).GetProperty(nameof(Campaign.Status))!.SetValue(campaign, CampaignStatus.Active);

        var result = campaign.CopySettingsFrom(SourceCampaign(), details: true, provinces: true, Later);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
        Assert.Null(campaign.ExpectedCandidates);
        Assert.Empty(campaign.Provinces);
    }
}
