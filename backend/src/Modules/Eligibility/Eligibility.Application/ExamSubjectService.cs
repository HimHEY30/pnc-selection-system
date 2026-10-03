using System.Text.Json;
using Campaigns.Application;
using Campaigns.Domain;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Identity.Application;
using Identity.Domain;
using SharedKernel;

namespace Eligibility.Application;

public interface IExamSubjectService
{
    /// <summary>The campaign's subjects and resulting catalogue. A draft campaign that was never set up gets Math, Logic and English first.</summary>
    Task<Result<ExamSetupDto>> GetAsync(Guid campaignId, CancellationToken ct);

    Task<Result<ExamSetupDto>> AddAsync(Guid campaignId, SubjectRequest request, CancellationToken ct);

    Task<Result<ExamSetupDto>> RenameAsync(Guid campaignId, string subjectKey, SubjectRequest request, CancellationToken ct);

    Task<Result<ExamSetupDto>> RemoveAsync(Guid campaignId, string subjectKey, CancellationToken ct);

    /// <summary>
    /// Gives <paramref name="target"/> the subjects of another campaign (a subject with the same name is reused, the
    /// rest are added) and says which field key in the target stands for each field key of the source. Changes are
    /// left pending, so the caller saves them together with whatever else it is doing.
    /// </summary>
    Task<Result<IReadOnlyDictionary<string, string>>> CopySubjectsAsync(
        Guid sourceCampaignId, CampaignSetupContext target, AuthenticatedUser user, CancellationToken ct);
}

/// <summary>
/// Exam subjects of a campaign: add, rename, remove. Each change is saved at once (they are not part of the
/// rule set's whole-set save) and audited. Changing subjects works only on a draft campaign, like rules.
/// </summary>
public sealed class ExamSubjectService : IExamSubjectService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IEligibilityRepository _repository;
    private readonly ICampaignSetupGateway _campaigns;
    private readonly ICurrentUserService _currentUser;
    private readonly IClock _clock;

    public ExamSubjectService(
        IEligibilityRepository repository,
        ICampaignSetupGateway campaigns,
        ICurrentUserService currentUser,
        IClock clock)
    {
        _repository = repository;
        _campaigns = campaigns;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<Result<ExamSetupDto>> GetAsync(Guid campaignId, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<ExamSetupDto>(CampaignErrors.NotFound);
        }

        await EnsureSetUpAsync(context, ct);
        return await BuildAsync(campaignId, ct);
    }

    public async Task<Result<ExamSetupDto>> AddAsync(Guid campaignId, SubjectRequest request, CancellationToken ct)
    {
        var scope = await BeginEditAsync(campaignId, ct);
        if (scope.IsFailure)
        {
            return Result.Failure<ExamSetupDto>(scope.Error);
        }

        var subjects = await _repository.GetSubjectsAsync(campaignId, ct);
        var name = ExamSubjects.CleanName(request.Name);
        if (CheckName(name, subjects) is { } problem)
        {
            return Result.Failure<ExamSetupDto>(problem);
        }

        if (subjects.Count >= ExamSubjects.MaxPerCampaign)
        {
            return Result.Failure<ExamSetupDto>(
                EligibilityErrors.InvalidSubject($"A campaign can have at most {ExamSubjects.MaxPerCampaign} subjects."));
        }

        var subject = ExamSubjects.CreateField(Guid.NewGuid(), campaignId, name, ExamSubjects.FirstPosition + subjects.Count);
        _repository.AddSubject(subject);
        AddAudit(campaignId, subject, AuditAction.Added, null, NameJson(name), scope.Value.User);

        return await SaveAndBuildAsync(campaignId, ct);
    }

    public async Task<Result<ExamSetupDto>> RenameAsync(Guid campaignId, string subjectKey, SubjectRequest request, CancellationToken ct)
    {
        var scope = await BeginEditAsync(campaignId, ct);
        if (scope.IsFailure)
        {
            return Result.Failure<ExamSetupDto>(scope.Error);
        }

        var subjects = await _repository.GetSubjectsAsync(campaignId, ct);
        var subject = subjects.FirstOrDefault(s => s.Key == subjectKey);
        if (subject is null)
        {
            return Result.Failure<ExamSetupDto>(EligibilityErrors.SubjectNotFound);
        }

        var name = ExamSubjects.CleanName(request.Name);
        if (CheckName(name, subjects.Where(s => s != subject)) is { } problem)
        {
            return Result.Failure<ExamSetupDto>(problem);
        }

        if (name == subject.SubjectName)
        {
            return await BuildAsync(campaignId, ct);
        }

        var before = NameJson(subject.SubjectName!);
        subject.RenameSubject(name);
        AddAudit(campaignId, subject, AuditAction.Updated, before, NameJson(name), scope.Value.User);

        return await SaveAndBuildAsync(campaignId, ct);
    }

    public async Task<Result<ExamSetupDto>> RemoveAsync(Guid campaignId, string subjectKey, CancellationToken ct)
    {
        var scope = await BeginEditAsync(campaignId, ct);
        if (scope.IsFailure)
        {
            return Result.Failure<ExamSetupDto>(scope.Error);
        }

        var subjects = await _repository.GetSubjectsAsync(campaignId, ct);
        var subject = subjects.FirstOrDefault(s => s.Key == subjectKey);
        if (subject is null)
        {
            return Result.Failure<ExamSetupDto>(EligibilityErrors.SubjectNotFound);
        }

        var uses = await _repository.CountRulesByFieldAsync(campaignId, [subject.Key, ExamSubjects.TotalKey, ExamSubjects.AverageKey], ct);
        if (uses.GetValueOrDefault(subject.Key) is > 0 and var count)
        {
            return Result.Failure<ExamSetupDto>(EligibilityErrors.SubjectInUse(subject.SubjectName!, count));
        }

        var usesTotals = uses.GetValueOrDefault(ExamSubjects.TotalKey) + uses.GetValueOrDefault(ExamSubjects.AverageKey) > 0;
        if (usesTotals && subjects.Count - 1 < ExamSubjects.MinForTotals)
        {
            return Result.Failure<ExamSetupDto>(EligibilityErrors.SubjectNeededForTotals);
        }

        _repository.RemoveSubject(subject);
        subjects.Remove(subject);
        Renumber(subjects);
        AddAudit(campaignId, subject, AuditAction.Deleted, NameJson(subject.SubjectName!), null, scope.Value.User);

        return await SaveAndBuildAsync(campaignId, ct);
    }

    public async Task<Result<IReadOnlyDictionary<string, string>>> CopySubjectsAsync(
        Guid sourceCampaignId, CampaignSetupContext target, AuthenticatedUser user, CancellationToken ct)
    {
        await EnsureSetUpAsync(target, ct);

        var source = await _repository.GetSubjectsAsync(sourceCampaignId, ct);
        var current = await _repository.GetSubjectsAsync(target.CampaignId, ct);
        var keys = new Dictionary<string, string>();

        foreach (var subject in source)
        {
            var existing = current.FirstOrDefault(s => SameName(s.SubjectName, subject.SubjectName));
            if (existing is null)
            {
                if (current.Count >= ExamSubjects.MaxPerCampaign)
                {
                    return Result.Failure<IReadOnlyDictionary<string, string>>(
                        EligibilityErrors.InvalidSubject($"A campaign can have at most {ExamSubjects.MaxPerCampaign} subjects."));
                }

                existing = ExamSubjects.CreateField(
                    Guid.NewGuid(), target.CampaignId, subject.SubjectName!, ExamSubjects.FirstPosition + current.Count);
                current.Add(existing);
                _repository.AddSubject(existing);
                AddAudit(target.CampaignId, existing, AuditAction.Added, null, NameJson(existing.SubjectName!), user);
            }

            keys[subject.Key] = existing.Key;
        }

        return keys;
    }

    // ---------- Helpers ----------

    private sealed record EditScope(CampaignSetupContext Context, AuthenticatedUser User);

    /// <summary>Who is editing which campaign, once it is known they may: signed in, campaign exists and is a draft.</summary>
    private async Task<Result<EditScope>> BeginEditAsync(Guid campaignId, CancellationToken ct)
    {
        var user = _currentUser.User;
        if (user is null)
        {
            return Result.Failure<EditScope>(EligibilityErrors.NoUser);
        }

        var context = await _campaigns.GetContextAsync(campaignId, ct);
        if (context is null)
        {
            return Result.Failure<EditScope>(CampaignErrors.NotFound);
        }

        if (!context.IsEditable)
        {
            return Result.Failure<EditScope>(CampaignErrors.NotEditable);
        }

        await EnsureSetUpAsync(context, ct);
        return new EditScope(context, user);
    }

    /// <summary>
    /// The first time a draft campaign's subjects are needed, adds Math, Logic and English and notes that it
    /// was done. This is the system's doing, not a person's, so it is not in the audit log. If two people open
    /// the page at the same moment one save loses; the other has already set it up, so that is fine.
    /// </summary>
    private async Task EnsureSetUpAsync(CampaignSetupContext context, CancellationToken ct)
    {
        if (!context.IsEditable || await _repository.HasExamSetupAsync(context.CampaignId, ct))
        {
            return;
        }

        _repository.AddExamSetup(ExamSetup.Create(context.CampaignId, _clock.UtcNow));
        for (var i = 0; i < ExamSubjects.DefaultNames.Count; i++)
        {
            _repository.AddSubject(ExamSubjects.CreateField(
                Guid.NewGuid(), context.CampaignId, ExamSubjects.DefaultNames[i], ExamSubjects.FirstPosition + i));
        }

        await _repository.SaveChangesAsync(ct);
    }

    private static Error? CheckName(string name, IEnumerable<FieldDefinition> others)
    {
        if (name.Length == 0)
        {
            return EligibilityErrors.InvalidSubject("Enter the subject's name.");
        }

        if (name.Length > ExamSubjects.NameMax)
        {
            return EligibilityErrors.InvalidSubject($"The name must be {ExamSubjects.NameMax} characters or fewer.");
        }

        return others.Any(s => SameName(s.SubjectName, name))
            ? EligibilityErrors.InvalidSubject("This campaign already has a subject with this name.")
            : null;
    }

    private static bool SameName(string? a, string? b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    /// <summary>Keeps the subjects numbered one after another, so their order is exactly the list's order.</summary>
    private static void Renumber(IReadOnlyList<FieldDefinition> subjects)
    {
        for (var i = 0; i < subjects.Count; i++)
        {
            subjects[i].Place(ExamSubjects.FirstPosition + i);
        }
    }

    private void AddAudit(Guid campaignId, FieldDefinition subject, AuditAction action, string? before, string? after, AuthenticatedUser user)
    {
        ExamSubjects.TryGetId(subject.Key, out var subjectId);
        var change = new AuditChange(AuditEntity.Subject, subjectId, action, before, after);
        _repository.AddAudit([EligibilityAuditEntry.From(campaignId, change, user.Subject, user.DisplayName, _clock.UtcNow)]);
    }

    private static string NameJson(string name) => JsonSerializer.Serialize(new { name }, Json);

    private async Task<Result<ExamSetupDto>> SaveAndBuildAsync(Guid campaignId, CancellationToken ct)
    {
        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure ? Result.Failure<ExamSetupDto>(saved.Error) : await BuildAsync(campaignId, ct);
    }

    private async Task<Result<ExamSetupDto>> BuildAsync(Guid campaignId, CancellationToken ct)
    {
        var subjects = await _repository.GetSubjectsAsync(campaignId, ct);
        var uses = await _repository.CountRulesByFieldAsync(campaignId, subjects.Select(s => s.Key).ToList(), ct);
        var catalogue = await _repository.GetCatalogueAsync(campaignId, ct);

        return new ExamSetupDto(
            subjects.Select(s => new SubjectDto(s.Key, s.SubjectName!, uses.GetValueOrDefault(s.Key))).ToList(),
            ExamSubjects.MaxPerCampaign,
            Mapping.ToDto(catalogue));
    }
}
