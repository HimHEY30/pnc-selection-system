using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sessions.Application;
using Sessions.Domain;
using SharedKernel;

namespace Sessions.Infrastructure.Persistence;

public sealed class SessionRepository : ISessionRepository
{
    private const string UniqueViolation = "23505";
    private const string ForeignKeyViolation = "23503";

    private readonly SessionsDbContext _db;

    public SessionRepository(SessionsDbContext db)
    {
        _db = db;
    }

    public Task<SessionHost?> GetHostAsync(Guid id, CancellationToken ct) =>
        _db.Hosts.FirstOrDefaultAsync(h => h.Id == id, ct);

    public async Task<IReadOnlyList<SessionHost>> ListHostsAsync(HostType? type, bool includeInactive, CancellationToken ct)
    {
        var query = _db.Hosts.AsNoTracking().AsQueryable();
        if (type is { } t)
        {
            query = query.Where(h => h.Type == t);
        }

        if (!includeInactive)
        {
            query = query.Where(h => h.IsActive);
        }

        return await query.OrderBy(h => h.NameNormalized).ThenBy(h => h.Id).ToListAsync(ct);
    }

    public async Task<IReadOnlyDictionary<Guid, SessionHost>> GetHostsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ids.Count == 0
            ? new Dictionary<Guid, SessionHost>()
            : await _db.Hosts.AsNoTracking().Where(h => ids.Contains(h.Id)).ToDictionaryAsync(h => h.Id, ct);

    public void AddHost(SessionHost host) => _db.Hosts.Add(host);

    public Task<InformationSession?> GetSessionAsync(Guid campaignId, Guid sessionId, CancellationToken ct) =>
        _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.CampaignId == campaignId, ct);

    public async Task<IReadOnlyList<InformationSession>> ListSessionsAsync(Guid campaignId, CancellationToken ct) =>
        await _db.Sessions.AsNoTracking()
            .Where(s => s.CampaignId == campaignId)
            .OrderBy(s => s.Date).ThenBy(s => s.StartTime).ThenBy(s => s.Id)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<InformationSession>> ListForUserAsync(string userId, CancellationToken ct) =>
        await _db.Sessions.AsNoTracking()
            .Where(s => s.AssigneeId == userId || s.HostUserId == userId)
            .OrderBy(s => s.Date).ThenBy(s => s.StartTime).ThenBy(s => s.Id)
            .ToListAsync(ct);

    public void AddSession(InformationSession session) => _db.Sessions.Add(session);

    public Task<InformationSession?> FindClashAsync(
        Guid? exceptSessionId, DateOnly date, TimeOnly start, TimeOnly end, HostRef host, CancellationToken ct)
    {
        // Two sessions overlap when each starts before the other ends; touching ends do not overlap.
        var query = _db.Sessions.AsNoTracking().Where(s =>
            s.Status != SessionStatus.Cancelled
            && s.Date == date
            && s.StartTime < end
            && start < s.EndTime
            && (exceptSessionId == null || s.Id != exceptSessionId));

        query = host.Type == HostType.Officer
            ? query.Where(s => s.HostType == HostType.Officer && s.HostUserId == host.UserId)
            : query.Where(s => s.HostId == host.HostId);

        return query.OrderBy(s => s.StartTime).FirstOrDefaultAsync(ct);
    }

    public void AddAudit(SessionAuditEntry entry) => _db.Audit.Add(entry);

    public async Task<Result> SaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await _db.SaveChangesAsync(ct);
            return Result.Success();
        }
        catch (DbUpdateConcurrencyException)
        {
            // The failed changes are dropped so the caller can read again on the same context.
            _db.ChangeTracker.Clear();
            return Result.Failure(SessionErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation, ConstraintName: "ux_hosts_type_name" })
        {
            _db.ChangeTracker.Clear();
            return Result.Failure(SessionErrors.DuplicateHost);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation or ForeignKeyViolation })
        {
            // A campaign or host deleted while this was being saved.
            _db.ChangeTracker.Clear();
            return Result.Failure(SessionErrors.ConcurrentEdit);
        }
    }
}
