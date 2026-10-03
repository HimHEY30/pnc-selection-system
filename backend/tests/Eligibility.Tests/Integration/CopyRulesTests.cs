using System.Security.Claims;
using Campaigns.Domain;
using Eligibility.Application;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>
/// Copying another campaign's rules. There is no screen for it yet (the Create dialog's "copy
/// settings" option is disabled), so this is proved through the real service and database.
/// </summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class CopyRulesTests
{
    private readonly EligibilityApiFixture _fixture;
    private readonly HttpClient _manager;

    public CopyRulesTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
        _manager = fixture.CreateManagerClient("Sreyneang Chea");
    }

    /// <summary>Runs the service as a signed-in manager, the way a request would.</summary>
    private async Task<Result> CopyAsync(Guid source, Guid target, bool signedIn = true)
    {
        await using var scope = _fixture.Services.CreateAsyncScope();
        if (signedIn)
        {
            var identity = new ClaimsIdentity(
                [
                    new Claim("sub", "copier-1"),
                    new Claim("preferred_username", "copier"),
                    new Claim("name", "Copy Person"),
                    new Claim(ClaimTypes.Role, "selection-manager"),
                ],
                "Test");
            scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext =
                new DefaultHttpContext { User = new ClaimsPrincipal(identity) };
        }

        return await scope.ServiceProvider.GetRequiredService<IEligibilityService>().CopyRulesAsync(source, target, default);
    }

    private async Task<RuleSetDto> SourceWithRulesAsync(Guid campaignId)
    {
        var request = Request(ReferenceDate, null,
            Group("All", "Basics", null,
                Rule("age", "between", ["17", "23"], message: "17 to 23 only."),
                Rule("highest_grade", "is_one_of", ["grade_12", "diploma_or_higher"])),
            Group("Any", "Where from", null, Rule("province", "is", ["2"])));
        return await (await _manager.SaveDraftAsync(campaignId, request)).ReadRuleSetAsync();
    }

    [Fact]
    public async Task Copy_BringsTheRulesIntoTheNewCampaign_WithNewIds()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        var original = await SourceWithRulesAsync(source);

        var result = await CopyAsync(source, target);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        var copy = await _manager.LoadRulesAsync(target);
        Assert.Equal(["Basics", "Where from"], copy.Groups.Select(g => g.Name));
        Assert.Equal(["All", "Any"], copy.Groups.Select(g => g.Logic));
        Assert.Equal(["age", "highest_grade"], copy.Groups[0].Rules.Select(r => r.FieldKey));
        Assert.Equal(["17", "23"], copy.Groups[0].Rules[0].Values);
        Assert.Equal("17 to 23 only.", copy.Groups[0].Rules[0].Message);
        Assert.Equal(ReferenceDate, copy.AgeReferenceDate);
        Assert.Empty(copy.Groups.SelectMany(g => g.Rules).Select(r => r.Id).Intersect(original.Groups.SelectMany(g => g.Rules).Select(r => r.Id)));
        Assert.Empty(copy.Groups.Select(g => g.Id).Intersect(original.Groups.Select(g => g.Id)));
    }

    [Fact]
    public async Task Copy_MarksStep2InProgress_AndIsAuditedAgainstTheNewCampaign()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);

        await CopyAsync(source, target);

        Assert.Equal("InProgress", (await _manager.GetCampaignAsync(target)).StepStatus());
        Assert.Equal(6, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.audit_log where campaign_id = @id and changed_by_name = 'Copy Person'", ("id", target)));
    }

    [Fact]
    public async Task Copy_LeavesTheSourceUntouched()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        var original = await SourceWithRulesAsync(source);

        await CopyAsync(source, target);

        var after = await _manager.LoadRulesAsync(source);
        Assert.Equal(original.Version, after.Version);
        Assert.Equal(original.Groups.SelectMany(g => g.Rules).Select(r => r.Id), after.Groups.SelectMany(g => g.Rules).Select(r => r.Id));
    }

    [Fact]
    public async Task CopiedRules_CanBeEditedAndSavedAsUsual()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);
        await CopyAsync(source, target);
        var copy = await _manager.LoadRulesAsync(target);
        var edited = copy.ToRequest() with { Groups = [copy.ToRequest().Groups![0] with { Name = "Renamed" }] };

        var saved = await _manager.SaveDraftAsync(target, edited);

        Assert.True(saved.IsSuccessStatusCode, await saved.Content.ReadAsStringAsync());
        Assert.Equal(["Renamed"], (await _manager.LoadRulesAsync(target)).Groups.Select(g => g.Name));
    }

    [Fact]
    public async Task Copy_ReplacesWhateverTheTargetAlreadyHad()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);
        await _manager.SaveDraftAsync(target, Completable(null, Rule("marital_status", "is", ["single"])));

        await CopyAsync(source, target);

        var copy = await _manager.LoadRulesAsync(target);
        Assert.DoesNotContain(copy.Groups.SelectMany(g => g.Rules), r => r.FieldKey == "marital_status");
        Assert.Equal(3, copy.Groups.SelectMany(g => g.Rules).Count());
    }

    [Fact]
    public async Task Copy_BringsTheExamSubjects_AndPointsTheCopiedRulesAtTheNewOnes()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await _manager.AddSubjectAsync(source, "Physics");
        var sourceSubjects = (await _manager.LoadSubjectsAsync(source)).Subjects;
        var physics = sourceSubjects[^1].Key;
        var math = sourceSubjects[0].Key;
        await _manager.SaveDraftAsync(source, Request(ReferenceDate, null, Group(rules:
        [
            Rule(physics, "at_least", ["55"]),
            Rule(math, "between", ["40", "90"]),
            Rule("exam_average", "at_least", ["60"]),
        ])));

        var result = await CopyAsync(source, target);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        var targetSetup = await _manager.LoadSubjectsAsync(target);
        Assert.Equal(["Math", "Logic", "English", "Physics"], targetSetup.Subjects.Select(s => s.Name));
        Assert.Empty(targetSetup.Subjects.Select(s => s.Key).Intersect(sourceSubjects.Select(s => s.Key)));
        var copied = (await _manager.LoadRulesAsync(target)).Groups[0].Rules;
        Assert.Equal([targetSetup.Subjects[3].Key, targetSetup.Subjects[0].Key, "exam_average"], copied.Select(r => r.FieldKey));
        Assert.Equal([1, 0, 0, 1], targetSetup.Subjects.Select(s => s.RuleCount)); // Math and Physics each have a rule
        Assert.Equal(1, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.audit_log where campaign_id = @id and entity = 3 and changed_by_name = 'Copy Person'", ("id", target)));
    }

    [Fact]
    public async Task Copy_FromACampaignWithNoRules_SaysThereIsNothingToCopy()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;

        var result = await CopyAsync(source, target);

        Assert.Equal(EligibilityErrors.NothingToCopy, result.Error);
        Assert.Empty((await _manager.LoadRulesAsync(target)).Groups);
    }

    [Fact]
    public async Task Copy_IntoACampaignThatIsNotADraft_IsRefused()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);
        await _fixture.ExecuteAsync("update campaigns.campaigns set status = 1 where id = @id", ("id", target));

        var result = await CopyAsync(source, target);

        Assert.Equal(CampaignErrors.NotEditable, result.Error);
        Assert.Empty((await _manager.LoadRulesAsync(target)).Groups);
    }

    [Fact]
    public async Task Copy_WithoutASignedInUser_IsRefused()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        var target = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);

        var result = await CopyAsync(source, target, signedIn: false);

        Assert.Equal(EligibilityErrors.NoUser, result.Error);
    }

    [Fact]
    public async Task Copy_ToAnUnknownCampaign_IsNotFound()
    {
        var source = (await _manager.CreateCampaignAsync()).Id;
        await SourceWithRulesAsync(source);

        var result = await CopyAsync(source, Guid.NewGuid());

        Assert.Equal(CampaignErrors.NotFound, result.Error);
    }
}
