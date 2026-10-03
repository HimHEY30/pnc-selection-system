using Campaigns.Domain;
using Eligibility.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Eligibility.Tests.Support;
using SharedKernel;
using static Eligibility.Tests.Support.ServiceHarness;

namespace Eligibility.Tests.Application;

public sealed class ExamSubjectServiceTests
{
    private readonly ServiceHarness _h = new();

    private Guid NewCampaign(bool editable = true) => _h.Gateway.AddCampaign(editable).CampaignId;

    private async Task<ExamSetupDto> SetupAsync(Guid campaignId) => (await _h.Subjects.GetAsync(campaignId, default)).Value;

    private static string[] Names(ExamSetupDto setup) => setup.Subjects.Select(s => s.Name).ToArray();

    // ---------- Opening a campaign for the first time ----------

    [Fact]
    public async Task ADraftCampaign_StartsWithMathLogicAndEnglish()
    {
        var setup = await SetupAsync(NewCampaign());

        Assert.Equal(["Math", "Logic", "English"], Names(setup));
        Assert.Equal(ExamSubjects.MaxPerCampaign, setup.MaxSubjects);
        Assert.All(setup.Subjects, s => Assert.Equal(0, s.RuleCount));
    }

    [Fact]
    public async Task TheDefaults_AreSavedOnce_AndNotAuditedBecauseNoPersonChoseThem()
    {
        var id = NewCampaign();

        await SetupAsync(id);
        var savesAfterFirst = _h.Repository.SaveCount;
        await SetupAsync(id);

        Assert.Equal(1, savesAfterFirst);
        Assert.Equal(savesAfterFirst, _h.Repository.SaveCount);
        Assert.Empty(_h.Repository.Audit);
        Assert.Contains(id, _h.Repository.Setups);
    }

    [Fact]
    public async Task TheCatalogueHasEachSubject_AndTheTotalAndAverage()
    {
        var setup = await SetupAsync(NewCampaign());

        var keys = setup.Catalogue.Fields.Select(f => f.Key).ToList();
        foreach (var subject in setup.Subjects)
        {
            Assert.Contains(subject.Key, keys);
        }

        Assert.Contains(ExamSubjects.TotalKey, keys);
        Assert.Contains(ExamSubjects.AverageKey, keys);
        var math = setup.Catalogue.Fields.Single(f => f.Key == setup.Subjects[0].Key);
        Assert.Equal("Math score", math.Label);
        Assert.Equal("ExamScore", math.Derivation);
        Assert.Equal(math.Key, math.CandidateAttribute);
        Assert.Equal(["equals", "less_than", "at_most", "greater_than", "at_least", "between"], math.Operators.Select(o => o.Key));
    }

    [Fact]
    public async Task ACampaignThatIsNotADraft_IsNotSetUpWhenOpened()
    {
        var setup = await SetupAsync(NewCampaign(editable: false));

        Assert.Empty(setup.Subjects);
        Assert.DoesNotContain(setup.Catalogue.Fields, f => f.Derivation == "ExamTotal");
        Assert.Equal(0, _h.Repository.SaveCount);
    }

    [Fact]
    public async Task AnUnknownCampaign_IsNotFound()
    {
        var result = await _h.Subjects.GetAsync(Guid.NewGuid(), default);

        Assert.Equal(CampaignErrors.NotFound, result.Error);
    }

    [Fact]
    public async Task RemovingEverySubject_DoesNotBringTheDefaultsBack()
    {
        var id = NewCampaign();
        var setup = await SetupAsync(id);
        foreach (var subject in setup.Subjects)
        {
            await _h.Subjects.RemoveAsync(id, subject.Key, default);
        }

        var reopened = await SetupAsync(id);

        Assert.Empty(reopened.Subjects);
        Assert.DoesNotContain(reopened.Catalogue.Fields, f => f.Derivation == "ExamTotal");
    }

    [Fact]
    public async Task EachCampaign_HasItsOwnSubjects()
    {
        var first = NewCampaign();
        var second = NewCampaign();
        await SetupAsync(first);
        await SetupAsync(second);

        await _h.Subjects.AddAsync(first, new SubjectRequest("Physics"), default);

        Assert.Equal(["Math", "Logic", "English", "Physics"], Names(await SetupAsync(first)));
        Assert.Equal(["Math", "Logic", "English"], Names(await SetupAsync(second)));
        Assert.Empty((await SetupAsync(first)).Subjects.Select(s => s.Key).Intersect((await SetupAsync(second)).Subjects.Select(s => s.Key)));
    }

    // ---------- Add ----------

    [Fact]
    public async Task Add_PutsTheSubjectLast_AndIsInTheCatalogue()
    {
        var id = NewCampaign();

        var result = await _h.Subjects.AddAsync(id, new SubjectRequest("Physics"), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        var added = result.Value.Subjects[^1];
        Assert.Equal("Physics", added.Name);
        Assert.StartsWith("exam_", added.Key);
        Assert.Contains(result.Value.Catalogue.Fields, f => f.Key == added.Key && f.Label == "Physics score");
    }

    [Fact]
    public async Task Add_TidiesTheName()
    {
        var result = await _h.Subjects.AddAsync(NewCampaign(), new SubjectRequest("  General    knowledge "), default);

        Assert.Equal("General knowledge", result.Value.Subjects[^1].Name);
    }

    [Fact]
    public async Task Add_IsAuditedWithWhoAndWhat()
    {
        var id = NewCampaign();

        var result = await _h.Subjects.AddAsync(id, new SubjectRequest("Physics"), default);

        var line = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditEntity.Subject, line.Entity);
        Assert.Equal(AuditAction.Added, line.Action);
        Assert.Equal(id, line.CampaignId);
        Assert.Equal("Sreyneang Chea", line.ChangedByName);
        Assert.Null(line.BeforeJson);
        Assert.Equal("""{"name":"Physics"}""", line.AfterJson);
        Assert.True(ExamSubjects.TryGetId(result.Value.Subjects[^1].Key, out var subjectId));
        Assert.Equal(subjectId, line.EntityId);
    }

    [Theory]
    [InlineData(null, "Enter the subject's name.")]
    [InlineData("", "Enter the subject's name.")]
    [InlineData("    ", "Enter the subject's name.")]
    [InlineData("math", "This campaign already has a subject with this name.")]
    [InlineData("  LOGIC ", "This campaign already has a subject with this name.")]
    public async Task Add_RefusesABadName_UnderTheNameBox(string? name, string message)
    {
        var id = NewCampaign();
        await SetupAsync(id);

        var result = await _h.Subjects.AddAsync(id, new SubjectRequest(name), default);

        Assert.Equal(ErrorType.Validation, result.Error.Type);
        Assert.Equal([message], result.Error.FieldErrors!["name"]);
        Assert.Equal(["Math", "Logic", "English"], Names(await SetupAsync(id)));
    }

    [Fact]
    public async Task Add_AcceptsANameOfExactlyTheLongestLength_AndRefusesOneMore()
    {
        var id = NewCampaign();

        var longest = await _h.Subjects.AddAsync(id, new SubjectRequest(new string('A', ExamSubjects.NameMax)), default);
        var tooLong = await _h.Subjects.AddAsync(id, new SubjectRequest(new string('B', ExamSubjects.NameMax + 1)), default);

        Assert.True(longest.IsSuccess);
        Assert.Equal(["The name must be 40 characters or fewer."], tooLong.Error.FieldErrors!["name"]);
    }

    [Fact]
    public async Task Add_StopsAtTheLimit()
    {
        var id = NewCampaign();
        for (var i = 0; i < ExamSubjects.MaxPerCampaign - ExamSubjects.DefaultNames.Count; i++)
        {
            Assert.True((await _h.Subjects.AddAsync(id, new SubjectRequest($"Subject {i}"), default)).IsSuccess);
        }

        var result = await _h.Subjects.AddAsync(id, new SubjectRequest("One too many"), default);

        Assert.Equal(["A campaign can have at most 12 subjects."], result.Error.FieldErrors!["name"]);
        Assert.Equal(ExamSubjects.MaxPerCampaign, (await SetupAsync(id)).Subjects.Count);
    }

    [Fact]
    public async Task Add_IsRefusedOnACampaignThatIsNotADraft()
    {
        var result = await _h.Subjects.AddAsync(NewCampaign(editable: false), new SubjectRequest("Physics"), default);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
    }

    [Fact]
    public async Task Add_NeedsASignedInUser()
    {
        _h.User.User = null;

        var result = await _h.Subjects.AddAsync(NewCampaign(), new SubjectRequest("Physics"), default);

        Assert.Equal(EligibilityErrors.NoUser, result.Error);
    }

    [Fact]
    public async Task Add_ToAnUnknownCampaign_IsNotFound()
    {
        var result = await _h.Subjects.AddAsync(Guid.NewGuid(), new SubjectRequest("Physics"), default);

        Assert.Equal(CampaignErrors.NotFound, result.Error);
    }

    [Fact]
    public async Task Add_ReportsAConcurrentChange_WhenTheSaveLoses()
    {
        var id = NewCampaign();
        await SetupAsync(id);
        _h.Repository.FailNextSave = true;

        var result = await _h.Subjects.AddAsync(id, new SubjectRequest("Physics"), default);

        Assert.Equal(EligibilityErrors.ConcurrentEdit, result.Error);
    }

    // ---------- Rename ----------

    [Fact]
    public async Task Rename_ChangesTheLabel_ButKeepsTheKeySoRulesFollow()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];

        var result = await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest("Mathematics"), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal(math.Key, result.Value.Subjects[0].Key);
        Assert.Equal("Mathematics", result.Value.Subjects[0].Name);
        Assert.Equal("Mathematics score", result.Value.Catalogue.Fields.Single(f => f.Key == math.Key).Label);
    }

    [Fact]
    public async Task Rename_IsAuditedWithBeforeAndAfter()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];

        await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest("Mathematics"), default);

        var line = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.Updated, line.Action);
        Assert.Equal("""{"name":"Math"}""", line.BeforeJson);
        Assert.Equal("""{"name":"Mathematics"}""", line.AfterJson);
    }

    [Fact]
    public async Task Rename_ToTheSameName_ChangesAndAuditsNothing()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        var saves = _h.Repository.SaveCount;

        var result = await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest(" Math "), default);

        Assert.True(result.IsSuccess);
        Assert.Empty(_h.Repository.Audit);
        Assert.Equal(saves, _h.Repository.SaveCount);
    }

    [Fact]
    public async Task Rename_MayOnlyChangeTheCapitals()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];

        var result = await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest("MATH"), default);

        Assert.True(result.IsSuccess);
        Assert.Equal("MATH", result.Value.Subjects[0].Name);
    }

    [Fact]
    public async Task Rename_CannotTakeAnotherSubjectsName()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];

        var result = await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest("logic"), default);

        Assert.Equal(["This campaign already has a subject with this name."], result.Error.FieldErrors!["name"]);
    }

    [Fact]
    public async Task Rename_OfASubjectThatIsNotThisCampaigns_IsNotFound()
    {
        var mine = NewCampaign();
        var other = NewCampaign();
        await SetupAsync(mine);
        var theirs = (await SetupAsync(other)).Subjects[0];

        var result = await _h.Subjects.RenameAsync(mine, theirs.Key, new SubjectRequest("Stolen"), default);

        Assert.Equal(EligibilityErrors.SubjectNotFound, result.Error);
    }

    [Fact]
    public async Task Rename_OfASharedFieldOrNonsense_IsNotFound()
    {
        var id = NewCampaign();
        await SetupAsync(id);

        Assert.Equal(EligibilityErrors.SubjectNotFound, (await _h.Subjects.RenameAsync(id, "gender", new SubjectRequest("X"), default)).Error);
        Assert.Equal(EligibilityErrors.SubjectNotFound, (await _h.Subjects.RenameAsync(id, "nope", new SubjectRequest("X"), default)).Error);
    }

    [Fact]
    public async Task Rename_IsRefusedOnACampaignThatIsNotADraft()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        _h.Gateway.Campaigns[id] = _h.Gateway.Campaigns[id] with { IsEditable = false, Status = "Active" };

        var result = await _h.Subjects.RenameAsync(id, math.Key, new SubjectRequest("Mathematics"), default);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
    }

    // ---------- Remove ----------

    [Fact]
    public async Task Remove_TakesTheSubjectOut_AndKeepsTheOthersInOrder()
    {
        var id = NewCampaign();
        var logic = (await SetupAsync(id)).Subjects[1];

        var result = await _h.Subjects.RemoveAsync(id, logic.Key, default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal(["Math", "English"], Names(result.Value));
        Assert.DoesNotContain(result.Value.Catalogue.Fields, f => f.Key == logic.Key);
    }

    [Fact]
    public async Task Remove_IsAudited()
    {
        var id = NewCampaign();
        var logic = (await SetupAsync(id)).Subjects[1];

        await _h.Subjects.RemoveAsync(id, logic.Key, default);

        var line = Assert.Single(_h.Repository.Audit);
        Assert.Equal(AuditAction.Deleted, line.Action);
        Assert.Equal("""{"name":"Logic"}""", line.BeforeJson);
        Assert.Null(line.AfterJson);
    }

    [Fact]
    public async Task AfterARemoval_ANewSubjectGoesLast_WithoutClashingWithAnother()
    {
        var id = NewCampaign();
        var setup = await SetupAsync(id);
        await _h.Subjects.RemoveAsync(id, setup.Subjects[1].Key, default);

        await _h.Subjects.AddAsync(id, new SubjectRequest("Physics"), default);

        var positions = (await _h.Repository.GetSubjectsAsync(id, default)).Select(s => s.Position).ToList();
        Assert.Equal(positions.Count, positions.Distinct().Count());
        Assert.Equal(["Math", "English", "Physics"], Names(await SetupAsync(id)));
    }

    [Fact]
    public async Task Remove_IsRefusedWhileASavedRuleUsesTheSubject()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        await _h.Service.SaveDraftAsync(id, Completable(Rule(math.Key, "at_least", ["50"])), default);

        var result = await _h.Subjects.RemoveAsync(id, math.Key, default);

        Assert.Equal("eligibility.subject_in_use", result.Error.Code);
        Assert.Equal(ErrorType.Conflict, result.Error.Type);
        Assert.Equal("Math is used by 1 saved rule. Remove that rule first.", result.Error.Message);
        Assert.Equal(["Math", "Logic", "English"], Names(await SetupAsync(id)));
    }

    [Fact]
    public async Task Remove_SaysHowManyRulesUseTheSubject()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        var request = Request(null, Group(rules: [Rule(math.Key, "at_least", ["50"]), Rule(math.Key, "at_most", ["90"])]));
        await _h.Service.SaveDraftAsync(id, request, default);

        var result = await _h.Subjects.RemoveAsync(id, math.Key, default);
        var setup = await SetupAsync(id);

        Assert.Equal("Math is used by 2 saved rules. Remove those rules first.", result.Error.Message);
        Assert.Equal(2, setup.Subjects[0].RuleCount);
        Assert.Equal(0, setup.Subjects[1].RuleCount);
    }

    [Fact]
    public async Task Remove_IsAllowedOnceTheRuleIsGone()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        await _h.Service.SaveDraftAsync(id, Completable(Rule(math.Key, "at_least", ["50"])), default);
        await _h.Service.SaveDraftAsync(id, Completable(Rule("gender", "is", ["female"])), default);

        var result = await _h.Subjects.RemoveAsync(id, math.Key, default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
    }

    [Fact]
    public async Task Remove_IsRefusedIfItWouldLeaveTooFewSubjectsForASavedTotalRule()
    {
        var id = NewCampaign();
        var setup = await SetupAsync(id);
        await _h.Subjects.RemoveAsync(id, setup.Subjects[2].Key, default); // two left: Math and Logic
        await _h.Service.SaveDraftAsync(id, Completable(Rule(ExamSubjects.TotalKey, "at_least", ["100"])), default);

        var result = await _h.Subjects.RemoveAsync(id, setup.Subjects[1].Key, default);

        Assert.Equal(EligibilityErrors.SubjectNeededForTotals, result.Error);
        Assert.Equal(2, (await SetupAsync(id)).Subjects.Count);
    }

    [Fact]
    public async Task Remove_IsAllowedWhileTwoOrMoreSubjectsWouldRemainForASavedAverageRule()
    {
        var id = NewCampaign();
        var setup = await SetupAsync(id);
        await _h.Service.SaveDraftAsync(id, Completable(Rule(ExamSubjects.AverageKey, "at_least", ["60"])), default);

        var result = await _h.Subjects.RemoveAsync(id, setup.Subjects[2].Key, default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
    }

    [Fact]
    public async Task Remove_OfAnUnknownOrForeignSubject_IsNotFound()
    {
        var mine = NewCampaign();
        var other = NewCampaign();
        await SetupAsync(mine);
        var theirs = (await SetupAsync(other)).Subjects[0];

        Assert.Equal(EligibilityErrors.SubjectNotFound, (await _h.Subjects.RemoveAsync(mine, theirs.Key, default)).Error);
        Assert.Equal(EligibilityErrors.SubjectNotFound, (await _h.Subjects.RemoveAsync(mine, "gender", default)).Error);
        Assert.Equal(["Math", "Logic", "English"], Names(await SetupAsync(other)));
    }

    [Fact]
    public async Task Remove_IsRefusedOnACampaignThatIsNotADraft()
    {
        var id = NewCampaign();
        var math = (await SetupAsync(id)).Subjects[0];
        _h.Gateway.Campaigns[id] = _h.Gateway.Campaigns[id] with { IsEditable = false, Status = "Active" };

        var result = await _h.Subjects.RemoveAsync(id, math.Key, default);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
    }
}
