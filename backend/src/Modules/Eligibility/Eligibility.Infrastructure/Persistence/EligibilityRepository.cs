using Eligibility.Application;
using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SharedKernel;

namespace Eligibility.Infrastructure.Persistence;

internal sealed class EligibilityRepository : IEligibilityRepository
{
    private const string UniqueViolation = "23505";
    private const string ForeignKeyViolation = "23503";

    private readonly EligibilityDbContext _db;

    public EligibilityRepository(EligibilityDbContext db)
    {
        _db = db;
    }

    public Task<FieldCatalogue> GetCatalogueAsync(CancellationToken ct) => ReadCatalogueAsync(null, ct);

    public Task<FieldCatalogue> GetCatalogueAsync(Guid campaignId, CancellationToken ct) => ReadCatalogueAsync(campaignId, ct);

    private async Task<FieldCatalogue> ReadCatalogueAsync(Guid? campaignId, CancellationToken ct)
    {
        var fields = await _db.Fields.AsNoTracking()
            .Where(f => f.CampaignId == null || f.CampaignId == campaignId)
            .Include(f => f.Options)
            .AsSplitQuery()
            .ToListAsync(ct);
        var operators = await _db.Operators.AsNoTracking().ToListAsync(ct);
        return FieldCatalogue.ForCampaign(fields.Where(f => f.CampaignId is null), fields.Where(f => f.CampaignId is not null), operators);
    }

    public Task<List<FieldDefinition>> GetSubjectsAsync(Guid campaignId, CancellationToken ct) =>
        _db.Fields.Where(f => f.CampaignId == campaignId).OrderBy(f => f.Position).ToListAsync(ct);

    public Task<bool> HasExamSetupAsync(Guid campaignId, CancellationToken ct) =>
        _db.ExamSetups.AnyAsync(s => s.CampaignId == campaignId, ct);

    public async Task<IReadOnlyDictionary<string, int>> CountRulesByFieldAsync(
        Guid campaignId, IReadOnlyCollection<string> fieldKeys, CancellationToken ct) =>
        await _db.Groups
            .Where(g => g.CampaignId == campaignId)
            .SelectMany(g => g.Rules)
            .Where(r => fieldKeys.Contains(r.FieldKey))
            .GroupBy(r => r.FieldKey)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

    public void AddExamSetup(ExamSetup setup) => _db.ExamSetups.Add(setup);

    public void AddSubject(FieldDefinition subject) => _db.Fields.Add(subject);

    public void RemoveSubject(FieldDefinition subject) => _db.Fields.Remove(subject);

    public Task<RuleSet?> GetRuleSetAsync(Guid campaignId, CancellationToken ct) =>
        _db.RuleSets
            .Include(r => r.Groups)
            .ThenInclude(g => g.Rules)
            .AsSplitQuery()
            .SingleOrDefaultAsync(r => r.CampaignId == campaignId, ct);

    public void Add(RuleSet ruleSet) => _db.RuleSets.Add(ruleSet);

    public void AddAudit(IEnumerable<EligibilityAuditEntry> entries) => _db.Audit.AddRange(entries);

    public async Task<Result> SaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await _db.SaveChangesAsync(ct);
            return Result.Success();
        }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            return Result.Failure(EligibilityErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation })
        {
            // Two people saving the first rules of a campaign at the same moment, a subject added
            // twice, or a duplicate rule that slipped past validation: either way, ask them to reload.
            // The failed changes are dropped so the caller can read again on the same context.
            _db.ChangeTracker.Clear();
            return Result.Failure(EligibilityErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: ForeignKeyViolation })
        {
            // A subject removed while a rule saved a moment ago uses it.
            _db.ChangeTracker.Clear();
            return Result.Failure(EligibilityErrors.ConcurrentEdit);
        }
    }
}
