using Campaigns.Application;
using Campaigns.Domain;
using Campaigns.Infrastructure.Persistence.Configurations;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SharedKernel;

namespace Campaigns.Infrastructure.Persistence;

internal sealed class CampaignRepository : ICampaignRepository
{
    private const string UniqueViolation = "23505";

    private readonly CampaignsDbContext _db;

    public CampaignRepository(CampaignsDbContext db)
    {
        _db = db;
    }

    public Task<Campaign?> GetAsync(Guid id, CancellationToken ct) =>
        _db.Campaigns
            .Include(c => c.Steps)
            .Include(c => c.Provinces)
            .AsSplitQuery()
            .SingleOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IReadOnlyList<CampaignSummaryDto>> ListSummariesAsync(CancellationToken ct)
    {
        var rows = await _db.Campaigns
            .AsNoTracking()
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Id, c.Name, c.AcademicYear, c.Status, c.CreatedAt })
            .ToListAsync(ct);

        return rows
            .Select(c => new CampaignSummaryDto(c.Id, c.Name, c.AcademicYear, c.Status.ToString(), c.CreatedAt))
            .ToList();
    }

    public Task<bool> NameExistsAsync(string normalizedName, Guid? excludingCampaignId, CancellationToken ct) =>
        _db.Campaigns.AnyAsync(
            c => c.NameNormalized == normalizedName && (excludingCampaignId == null || c.Id != excludingCampaignId),
            ct);

    public async Task<IReadOnlyList<Province>> ListProvincesAsync(CancellationToken ct) =>
        await _db.Provinces.AsNoTracking().OrderBy(p => p.NameEn).ToListAsync(ct);

    public async Task<IReadOnlySet<short>> ExistingProvinceIdsAsync(IReadOnlyCollection<short> ids, CancellationToken ct)
    {
        if (ids.Count == 0)
        {
            return new HashSet<short>();
        }

        var found = await _db.Provinces
            .Where(p => ids.Contains(p.Id))
            .Select(p => p.Id)
            .ToListAsync(ct);
        return found.ToHashSet();
    }

    public void Add(Campaign campaign) => _db.Campaigns.Add(campaign);

    public async Task<Result> SaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await _db.SaveChangesAsync(ct);
            return Result.Success();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure(CampaignErrors.ConcurrentEdit);
        }
        catch (DbUpdateException ex) when (
            ex.InnerException is PostgresException { SqlState: UniqueViolation } pg &&
            pg.ConstraintName == CampaignConfiguration.NameIndexName)
        {
            return Result.Failure(CampaignRepositoryErrors.DuplicateName);
        }
    }
}
