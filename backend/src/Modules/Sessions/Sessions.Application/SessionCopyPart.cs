using System.Text.Json.Nodes;
using Campaigns.Application;
using Campaigns.Domain;
using Sessions.Domain;
using SharedKernel;

namespace Sessions.Application;

/// <summary>
/// The information sessions as a part of a campaign that can be copied into a new one. Each session that is not
/// cancelled comes over as <see cref="SessionStatus.Unscheduled"/>: its title, format, venue or link, province and
/// notes are kept, and its date, times, person responsible and host are left empty, because those belong to the new
/// cycle and the manager schedules them afterwards. Nothing about the numbers (expected, attendance) is copied.
/// </summary>
public sealed class SessionCopyPart : ICampaignCopyPart
{
    private const string Label = "Information sessions";

    private readonly ISessionRepository _repository;
    private readonly ICampaignSetupGateway _campaigns;
    private readonly IClock _clock;

    public SessionCopyPart(ISessionRepository repository, ICampaignSetupGateway campaigns, IClock clock)
    {
        _repository = repository;
        _campaigns = campaigns;
        _clock = clock;
    }

    public string Key => CopyParts.InformationSessions;

    public async Task<CopyPartPreview> DescribeAsync(Guid sourceCampaignId, CancellationToken ct)
    {
        var count = (await CopyableAsync(sourceCampaignId, ct)).Count;
        return count == 0
            ? new CopyPartPreview(Key, Label, false, 0, "This campaign has no sessions to copy.")
            : new CopyPartPreview(Key, Label, true, count, "Copied without date, times, host or person responsible. You schedule them afterwards.");
    }

    public async Task<CopyPartResult> CopyAsync(CopyContext context, CancellationToken ct)
    {
        var target = await _campaigns.GetContextAsync(context.TargetCampaignId, ct);
        if (target is null)
        {
            return CopyPartResult.Failed(Key, CampaignErrors.NotFound.Message);
        }

        if (!target.IsEditable)
        {
            return CopyPartResult.Failed(Key, CampaignErrors.NotEditable.Message);
        }

        var source = await CopyableAsync(context.SourceCampaignId, ct);
        if (source.Count == 0)
        {
            return CopyPartResult.Failed(Key, "The campaign you are copying from has no sessions to copy.");
        }

        var targeted = target.TargetProvinces.Select(p => p.Id).ToHashSet();
        var now = _clock.UtcNow;
        var copied = 0;
        var provinceDropped = 0;
        var issues = new List<string>();

        foreach (var original in source)
        {
            // A province only makes sense if the new campaign targets it. The session is still copied, without one.
            var keepProvince = original.ProvinceId is { } id && targeted.Contains(id.ToString());
            if (original.ProvinceId is not null && !keepProvince)
            {
                provinceDropped++;
            }

            var template = new SessionTemplate(
                original.Title, original.Format, original.Venue, original.MeetingLink,
                keepProvince ? original.ProvinceId : null, original.Notes);

            var created = InformationSession.CreateUnscheduled(context.TargetCampaignId, template, context.UserSubject, context.UserName, now);
            if (created.IsFailure)
            {
                issues.Add($"\"{original.Title}\" could not be copied.");
                continue;
            }

            _repository.AddSession(created.Value);
            _repository.AddAudit(SessionAuditEntry.Record(
                context.TargetCampaignId, AuditEntity.Session, created.Value.Id, AuditAction.Created, null,
                CopiedSnapshot(created.Value, context.SourceCampaignId), context.UserSubject, context.UserName, now));
            copied++;
        }

        if (copied == 0)
        {
            return CopyPartResult.Failed(Key, "None of the sessions could be copied.");
        }

        var saved = await _repository.SaveChangesAsync(ct);
        if (saved.IsFailure)
        {
            return CopyPartResult.Failed(Key, saved.Error.Message);
        }

        // Copies still have to be scheduled, so the step is In progress, never Complete.
        var marked = await _campaigns.SetStepStatusAsync(context.TargetCampaignId, SetupStepKey.InformationSessions, StepStatus.InProgress, ct);
        if (marked.IsFailure)
        {
            issues.Add(marked.Error.Message);
        }

        if (provinceDropped > 0)
        {
            issues.Add($"{provinceDropped} session(s) had a province this campaign does not target, so it was left empty.");
        }

        return issues.Count == 0
            ? CopyPartResult.Copied(Key, copied)
            : new CopyPartResult(Key, CopyOutcomes.Partly, copied, issues);
    }

    /// <summary>The sessions worth copying, in the order the source lists them. A cancelled session was called off, so it stays behind.</summary>
    private async Task<IReadOnlyList<InformationSession>> CopyableAsync(Guid campaignId, CancellationToken ct) =>
        (await _repository.ListSessionsAsync(campaignId, ct)).Where(s => s.Status != SessionStatus.Cancelled).ToList();

    /// <summary>What the audit line keeps: the new session as it was made, and which campaign it was copied from.</summary>
    private static string CopiedSnapshot(InformationSession session, Guid sourceCampaignId) =>
        new JsonObject
        {
            ["copiedFromCampaignId"] = sourceCampaignId,
            ["session"] = JsonNode.Parse(SessionService.Snapshot(session)),
        }.ToJsonString();
}
