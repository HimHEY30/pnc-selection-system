using Sessions.Domain;
using SharedKernel;

namespace Sessions.Application;

/// <summary>
/// Storage for sessions and hosts. Changes are collected and written together by
/// <see cref="SaveChangesAsync"/>, so a change and its audit line are saved or lost as one.
/// </summary>
public interface ISessionRepository
{
    // Hosts
    Task<SessionHost?> GetHostAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<SessionHost>> ListHostsAsync(HostType? type, bool includeInactive, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, SessionHost>> GetHostsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);
    void AddHost(SessionHost host);

    // Sessions
    Task<InformationSession?> GetSessionAsync(Guid campaignId, Guid sessionId, CancellationToken ct);
    Task<IReadOnlyList<InformationSession>> ListSessionsAsync(Guid campaignId, CancellationToken ct);

    /// <summary>Sessions that a user is responsible for or runs, in every campaign, soonest first.</summary>
    Task<IReadOnlyList<InformationSession>> ListForUserAsync(string userId, CancellationToken ct);

    void AddSession(InformationSession session);

    /// <summary>
    /// A session (not cancelled, other than <paramref name="exceptSessionId"/>) that the same host already runs at an
    /// overlapping time on that date, in any campaign.
    /// </summary>
    Task<InformationSession?> FindClashAsync(
        Guid? exceptSessionId, DateOnly date, TimeOnly start, TimeOnly end, HostRef host, CancellationToken ct);

    // Audit
    void AddAudit(SessionAuditEntry entry);

    /// <summary>Writes every pending change. Fails with a conflict when someone else changed the same thing first.</summary>
    Task<Result> SaveChangesAsync(CancellationToken ct);
}
