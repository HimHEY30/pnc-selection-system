using Campaigns.Application;
using Campaigns.Domain;
using Sessions.Application;
using Sessions.Domain;
using Sessions.Tests.Support;

namespace Sessions.Tests.Application;

/// <summary>Copying a campaign's sessions into a new campaign, and what the copies can do until they are scheduled.</summary>
public sealed class SessionCopyPartTests
{
    private readonly SessionHarness _h = new();
    private readonly SessionCopyPart _part;

    public SessionCopyPartTests()
    {
        _part = new SessionCopyPart(_h.Repository, _h.Gateway, _h.Clock);
        _h.SignInAs("manager-1", "Dara Manager", Identity.Domain.Group.SelectionManager);
    }

    private Guid NewCampaign(params (string Id, string Name)[] provinces) =>
        provinces.Length == 0 ? _h.AddCampaign().CampaignId : _h.Gateway.AddCampaign("Draft", provinces).CampaignId;

    private static CopyContext Context(Guid source, Guid target) => new(source, target, "copier-1", "Copy Person");

    private IEnumerable<InformationSession> SessionsOf(Guid campaignId) => _h.Repository.Sessions.Values.Where(s => s.CampaignId == campaignId);

    private async Task<SessionDto> SourceSessionAsync(string title = "Open day at Kampong Cham High School", string date = "2027-03-20", short? province = null, string? notes = null) =>
        await _h.CreateAsync(SessionHarness.Request(title: title, date: DateOnly.Parse(date), province: province, notes: notes));

    // ---------- Preview ----------

    [Fact]
    public async Task Describe_CountsTheSessionsThatAreNotCancelled()
    {
        await SourceSessionAsync("One");
        await SourceSessionAsync("Two", "2027-03-21");
        var cancelled = await SourceSessionAsync("Three", "2027-03-22");
        await _h.Service.CancelAsync(_h.CampaignId, cancelled.Id, new CancelRequest("Rain"), default);

        var preview = await _part.DescribeAsync(_h.CampaignId, default);

        Assert.Equal(CopyParts.InformationSessions, preview.Key);
        Assert.True(preview.Available);
        Assert.Equal(2, preview.Count);
        Assert.Contains("schedule them afterwards", preview.Note);
    }

    [Fact]
    public async Task Describe_SaysSoWhenThereIsNothingToCopy()
    {
        var preview = await _part.DescribeAsync(_h.CampaignId, default);

        Assert.False(preview.Available);
        Assert.Equal(0, preview.Count);
    }

    // ---------- Copy ----------

    [Fact]
    public async Task Copy_MakesUnscheduledSessionsThatKeepTheTitleVenueAndNotes_AndNothingAboutWhenOrWho()
    {
        await SourceSessionAsync(notes: "Bring the banner.");
        var target = NewCampaign();

        var result = await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(new CopyPartResult(CopyParts.InformationSessions, CopyOutcomes.Copied, 1, []), result);
        var copy = Assert.Single(SessionsOf(target));
        Assert.Equal(SessionStatus.Unscheduled, copy.Status);
        Assert.Equal("Open day at Kampong Cham High School", copy.Title);
        Assert.Equal("School hall", copy.Venue);
        Assert.Equal("Bring the banner.", copy.Notes);
        Assert.Null(copy.Date);
        Assert.Null(copy.StartTime);
        Assert.Null(copy.AssigneeId);
        Assert.Null(copy.HostType);
        Assert.Equal("copier-1", copy.CreatedById);
        Assert.Equal("Copy Person", copy.CreatedByName);
    }

    [Fact]
    public async Task Copy_NeverCopiesTheNumbers()
    {
        var source = await SourceSessionAsync();
        await _h.Service.SetExpectedAsync(_h.CampaignId, source.Id, new ExpectedRequest(60), default);
        var target = NewCampaign();

        await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Null(Assert.Single(SessionsOf(target)).ExpectedCandidates);
    }

    [Fact]
    public async Task Copy_LeavesCancelledSessionsBehind_AndTheSourceUntouched()
    {
        var kept = await SourceSessionAsync("Kept");
        var cancelled = await SourceSessionAsync("Called off", "2027-03-21");
        await _h.Service.CancelAsync(_h.CampaignId, cancelled.Id, new CancelRequest("Rain"), default);
        var before = SessionsOf(_h.CampaignId).Select(s => (s.Id, s.Status, s.UpdatedAt)).ToList();
        var target = NewCampaign();

        await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(["Kept"], SessionsOf(target).Select(s => s.Title));
        Assert.Equal(before, SessionsOf(_h.CampaignId).Select(s => (s.Id, s.Status, s.UpdatedAt)).ToList());
        Assert.NotEqual(kept.Id, SessionsOf(target).Single().Id);
    }

    [Fact]
    public async Task Copy_LeavesTheStepInProgress_NeverComplete()
    {
        await SourceSessionAsync();
        var target = NewCampaign();

        await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(target));
    }

    [Fact]
    public async Task Copy_WritesAnAuditLinePerSession_SayingWhereItWasCopiedFrom()
    {
        await SourceSessionAsync();
        var target = NewCampaign();
        _h.Repository.Audit.Clear();

        await _part.CopyAsync(Context(_h.CampaignId, target), default);

        var line = Assert.Single(_h.Repository.Audit);
        Assert.Equal(target, line.CampaignId);
        Assert.Equal(AuditAction.Created, line.Action);
        Assert.Equal("copier-1", line.ChangedById);
        Assert.Contains(_h.CampaignId.ToString(), line.AfterJson);
        Assert.Contains("copiedFromCampaignId", line.AfterJson);
    }

    [Fact]
    public async Task Copy_KeepsAProvinceTheNewCampaignTargets()
    {
        await SourceSessionAsync(province: 17);
        var target = NewCampaign(("17", "Siem Reap"));

        var result = await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(CopyOutcomes.Copied, result.Outcome);
        Assert.Equal((short)17, Assert.Single(SessionsOf(target)).ProvinceId);
    }

    [Fact]
    public async Task Copy_LeavesAProvinceTheNewCampaignDoesNotTargetEmpty_AndSaysSo()
    {
        await SourceSessionAsync(province: 17);
        var target = NewCampaign(("2", "Battambang"));

        var result = await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(CopyOutcomes.Partly, result.Outcome);
        Assert.Equal(1, result.Count);
        Assert.Contains("1 session(s) had a province", Assert.Single(result.Issues));
        Assert.Null(Assert.Single(SessionsOf(target)).ProvinceId);
    }

    [Fact]
    public async Task Copy_FromACampaignWithNoSessions_IsReportedAsFailed()
    {
        var result = await _part.CopyAsync(Context(_h.CampaignId, NewCampaign()), default);

        Assert.Equal(CopyOutcomes.Failed, result.Outcome);
        Assert.Equal(0, result.Count);
    }

    [Fact]
    public async Task Copy_IntoACampaignThatIsNotADraft_IsReportedAsFailed_AndCopiesNothing()
    {
        await SourceSessionAsync();
        var target = _h.AddCampaign("Active").CampaignId;

        var result = await _part.CopyAsync(Context(_h.CampaignId, target), default);

        Assert.Equal(CopyOutcomes.Failed, result.Outcome);
        Assert.Empty(SessionsOf(target));
    }

    // ---------- What the copies can do ----------

    private async Task<(Guid Target, SessionDto Copy)> CopiedAsync()
    {
        await SourceSessionAsync();
        var target = NewCampaign();
        await _part.CopyAsync(Context(_h.CampaignId, target), default);
        var list = (await _h.Service.ListAsync(target, default)).Value;
        return (target, Assert.Single(list.Sessions));
    }

    [Fact]
    public async Task TheList_ShowsACopyWithNoDateTimesPersonOrHost_AndCountsItAsUnscheduled()
    {
        var (target, copy) = await CopiedAsync();

        var list = (await _h.Service.ListAsync(target, default)).Value;

        Assert.Equal("Unscheduled", copy.Status);
        Assert.Null(copy.Date);
        Assert.Null(copy.StartTime);
        Assert.Null(copy.EndTime);
        Assert.Null(copy.Assignee);
        Assert.Null(copy.Host);
        Assert.Equal(1, list.Summary.Unscheduled);
        Assert.Equal(1, list.Summary.Total);
        Assert.Equal(0, list.Summary.Planned);
    }

    [Fact]
    public async Task SavingTheFormOfACopy_SchedulesIt_ThenItIsPlanned_AndTheStepIsComplete()
    {
        var (target, copy) = await CopiedAsync();

        var result = await _h.Service.UpdateAsync(target, copy.Id, SessionHarness.Request(date: new DateOnly(2028, 3, 18)), default);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal("Planned", result.Value.Status);
        Assert.Equal(new DateOnly(2028, 3, 18), result.Value.Date);
        Assert.Equal("09:00", result.Value.StartTime);
        Assert.Equal("manager-1", result.Value.Assignee!.Id);
        Assert.Equal("Officer", result.Value.Host!.Type);
        Assert.Equal(StepStatus.Complete, _h.Gateway.StepStatusOf(target));
    }

    [Fact]
    public async Task SchedulingACopy_NeedsEverythingAtOnce_AndStaysUnscheduledWhenSomethingIsMissing()
    {
        var (target, copy) = await CopiedAsync();
        var incomplete = SessionHarness.Request(date: new DateOnly(2028, 3, 18)) with { HostType = null, HostUserId = null };

        var result = await _h.Service.UpdateAsync(target, copy.Id, incomplete, default);

        Assert.True(result.IsFailure);
        Assert.Contains("hostType", result.Error.FieldErrors!.Keys);
        Assert.Equal(SessionStatus.Unscheduled, SessionsOf(target).Single().Status);
    }

    [Fact]
    public async Task SchedulingACopy_StillRefusesAHostWhoIsBusyAtThatTime()
    {
        var (target, copy) = await CopiedAsync();
        await _h.CreateAsync(SessionHarness.Request(date: new DateOnly(2028, 3, 18), start: "09:00", end: "11:00"));

        var result = await _h.Service.UpdateAsync(target, copy.Id, SessionHarness.Request(date: new DateOnly(2028, 3, 18), start: "10:00", end: "12:00"), default);

        Assert.Equal("sessions.host_busy", result.Error.Code);
    }

    [Fact]
    public async Task ACopyCanBeCancelledBeforeItIsScheduled_AndKeepsNoDate()
    {
        var (target, copy) = await CopiedAsync();

        var result = await _h.Service.CancelAsync(target, copy.Id, new CancelRequest("Not running this year"), default);

        Assert.True(result.IsSuccess);
        Assert.Equal("Cancelled", result.Value.Status);
        Assert.Null(result.Value.Date);
    }

    [Fact]
    public async Task NumbersCannotBeEnteredOnACopyThatIsNotScheduled_ButTheExpectedNumberCan()
    {
        var (target, copy) = await CopiedAsync();

        var attendance = await _h.Service.RecordAttendanceAsync(target, copy.Id, new AttendanceRequest(5, 5), default);
        var expected = await _h.Service.SetExpectedAsync(target, copy.Id, new ExpectedRequest(30), default);

        Assert.Equal(SessionErrors.NotScheduled, attendance.Error);
        Assert.True(expected.IsSuccess);
        Assert.Equal(30, expected.Value.ExpectedCandidates);
    }

    [Fact]
    public async Task ACopyIsNotOnAnyonesMySessionsListUntilItHasSomeoneResponsible()
    {
        var (_, _) = await CopiedAsync();

        var mine = (await _h.Service.ListMineAsync(default)).Value;

        Assert.DoesNotContain(mine, m => m.Session.Status == "Unscheduled");
    }

    [Fact]
    public async Task TheStepStaysInProgressWhileOnlyCopiesAndCancelledSessionsExist()
    {
        var (target, copy) = await CopiedAsync();

        await _h.Service.CancelAsync(target, copy.Id, new CancelRequest("Not running"), default);

        Assert.Equal(StepStatus.InProgress, _h.Gateway.StepStatusOf(target));
    }
}
