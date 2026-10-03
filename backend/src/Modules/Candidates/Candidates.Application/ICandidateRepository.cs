using Candidates.Domain;
using SharedKernel;

namespace Candidates.Application;

/// <summary>What the list screen asks for. Page is 1-based.</summary>
public sealed record CandidateQuery(
    string? Search,
    string? ProvinceName,
    Guid? SessionId,
    bool? NgoSupport,
    int Page,
    int PageSize);

/// <summary>
/// Storage for candidates. Changes are collected and written together by <see cref="SaveChangesAsync"/>, so a change
/// and its audit line are saved or lost as one.
/// </summary>
public interface ICandidateRepository
{
    /// <summary>A candidate, only through its own campaign: an id from another campaign is not found.</summary>
    Task<Candidate?> GetAsync(Guid campaignId, Guid candidateId, CancellationToken ct);

    /// <summary>The campaign's candidates, newest first, filtered and paged.</summary>
    Task<PagedResult<Candidate>> ListAsync(Guid campaignId, CandidateQuery query, CancellationToken ct);

    /// <summary>The campaign's candidate with this stored phone (see <see cref="Candidate.NormalizePhone"/>), other than <paramref name="exceptCandidateId"/>.</summary>
    Task<Candidate?> FindByPhoneAsync(Guid campaignId, string phone, Guid? exceptCandidateId, CancellationToken ct);

    /// <summary>The province names that the campaign's candidates use, for the list's filter.</summary>
    Task<IReadOnlyList<string>> ListProvinceNamesAsync(Guid campaignId, CancellationToken ct);

    void Add(Candidate candidate);
    void Remove(Candidate candidate);
    void AddAudit(CandidateAuditEntry entry);

    /// <summary>
    /// Writes every pending change. Fails with a conflict when someone else changed the same candidate first, and with
    /// a duplicate-phone conflict when the unique index on (campaign, phone) is hit.
    /// </summary>
    Task<Result> SaveChangesAsync(CancellationToken ct);
}
