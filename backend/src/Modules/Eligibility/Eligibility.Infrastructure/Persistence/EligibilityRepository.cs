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

    private readonly EligibilityDbContext _db;

    public EligibilityRepository(EligibilityDbContext db)
    {
        _db = db;
    }

    public async Task<FieldCatalogue> GetCatalogueAsync(CancellationToken ct)
    {
        var fields = await _db.Fields.AsNoTracking().Include(f => f.Options).AsSplitQuery().ToListAsync(ct);
        var operators = await _db.Operators.AsNoTracking().ToListAsync(ct);
        return new FieldCatalogue(fields, operators);
    }

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
            return Result.Failure(EligibilityErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: UniqueViolation })
        {
            // Two people saving the first rules of a campaign at the same moment, or a
            // duplicate rule that slipped past validation: either way, ask them to reload.
            return Result.Failure(EligibilityErrors.ConcurrentEdit);
        }
    }
}
