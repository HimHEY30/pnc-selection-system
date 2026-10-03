using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using SharedKernel;

namespace Eligibility.Application;

/// <summary>Persistence port for the Eligibility module. The service never touches EF Core directly.</summary>
public interface IEligibilityRepository
{
    /// <summary>The shared field and operator catalogue, with options, and no campaign's exam subjects.</summary>
    Task<FieldCatalogue> GetCatalogueAsync(CancellationToken ct);

    /// <summary>The catalogue one campaign sees: the shared fields plus that campaign's exam subjects.</summary>
    Task<FieldCatalogue> GetCatalogueAsync(Guid campaignId, CancellationToken ct);

    /// <summary>A campaign's exam subject fields in the order they were added. Tracked, so they can be changed.</summary>
    Task<List<FieldDefinition>> GetSubjectsAsync(Guid campaignId, CancellationToken ct);

    /// <summary>Whether the campaign's exam subjects were set up (the defaults added) before.</summary>
    Task<bool> HasExamSetupAsync(Guid campaignId, CancellationToken ct);

    /// <summary>How many saved rules of this campaign use each of the given fields. Fields no rule uses are left out.</summary>
    Task<IReadOnlyDictionary<string, int>> CountRulesByFieldAsync(Guid campaignId, IReadOnlyCollection<string> fieldKeys, CancellationToken ct);

    void AddExamSetup(ExamSetup setup);

    void AddSubject(FieldDefinition subject);

    void RemoveSubject(FieldDefinition subject);

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
