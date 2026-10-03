using Sessions.Domain;

namespace Sessions.Application;

/// <summary>
/// An information session as the Candidates module sees it: enough to show in a list and to check a choice, nothing
/// of the session's internals. <see cref="CanBeChosen"/> is true for a planned or done session; a cancelled session
/// was never held and an unscheduled one has no date, so neither can be where a candidate came from.
/// </summary>
public sealed record SessionChoice(Guid Id, string Title, DateOnly? Date, string Status, bool CanBeChosen);

/// <summary>A high school in the partner directory.</summary>
public sealed record SchoolChoice(Guid Id, string Name);

/// <summary>
/// What the Candidates module may ask Sessions about sessions. Published so Candidates never reads session tables or
/// entities itself.
/// </summary>
public interface ISessionChoices
{
    /// <summary>Every session of the campaign, soonest first (those without a date last), each marked with whether it can be chosen.</summary>
    Task<IReadOnlyList<SessionChoice>> ForCampaignAsync(Guid campaignId, CancellationToken ct);

    /// <summary>One session, only if it belongs to that campaign. Null otherwise, so an id from another campaign is not found.</summary>
    Task<SessionChoice?> FindAsync(Guid campaignId, Guid sessionId, CancellationToken ct);
}

/// <summary>What the Candidates module may ask Sessions about the partner directory.</summary>
public interface ISchoolDirectory
{
    /// <summary>The high schools that are switched on, by name.</summary>
    Task<IReadOnlyList<SchoolChoice>> ListActiveAsync(CancellationToken ct);

    /// <summary>One school, only if it is a high school that is switched on. A switched-off partner, an NGO or an alumnus is not found.</summary>
    Task<SchoolChoice?> FindActiveAsync(Guid hostId, CancellationToken ct);
}

public sealed class SessionChoices : ISessionChoices
{
    private readonly ISessionRepository _repository;

    public SessionChoices(ISessionRepository repository)
    {
        _repository = repository;
    }

    public async Task<IReadOnlyList<SessionChoice>> ForCampaignAsync(Guid campaignId, CancellationToken ct)
    {
        var sessions = await _repository.ListSessionsAsync(campaignId, ct);
        return sessions
            .OrderBy(s => s.Date is null)
            .ThenBy(s => s.Date)
            .ThenBy(s => s.Title, StringComparer.OrdinalIgnoreCase)
            .Select(ToChoice)
            .ToList();
    }

    public async Task<SessionChoice?> FindAsync(Guid campaignId, Guid sessionId, CancellationToken ct) =>
        await _repository.GetSessionAsync(campaignId, sessionId, ct) is { } session ? ToChoice(session) : null;

    private static SessionChoice ToChoice(InformationSession s) => new(
        s.Id, s.Title, s.Date, s.Status.ToString(), s.Status is SessionStatus.Planned or SessionStatus.Done);
}

public sealed class SchoolDirectory : ISchoolDirectory
{
    private readonly ISessionRepository _repository;

    public SchoolDirectory(ISessionRepository repository)
    {
        _repository = repository;
    }

    public async Task<IReadOnlyList<SchoolChoice>> ListActiveAsync(CancellationToken ct)
    {
        var partners = await _repository.ListHostsAsync(HostType.Partner, includeInactive: false, ct);
        return partners
            .Where(IsSchool)
            .OrderBy(h => h.NameNormalized, StringComparer.Ordinal)
            .Select(h => new SchoolChoice(h.Id, h.Name))
            .ToList();
    }

    public async Task<SchoolChoice?> FindActiveAsync(Guid hostId, CancellationToken ct) =>
        await _repository.GetHostAsync(hostId, ct) is { IsActive: true } host && IsSchool(host)
            ? new SchoolChoice(host.Id, host.Name)
            : null;

    private static bool IsSchool(SessionHost host) => host.Type == HostType.Partner && host.PartnerKind == PartnerKind.HighSchool;
}
