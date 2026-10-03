using Campaigns.Domain;
using SharedKernel;

namespace Campaigns.Application;

/// <summary>
/// Persistence port for the Campaigns module. The service depends on this, never
/// on EF Core, so business rules stay testable and storage stays replaceable.
/// </summary>
public interface ICampaignRepository
{
    /// <summary>Loads a campaign with its steps and provinces, tracked for update.</summary>
    Task<Campaign?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<CampaignSummaryDto>> ListSummariesAsync(CancellationToken ct);

    /// <param name="normalizedName">Result of <see cref="Campaign.Normalize"/>.</param>
    Task<bool> NameExistsAsync(string normalizedName, Guid? excludingCampaignId, CancellationToken ct);

    Task<IReadOnlyList<Province>> ListProvincesAsync(CancellationToken ct);

    /// <summary>Returns which of the given province ids exist.</summary>
    Task<IReadOnlySet<short>> ExistingProvinceIdsAsync(IReadOnlyCollection<short> ids, CancellationToken ct);

    void Add(Campaign campaign);

    /// <summary>
    /// Saves pending changes. Returns a failure (not an exception) for the two
    /// races the service cannot rule out beforehand: a duplicate name and a
    /// concurrent edit.
    /// </summary>
    Task<Result> SaveChangesAsync(CancellationToken ct);
}
