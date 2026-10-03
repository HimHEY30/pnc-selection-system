using Campaigns.Domain;
using Eligibility.Application;
using Eligibility.Domain.Rules;
using SharedKernel;
using static Eligibility.Tests.Support.ServiceHarness;
using Eligibility.Tests.Support;

namespace Eligibility.Tests.Application;

public sealed class EligibilityServiceTests
{
    private readonly ServiceHarness _h = new();

    private Guid NewCampaign(bool editable = true) => _h.Gateway.AddCampaign(editable).CampaignId;

    // ---------- Save draft ----------

    [Fact]
    public async Task SaveDraft_StoresTheRules_AndMarksStep2InProgress()
    {
        var id = NewCampaign();
        var request = Request(new DateOnly(2026, 11, 2), Group(name: "Basics", rules: Rule("age", "between", ["17", "23"])));

        var result = await _h.Service.SaveDraftAsync(id, request, default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        var dto = result.Value;
        Assert.Equal("Basics", Assert.Single(dto.Groups).Name);
        Assert.Equal(["17", "23"], dto.Groups[0].Rules[0].Values);
        Assert.Equal("InProgress", dto.StepStatus);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(id));
        Assert.Equal(new DateOnly(2026, 11, 2), dto.AgeReferenceDate);
        Assert.Contains(_h.Gateway.StatusCalls, c => c.Step == SetupStepKey.EligibilityRules && c.Status == StepStatus.InProgress);
    }

    [Fact]
    public async Task SaveDraft_RecordsWhoSavedAndWhen()
    {
        var id = NewCampaign();

        var dto = (await _h.Service.SaveDraftAsync(id, Completable(), default)).Value;

        Assert.Equal("Sreyneang Chea", dto.UpdatedByName);
        Assert.Equal(_h.Clock.UtcNow, dto.UpdatedAt);
    }

    [Fact]
    public async Task SaveDraft_WritesAnAuditLine_ForEachGroupAndRuleAdded()
    {
        var id = NewCampaign();
        var request = Request(null, Group(rules: [Rule("gender", "is", ["female"]), Rule("age", "at_least", ["17"])]));

        await _h.Service.SaveDraftAsync(id, request, default);

        Assert.Equal(1, _h.Repository.Audit.Count(a => a.Entity == AuditEntity.Group && a.Action == AuditAction.Added));
        Assert.Equal(2, _h.Repository.Audit.Count(a => a.Entity == AuditEntity.Rule && a.Action == AuditAction.Added));
        Assert.All(_h.Repository.Audit, a =>
        {
            Assert.Equal(id, a.CampaignId);
            Assert.Equal("user-1", a.ChangedById);
            Assert.Equal("Sreyneang Chea", a.ChangedByName);
            Assert.Equal(_h.Clock.UtcNow, a.ChangedAt);
        });
    }

    [Fact]
    public async Task SaveDraft_AllowsAnEmptySet_AndOneWithNoMandatoryRule()
    {
        var id = NewCampaign();

        Assert.True((await _h.Service.SaveDraftAsync(id, Request(), default)).IsSuccess);
        Assert.True((await _h.Service.SaveDraftAsync(id, Request(null, Group(rules: Rule("gender", "is", ["female"], type: "Optional"))), default)).IsSuccess);
    }

    [Fact]
    public async Task SavingAgainWithoutChanges_WritesNoAuditLine_AndKeepsWhoChangedItLast()
    {
        var id = NewCampaign();
        var request = Completable();
        var first = (await _h.Service.SaveDraftAsync(id, request, default)).Value;
        var auditBefore = _h.Repository.Audit.Count;
        _h.Clock.UtcNow = _h.Clock.UtcNow.AddHours(2);
        _h.User.User = new("user-2", "other", [Identity.Domain.Group.SelectionManager], "Someone Else");

        var again = await _h.Service.SaveDraftAsync(id, request, default);

        Assert.True(again.IsSuccess);
        Assert.Equal(auditBefore, _h.Repository.Audit.Count);
        Assert.Equal("Sreyneang Chea", again.Value.UpdatedByName);
        Assert.Equal(first.UpdatedAt, again.Value.UpdatedAt);
    }

    [Fact]
    public async Task EditingARule_WritesAnUpdatedLine_WithBeforeAndAfter()
    {
        var id = NewCampaign();
        var rule = Rule("age", "at_least", ["17"]);
        var group = Group(rules: rule);
        await _h.Service.SaveDraftAsync(id, Request(null, group), default);
        _h.Repository.Audit.Clear();
        _h.Clock.UtcNow = _h.Clock.UtcNow.AddHours(1);

        var edited = group with { Rules = [rule with { Values = ["18"], Message = "New." }] };
        var result = await _h.Service.SaveDraftAsync(id, Request(null, edited), default);

        Assert.True(result.IsSuccess);
        var line = Assert.Single(_h.Repository.Audit);
        Assert.Equal((AuditEntity.Rule, AuditAction.Updated, rule.Id), (line.Entity, line.Action, line.EntityId));
        Assert.Contains("17", line.BeforeJson);
        Assert.Contains("18", line.AfterJson);
        Assert.Equal(_h.Clock.UtcNow, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task DeletingARule_IsAudited_AndGone()
    {
        var id = NewCampaign();
        var keep = Rule("age", "at_least", ["17"]);
        var drop = Rule("gender", "is", ["female"]);
        var group = Group(rules: [keep, drop]);
        await _h.Service.SaveDraftAsync(id, Request(null, group), default);
        _h.Repository.Audit.Clear();

        var result = await _h.Service.SaveDraftAsync(id, Request(null, group with { Rules = [keep] }), default);

        Assert.Single(result.Value.Groups[0].Rules);
        Assert.Equal((AuditEntity.Rule, AuditAction.Deleted), (_h.Repository.Audit.Single().Entity, _h.Repository.Audit.Single().Action));
    }

    [Fact]
    public async Task SaveDraft_AfterCompleting_MovesTheStepBackToInProgress()
    {
        var id = NewCampaign();
        await _h.Service.CompleteAsync(id, Completable(), default);
        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(id));

        var result = await _h.Service.SaveDraftAsync(id, Completable(), default);

        Assert.True(result.IsSuccess);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(id));
    }

    // ---------- Save and continue ----------

    [Fact]
    public async Task Complete_MarksStep2Complete()
    {
        var id = NewCampaign();

        var result = await _h.Service.CompleteAsync(id, Completable(), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal("Complete", result.Value.StepStatus);
        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(id));
    }

    [Fact]
    public async Task Complete_WithoutAMandatoryRule_IsRefused_AndChangesNothing()
    {
        var id = NewCampaign();
        var request = Request(null, Group(rules: Rule("gender", "is", ["female"], type: "Optional")));

        var result = await _h.Service.CompleteAsync(id, request, default);

        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        Assert.Contains("rules", result.Error.FieldErrors!.Keys);
        Assert.Empty(_h.Repository.RuleSets);
        Assert.Empty(_h.Gateway.StatusCalls);
        Assert.Equal(0, _h.Repository.SaveCount);
    }

    [Fact]
    public async Task Complete_RejectsAProvinceThatIsNoLongerATarget()
    {
        var id = _h.Gateway.AddCampaign(provinces: [("2", "Battambang")]).CampaignId;
        var request = Request(null, Group(rules: Rule("province", "is", ["17"])));

        var draft = await _h.Service.SaveDraftAsync(id, request, default);
        var complete = await _h.Service.CompleteAsync(id, request, default);

        Assert.True(draft.IsSuccess);
        Assert.True(complete.IsFailure);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(id));
    }

    // ---------- Contradictions and duplicates block saving ----------

    [Fact]
    public async Task Contradictions_BlockEvenADraft()
    {
        var id = NewCampaign();
        var request = Request(new DateOnly(2026, 11, 2), Group(rules: [Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"])]));

        var result = await _h.Service.SaveDraftAsync(id, request, default);

        Assert.True(result.IsFailure);
        Assert.All(result.Error.FieldErrors!.Values, m => Assert.Contains("can never all be true", m[0]));
        Assert.Empty(_h.Repository.RuleSets);
    }

    [Fact]
    public async Task Duplicates_BlockSaving()
    {
        var id = NewCampaign();
        var request = Request(null, Group(rules: [Rule("gender", "is", ["female"]), Rule("gender", "is", ["female"])]));

        Assert.True((await _h.Service.SaveDraftAsync(id, request, default)).IsFailure);
    }

    // ---------- Who and when ----------

    [Fact]
    public async Task ACampaignThatIsNotADraft_CannotBeSaved_Or_Completed()
    {
        var id = NewCampaign(editable: false);

        var draft = await _h.Service.SaveDraftAsync(id, Completable(), default);
        var complete = await _h.Service.CompleteAsync(id, Completable(), default);

        Assert.Equal(CampaignErrors.NotEditable, draft.Error);
        Assert.Equal(CampaignErrors.NotEditable, complete.Error);
        Assert.Empty(_h.Repository.RuleSets);
        Assert.Empty(_h.Gateway.StatusCalls);
    }

    [Fact]
    public async Task AnUnknownCampaign_IsNotFound_EverywhereWhereItMatters()
    {
        var unknown = Guid.NewGuid();

        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.GetAsync(unknown, default)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.SaveDraftAsync(unknown, Completable(), default)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.CompleteAsync(unknown, Completable(), default)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.TestAsync(unknown, new TestRequest(Completable(), null), default)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.GetSuggestedAsync(unknown, default)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _h.Service.CopyRulesAsync(Guid.NewGuid(), unknown, default)).Error);
    }

    [Fact]
    public async Task WithoutASignedInUser_NothingIsSaved()
    {
        var id = NewCampaign();
        _h.User.User = null;

        var result = await _h.Service.SaveDraftAsync(id, Completable(), default);

        Assert.Equal(EligibilityErrors.NoUser, result.Error);
        Assert.Empty(_h.Repository.RuleSets);
    }

    // ---------- Concurrency ----------

    [Fact]
    public async Task ASaveBasedOnAnOldVersion_IsAConflict()
    {
        var id = NewCampaign();

        var result = await _h.Service.SaveDraftAsync(id, Completable() with { Version = 5 }, default);

        Assert.Equal(EligibilityErrors.ConcurrentEdit, result.Error);
        Assert.Empty(_h.Repository.RuleSets);
    }

    [Fact]
    public async Task AFirstSaveWithVersionZero_IsFine()
    {
        var id = NewCampaign();

        Assert.True((await _h.Service.SaveDraftAsync(id, Completable() with { Version = 0 }, default)).IsSuccess);
    }

    [Fact]
    public async Task IfTheDatabaseReportsAClash_TheStepStatusIsNotChanged()
    {
        var id = NewCampaign();
        _h.Repository.FailNextSave = true;

        var result = await _h.Service.SaveDraftAsync(id, Completable(), default);

        Assert.Equal(EligibilityErrors.ConcurrentEdit, result.Error);
        Assert.Empty(_h.Gateway.StatusCalls);
    }

    // ---------- Get ----------

    [Fact]
    public async Task Get_ForACampaignWithNoRules_ReturnsAnEmptySet_WithTheCampaignsFacts()
    {
        var id = _h.Gateway.AddCampaign(provinces: [("17", "Siem Reap"), ("2", "Battambang")]).CampaignId;

        var dto = (await _h.Service.GetAsync(id, default)).Value;

        Assert.Empty(dto.Groups);
        Assert.False(dto.IsLocked);
        Assert.Equal("Draft", dto.CampaignStatus);
        Assert.Equal("NotStarted", dto.StepStatus);
        Assert.Equal(0u, dto.Version);
        Assert.Null(dto.UpdatedAt);
        Assert.Equal(new DateOnly(2026, 11, 2), dto.CampaignStartDate);
        Assert.Equal(["17", "2"], dto.TargetProvinces.Select(p => p.Id));
    }

    [Fact]
    public async Task Get_ReturnsWhatWasSaved_InOrder()
    {
        var id = NewCampaign();
        var request = Request(new DateOnly(2026, 11, 2), Group("Any", "First", Rule("gender", "is", ["female"])), Group("All", "Second", Rule("age", "at_least", ["17"])));
        await _h.Service.SaveDraftAsync(id, request, default);

        var dto = (await _h.Service.GetAsync(id, default)).Value;

        Assert.Equal(["First", "Second"], dto.Groups.Select(g => g.Name));
        Assert.Equal(["Any", "All"], dto.Groups.Select(g => g.Logic));
        Assert.Equal("InProgress", dto.StepStatus);
    }

    [Fact]
    public async Task Get_ForANonDraftCampaign_SaysItIsLocked_ButStillReturnsTheRules()
    {
        var id = NewCampaign();
        await _h.Service.SaveDraftAsync(id, Completable(), default);
        _h.Gateway.Campaigns[id] = _h.Gateway.Campaigns[id] with { Status = "Active", IsEditable = false };

        var dto = (await _h.Service.GetAsync(id, default)).Value;

        Assert.True(dto.IsLocked);
        Assert.Equal("Active", dto.CampaignStatus);
        Assert.Single(dto.Groups[0].Rules);
    }

    // ---------- Test a sample candidate ----------

    [Fact]
    public async Task Test_ReportsEligibleAndTheResultOfEachRule()
    {
        var id = NewCampaign();
        var passing = Rule("gender", "is", ["female"]);
        var failing = Rule("highest_grade", "is", ["grade_12"], message: "Needs Grade 12.");
        var request = new TestRequest(
            Request(null, Group(rules: [passing, failing])),
            new() { ["gender"] = "female", ["highest_grade"] = "grade_9" });

        var result = (await _h.Service.TestAsync(id, request, default)).Value;

        Assert.False(result.Eligible);
        Assert.Equal(1, result.FailedMandatory);
        Assert.Equal("Passed", result.Rules.Single(r => r.RuleId == passing.Id).Outcome);
        var failed = result.Rules.Single(r => r.RuleId == failing.Id);
        Assert.Equal("Failed", failed.Outcome);
        Assert.Equal("Needs Grade 12.", failed.Message);
        Assert.False(failed.DataMissing);
    }

    [Fact]
    public async Task Test_PassesAnEligibleCandidate_AndCountsWarnings()
    {
        var id = NewCampaign();
        var request = new TestRequest(
            Request(new DateOnly(2026, 11, 2), Group(rules:
            [
                Rule("age", "between", ["17", "23"]),
                Rule("attended_info_session", "is_yes", type: "Optional"),
            ])),
            new() { ["date_of_birth"] = "2006-06-01", ["attended_info_session"] = "false" });

        var result = (await _h.Service.TestAsync(id, request, default)).Value;

        Assert.True(result.Eligible);
        Assert.Equal(1, result.Warnings);
    }

    [Fact]
    public async Task Test_FlagsMissingInformation()
    {
        var id = NewCampaign();
        var request = new TestRequest(Request(null, Group(rules: Rule("gender", "is", ["female"]))), new());

        var result = (await _h.Service.TestAsync(id, request, default)).Value;

        Assert.True(result.Rules[0].DataMissing);
        Assert.False(result.Eligible);
    }

    [Fact]
    public async Task Test_UsesTheRulesOnScreen_NotTheSavedOnes()
    {
        var id = NewCampaign();
        await _h.Service.SaveDraftAsync(id, Request(null, Group(rules: Rule("gender", "is", ["male"]))), default);
        var unsaved = new TestRequest(Request(null, Group(rules: Rule("gender", "is", ["female"]))), new() { ["gender"] = "female" });

        Assert.True((await _h.Service.TestAsync(id, unsaved, default)).Value.Eligible);
    }

    [Fact]
    public async Task Test_WorksOnALockedCampaign_AndSavesNothing()
    {
        var id = NewCampaign(editable: false);
        var request = new TestRequest(Completable(), new() { ["gender"] = "female" });

        var result = await _h.Service.TestAsync(id, request, default);

        Assert.True(result.IsSuccess);
        Assert.Empty(_h.Repository.RuleSets);
        Assert.Empty(_h.Repository.Audit);
        Assert.Empty(_h.Gateway.StatusCalls);
    }

    [Fact]
    public async Task Test_WithAMalformedRule_ReportsWhatIsWrong()
    {
        var id = NewCampaign();
        var bad = Rule("age", "at_least", ["abc"]);

        var result = await _h.Service.TestAsync(id, new TestRequest(Request(null, Group(rules: bad)), new()), default);

        Assert.Equal(ErrorType.Validation, result.Error.Type);
        Assert.Contains($"rules.{bad.Id}.values", result.Error.FieldErrors!.Keys);
    }

    [Fact]
    public async Task Test_AcceptsContradictoryRules_AndShowsTheOutcome()
    {
        var id = NewCampaign();
        var request = new TestRequest(
            Request(new DateOnly(2026, 11, 2), Group(rules: [Rule("age", "at_least", ["20"]), Rule("age", "at_most", ["18"])])),
            new() { ["date_of_birth"] = "2006-06-01" });

        var result = await _h.Service.TestAsync(id, request, default);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.Eligible);
    }

    // ---------- Suggested rules ----------

    [Fact]
    public async Task Suggested_UsesTheCampaignsProvincesAndStartDate_AndSavesNothing()
    {
        var id = _h.Gateway.AddCampaign(startDate: new DateOnly(2027, 1, 5), provinces: [("17", "Siem Reap"), ("2", "Battambang")]).CampaignId;

        var dto = (await _h.Service.GetSuggestedAsync(id, default)).Value;

        Assert.Equal(new DateOnly(2027, 1, 5), dto.AgeReferenceDate);
        var province = dto.Groups.Single().Rules.Single(r => r.FieldKey == "province");
        Assert.Equal(["17", "2"], province.Values.Order(StringComparer.Ordinal));
        Assert.Empty(_h.Repository.RuleSets);
    }

    [Fact]
    public async Task Suggested_IsAvailableOnALockedCampaign()
    {
        Assert.True((await _h.Service.GetSuggestedAsync(NewCampaign(editable: false), default)).IsSuccess);
    }

    [Fact]
    public async Task TheSuggestedRules_CanBeSavedAsTheyAre()
    {
        var id = NewCampaign();
        var suggested = (await _h.Service.GetSuggestedAsync(id, default)).Value;
        var request = new RuleSetRequest(
            suggested.AgeReferenceDate,
            suggested.Groups.Select(g => new GroupInput(g.Id, g.Name, g.Logic,
                g.Rules.Select(r => new RuleInput(r.Id, r.FieldKey, r.OperatorKey, r.Values, r.Type, r.Message, r.IsActive)).ToList())).ToList(),
            null);

        var result = await _h.Service.CompleteAsync(id, request, default);

        Assert.True(result.IsSuccess, result.IsFailure ? string.Join("; ", result.Error.FieldErrors?.Select(e => e.Key + "=" + e.Value[0]) ?? []) : "");
        Assert.Equal(4, result.Value.Groups[0].Rules.Count);
    }

    // ---------- Catalogue ----------

    [Fact]
    public async Task Catalogue_ListsEachFieldWithItsOperatorsAndOptions()
    {
        var catalogue = await _h.Service.GetCatalogueAsync(default);

        Assert.Equal(8, catalogue.Fields.Count);
        var age = catalogue.Fields.Single(f => f.Key == "age");
        Assert.Equal("Number", age.ValueType);
        Assert.Equal(["equals", "less_than", "at_most", "greater_than", "at_least", "between"], age.Operators.Select(o => o.Key));
        Assert.Equal("Two", age.Operators.Single(o => o.Key == "between").Arity);
        Assert.Equal(5, catalogue.Fields.Single(f => f.Key == "highest_grade").Options.Count);
        Assert.Equal("CampaignProvinces", catalogue.Fields.Single(f => f.Key == "province").OptionsSource);
        Assert.Equal(["is_yes", "is_no"], catalogue.Fields.Single(f => f.Key == "attended_info_session").Operators.Select(o => o.Key));
    }

    // ---------- Copy ----------

    [Fact]
    public async Task Copy_BringsTheRulesIntoTheNewCampaign_WithNewIds_AndMarksTheStepInProgress()
    {
        var source = NewCampaign();
        var target = NewCampaign();
        var original = Request(new DateOnly(2026, 11, 2), Group(name: "Basics", rules: [Rule("age", "between", ["17", "23"]), Rule("gender", "is", ["female"])]));
        var saved = (await _h.Service.SaveDraftAsync(source, original, default)).Value;
        _h.Repository.Audit.Clear();

        var result = await _h.Service.CopyRulesAsync(source, target, default);

        Assert.True(result.IsSuccess);
        var copied = (await _h.Service.GetAsync(target, default)).Value;
        Assert.Equal("Basics", copied.Groups.Single().Name);
        Assert.Equal(["age", "gender"], copied.Groups[0].Rules.Select(r => r.FieldKey));
        Assert.Equal(["17", "23"], copied.Groups[0].Rules[0].Values);
        Assert.Equal(new DateOnly(2026, 11, 2), copied.AgeReferenceDate);
        Assert.Empty(copied.Groups[0].Rules.Select(r => r.Id).Intersect(saved.Groups[0].Rules.Select(r => r.Id)));
        Assert.NotEqual(saved.Groups[0].Id, copied.Groups[0].Id);
        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(target));
        Assert.All(_h.Repository.Audit, a => Assert.Equal(target, a.CampaignId));
        Assert.Equal(4, _h.Repository.Audit.Count); // one group, two rules, and the age reference date
    }

    [Fact]
    public async Task Copy_LeavesTheSourceUntouched()
    {
        var source = NewCampaign();
        var target = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Completable(), default);
        var before = (await _h.Service.GetAsync(source, default)).Value;

        await _h.Service.CopyRulesAsync(source, target, default);

        var after = (await _h.Service.GetAsync(source, default)).Value;
        Assert.Equal(before.Groups[0].Rules[0].Id, after.Groups[0].Rules[0].Id);
        Assert.Equal(before.UpdatedAt, after.UpdatedAt);
    }

    [Fact]
    public async Task Copy_FromACampaignWithNoRules_SaysThereIsNothingToCopy()
    {
        var result = await _h.Service.CopyRulesAsync(NewCampaign(), NewCampaign(), default);

        Assert.Equal(EligibilityErrors.NothingToCopy, result.Error);
    }

    [Fact]
    public async Task Copy_IntoACampaignThatIsNotADraft_IsRefused()
    {
        var source = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Completable(), default);

        var result = await _h.Service.CopyRulesAsync(source, NewCampaign(editable: false), default);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
    }

    [Fact]
    public async Task CopiedRules_CanBeEditedAfterwards()
    {
        var source = NewCampaign();
        var target = NewCampaign();
        await _h.Service.SaveDraftAsync(source, Completable(), default);
        await _h.Service.CopyRulesAsync(source, target, default);
        var copied = (await _h.Service.GetAsync(target, default)).Value;
        var group = copied.Groups[0];
        var edited = new RuleSetRequest(
            copied.AgeReferenceDate,
            [new GroupInput(group.Id, "Renamed", group.Logic, [new RuleInput(group.Rules[0].Id, "gender", "is", ["male"], "Mandatory", "Changed.", true)])],
            copied.Version);

        var result = await _h.Service.SaveDraftAsync(target, edited, default);

        Assert.True(result.IsSuccess);
        Assert.Equal("Renamed", result.Value.Groups[0].Name);
        Assert.Equal(["male"], result.Value.Groups[0].Rules[0].Values);
    }
}
