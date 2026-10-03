using Candidates.Application;
using Candidates.Domain;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SharedKernel;

namespace Candidates.Infrastructure.Persistence;

public sealed class CandidateRepository : ICandidateRepository
{
    private const string UniqueViolation = "23505";
    private const string ForeignKeyViolation = "23503";

    private readonly CandidatesDbContext _db;

    public CandidateRepository(CandidatesDbContext db)
    {
        _db = db;
    }

    public Task<Candidate?> GetAsync(Guid campaignId, Guid candidateId, CancellationToken ct) =>
        _db.Candidates.FirstOrDefaultAsync(c => c.Id == candidateId && c.CampaignId == campaignId, ct);

    public async Task<PagedResult<Candidate>> ListAsync(Guid campaignId, CandidateQuery query, CancellationToken ct)
    {
        var candidates = _db.Candidates.AsNoTracking().Where(c => c.CampaignId == campaignId);

        if (CandidateLimits.Clean(query.Search) is { } search)
        {
            var like = $"%{Escape(search)}%";
            var digits = SearchDigits(search);
            candidates = digits is null
                ? candidates.Where(c => EF.Functions.ILike(c.NameEn, like, "\\") || EF.Functions.ILike(c.NameKm, like, "\\"))
                : candidates.Where(c =>
                    EF.Functions.ILike(c.NameEn, like, "\\")
                    || EF.Functions.ILike(c.NameKm, like, "\\")
                    || c.Phone.Contains(digits));
        }

        if (CandidateLimits.Clean(query.ProvinceName) is { } province)
        {
            candidates = candidates.Where(c => c.ProvinceName == province);
        }

        if (query.SessionId is { } sessionId)
        {
            candidates = candidates.Where(c => c.SessionId == sessionId);
        }

        if (query.NgoSupport is { } ngo)
        {
            candidates = candidates.Where(c => c.HasNgoSupport == ngo);
        }

        var total = await candidates.CountAsync(ct);
        var page = await candidates
            .OrderByDescending(c => c.CreatedAt).ThenBy(c => c.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return new PagedResult<Candidate>(page, query.Page, query.PageSize, total);
    }

    public Task<Candidate?> FindByPhoneAsync(Guid campaignId, string phone, Guid? exceptCandidateId, CancellationToken ct) =>
        _db.Candidates.AsNoTracking().FirstOrDefaultAsync(
            c => c.CampaignId == campaignId && c.Phone == phone && (exceptCandidateId == null || c.Id != exceptCandidateId), ct);

    public async Task<IReadOnlyList<string>> ListProvinceNamesAsync(Guid campaignId, CancellationToken ct) =>
        await _db.Candidates.AsNoTracking()
            .Where(c => c.CampaignId == campaignId)
            .Select(c => c.ProvinceName)
            .Distinct()
            .OrderBy(n => n)
            .ToListAsync(ct);

    public void Add(Candidate candidate) => _db.Candidates.Add(candidate);

    public void Remove(Candidate candidate) => _db.Candidates.Remove(candidate);

    public void AddAudit(CandidateAuditEntry entry) => _db.Audit.Add(entry);

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
            return Result.Failure(CandidateErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation, ConstraintName: "ux_candidates_campaign_phone" })
        {
            _db.ChangeTracker.Clear();
            return Result.Failure(CandidateErrors.PhoneTaken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation or ForeignKeyViolation })
        {
            // A campaign or session deleted while this was being saved.
            _db.ChangeTracker.Clear();
            return Result.Failure(CandidateErrors.ConcurrentEdit);
        }
    }

    /// <summary>Makes % and _ in what a person typed mean themselves in a LIKE pattern.</summary>
    private static string Escape(string text) =>
        text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    /// <summary>
    /// The digits of a search that looks like a phone number (at least three), with +855 or 855 turned into the leading 0
    /// that phones are stored with. Null when the search is a name.
    /// </summary>
    private static string? SearchDigits(string search)
    {
        var digits = new string(search.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length < 3 || search.Any(char.IsLetter))
        {
            return null;
        }

        return search.TrimStart().StartsWith("+855", StringComparison.Ordinal) && digits.StartsWith("855", StringComparison.Ordinal)
            ? "0" + digits[3..].TrimStart('0')
            : digits;
    }
}
