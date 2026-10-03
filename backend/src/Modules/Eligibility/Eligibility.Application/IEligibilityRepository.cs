using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using SharedKernel;

namespace Eligibility.Application;

/// <summary>Persistence port for the Eligibility module. The service never touches EF Core directly.</summary>
public interface IEligibilityRepository
{
    /// <summary>The field and operator catalogue, with options.</summary>
    Task<FieldCatalogue> GetCatalogueAsync(CancellationToken ct);

    /// <summary>A campaign's rule set, or null if none has been saved. Tracked, so it can be changed.</summary>
    Task<RuleSet?> GetRuleSetAsync(Guid campaignId, CancellationToken ct);

    void Add(RuleSet ruleSet);

    void AddAudit(IEnumerable<EligibilityAuditEntry> entries);

    /// <summary>
    /// Saves pending changes. A concurrent edit (or two people creating the first rule set at
    /// once) comes back as a failure, not an exception.
    /// </summary>
    Task<Result> SaveChangesAsync(CancellationToken ct);
}
