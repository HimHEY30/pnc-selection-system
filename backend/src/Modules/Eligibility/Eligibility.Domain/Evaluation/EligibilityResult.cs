using Eligibility.Domain.Rules;

namespace Eligibility.Domain.Evaluation;

/// <summary>What happened when one rule met one candidate.</summary>
public enum RuleOutcome
{
    Passed,
    Failed,

    /// <summary>The rule is switched off, so it was not checked.</summary>
    Skipped,
}

/// <param name="Message">The reason to show. Only set when the rule failed.</param>
/// <param name="DataMissing">
/// True when the rule failed because the candidate has no usable value for the field,
/// so the person can be told "not provided" rather than "does not match".
/// </param>
public sealed record RuleResult(
    Guid RuleId,
    Guid GroupId,
    string FieldKey,
    RuleType Type,
    RuleOutcome Outcome,
    string? Message,
    bool DataMissing);

/// <param name="Counted">False for a group with no active mandatory rules; it has no say in the result.</param>
public sealed record GroupResult(Guid GroupId, GroupLogic Logic, bool Counted, bool Passed);

/// <summary>
/// The answer for one candidate: eligible or not, and the result of every rule and group
/// so the reason for a "not eligible" can be shown.
/// </summary>
public sealed record EligibilityResult(
    bool Eligible,
    IReadOnlyList<GroupResult> Groups,
    IReadOnlyList<RuleResult> Rules)
{
    /// <summary>Optional rules the candidate failed. They never block eligibility.</summary>
    public int Warnings => Rules.Count(r => r.Type == RuleType.Optional && r.Outcome == RuleOutcome.Failed);

    /// <summary>Mandatory rules the candidate failed.</summary>
    public int FailedMandatory => Rules.Count(r => r.Type == RuleType.Mandatory && r.Outcome == RuleOutcome.Failed);
}
