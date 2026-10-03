using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Evaluation;
using Eligibility.Domain.Rules;

namespace Eligibility.Application;

// ---------- Requests ----------
// Fields are nullable so a missing value becomes a message under that field instead of a 400
// from the model binder. Position is the order in the lists.

public sealed record RuleInput(
    Guid Id,
    string? FieldKey,
    string? OperatorKey,
    string[]? Values,
    string? Type,
    string? Message,
    bool IsActive);

public sealed record GroupInput(Guid Id, string? Name, string? Logic, List<RuleInput>? Rules);

/// <summary>
/// The whole rule set as the page holds it. <see cref="Version"/> is what the page last read; a
/// different value means someone else saved in between.
/// </summary>
public sealed record RuleSetRequest(DateOnly? AgeReferenceDate, List<GroupInput>? Groups, uint? Version);

public sealed record TestRequest(RuleSetRequest? RuleSet, Dictionary<string, string?>? Candidate);

// ---------- Responses ----------

public sealed record RuleDto(Guid Id, string FieldKey, string OperatorKey, string[] Values, string Type, string Message, bool IsActive);

public sealed record GroupDto(Guid Id, string Name, string Logic, List<RuleDto> Rules);

public sealed record ProvinceOptionDto(string Id, string Name);

public sealed record RuleSetDto(
    Guid CampaignId,
    string CampaignName,
    string CampaignStatus,
    DateOnly? CampaignStartDate,
    bool IsLocked,
    string StepStatus,
    DateOnly? AgeReferenceDate,
    List<GroupDto> Groups,
    List<ProvinceOptionDto> TargetProvinces,
    uint Version,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName);

/// <summary>The starter rules, not saved. The page puts them in its working copy.</summary>
public sealed record SuggestedDto(DateOnly? AgeReferenceDate, List<GroupDto> Groups);

public sealed record OperatorDto(string Key, string Label, string Arity);

public sealed record FieldOptionDto(string Key, string Label);

/// <summary>
/// One field with everything the rule builder needs, including the operators it allows.
/// <paramref name="Derivation"/> says when a field is worked out from another attribute (age comes from the
/// date of birth), and <paramref name="CandidateAttribute"/> is the attribute a sample candidate supplies.
/// </summary>
public sealed record FieldDto(
    string Key,
    string Label,
    string ValueType,
    string? OptionsSource,
    string Derivation,
    string CandidateAttribute,
    string? Unit,
    int Decimals,
    decimal? MinValue,
    decimal? MaxValue,
    List<FieldOptionDto> Options,
    List<OperatorDto> Operators);

public sealed record CatalogueDto(List<FieldDto> Fields);

public sealed record TestRuleResultDto(Guid RuleId, Guid GroupId, string FieldKey, string Type, string Outcome, string? Message, bool DataMissing);

public sealed record TestGroupResultDto(Guid GroupId, string Logic, bool Counted, bool Passed);

public sealed record TestResultDto(
    bool Eligible,
    int Warnings,
    int FailedMandatory,
    List<TestGroupResultDto> Groups,
    List<TestRuleResultDto> Rules);

// ---------- Mapping ----------

public static class Mapping
{
    public static RuleDto ToDto(RuleContent rule) =>
        new(rule.Id, rule.FieldKey, rule.OperatorKey, [.. rule.Values], rule.Type.ToString(), rule.Message, rule.IsActive);

    public static GroupDto ToDto(GroupContent group) =>
        new(group.Id, group.Name, group.Logic.ToString(), group.Rules.Select(ToDto).ToList());

    public static CatalogueDto ToDto(FieldCatalogue catalogue) => new(
        catalogue.Fields
            .OrderBy(f => f.Position)
            .Select(field => new FieldDto(
                field.Key,
                field.Label,
                field.ValueType.ToString(),
                field.OptionsSource?.ToString(),
                field.Derivation.ToString(),
                field.CandidateAttribute,
                field.Unit,
                field.Decimals,
                field.MinValue,
                field.MaxValue,
                field.Options.OrderBy(o => o.Position).Select(o => new FieldOptionDto(o.Key, o.Label)).ToList(),
                catalogue.OperatorsFor(field).Select(o => new OperatorDto(o.Key, o.Label, o.Arity.ToString())).ToList()))
            .ToList());

    public static TestResultDto ToDto(EligibilityResult result) => new(
        result.Eligible,
        result.Warnings,
        result.FailedMandatory,
        result.Groups.Select(g => new TestGroupResultDto(g.GroupId, g.Logic.ToString(), g.Counted, g.Passed)).ToList(),
        result.Rules.Select(r => new TestRuleResultDto(
            r.RuleId, r.GroupId, r.FieldKey, r.Type.ToString(), r.Outcome.ToString(), r.Message, r.DataMissing)).ToList());
}
