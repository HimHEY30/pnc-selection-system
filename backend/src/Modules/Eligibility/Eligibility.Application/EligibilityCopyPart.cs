using Campaigns.Application;
using Eligibility.Domain.Catalogue;

namespace Eligibility.Application;

/// <summary>
/// The eligibility rules (and the exam subjects they use) as a part of a campaign that can be copied into a new
/// one. A thin adapter over <see cref="IEligibilityService.CopyRulesAsync"/>, which does the copying (new ids, the
/// subjects, the audit lines, the step left In progress); this adds what the "copy from" checklist needs: counts for
/// the preview, and a result that says what the manager still has to look at.
/// </summary>
public sealed class EligibilityCopyPart : ICampaignCopyPart
{
    private const string Label = "Eligibility rules";

    private readonly IEligibilityRepository _repository;
    private readonly IEligibilityService _eligibility;
    private readonly ICampaignSetupGateway _campaigns;

    public EligibilityCopyPart(IEligibilityRepository repository, IEligibilityService eligibility, ICampaignSetupGateway campaigns)
    {
        _repository = repository;
        _eligibility = eligibility;
        _campaigns = campaigns;
    }

    public string Key => CopyParts.EligibilityRules;

    public async Task<CopyPartPreview> DescribeAsync(Guid sourceCampaignId, CancellationToken ct)
    {
        var ruleSet = await _repository.GetRuleSetAsync(sourceCampaignId, ct);
        var rules = ruleSet?.Groups.Sum(g => g.Rules.Count) ?? 0;
        if (rules == 0)
        {
            return new CopyPartPreview(Key, Label, false, 0, "This campaign has no eligibility rules.");
        }

        var subjects = (await _repository.GetSubjectsAsync(sourceCampaignId, ct)).Count;
        var note = subjects > 0 ? $"Includes the {subjects} exam subjects the rules use." : null;
        return new CopyPartPreview(Key, Label, true, rules, note);
    }

    public async Task<CopyPartResult> CopyAsync(CopyContext context, CancellationToken ct)
    {
        var copied = await _eligibility.CopyRulesAsync(context.SourceCampaignId, context.TargetCampaignId, ct);
        if (copied.IsFailure)
        {
            return CopyPartResult.Failed(Key, copied.Error.Message);
        }

        var target = await _repository.GetRuleSetAsync(context.TargetCampaignId, ct);
        var rules = target?.Groups.SelectMany(g => g.Rules).ToList() ?? [];
        var issues = await ProvinceIssuesAsync(context.TargetCampaignId, rules.Select(r => (r.FieldKey, r.Values)), ct);

        return issues.Count == 0
            ? CopyPartResult.Copied(Key, rules.Count)
            : new CopyPartResult(Key, CopyOutcomes.Partly, rules.Count, issues);
    }

    /// <summary>
    /// A rule on provinces names provinces by id. If the manager did not copy the provinces too, the new campaign may not
    /// target them, and the rule would never match. The rules are copied as they are; this says which to look at.
    /// </summary>
    private async Task<IReadOnlyList<string>> ProvinceIssuesAsync(
        Guid targetCampaignId, IEnumerable<(string FieldKey, string[] Values)> rules, CancellationToken ct)
    {
        var context = await _campaigns.GetContextAsync(targetCampaignId, ct);
        if (context is null)
        {
            return [];
        }

        var catalogue = await _repository.GetCatalogueAsync(targetCampaignId, ct);
        var provinceFields = catalogue.Fields.Where(f => f.OptionsSource == OptionsSource.CampaignProvinces).Select(f => f.Key).ToHashSet();
        var targeted = context.TargetProvinces.Select(p => p.Id).ToHashSet();

        var affected = rules.Count(r => provinceFields.Contains(r.FieldKey) && r.Values.Any(v => !targeted.Contains(v)));
        return affected == 0
            ? []
            : [$"{affected} rule(s) name provinces this campaign does not target yet. Add those provinces in Step 1, or change the rules."];
    }
}
