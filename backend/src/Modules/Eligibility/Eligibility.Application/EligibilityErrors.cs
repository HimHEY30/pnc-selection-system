using SharedKernel;

namespace Eligibility.Application;

public static class EligibilityErrors
{
    public static Error Invalid(IReadOnlyDictionary<string, string[]> fieldErrors) =>
        Error.Validation("eligibility.invalid", "Some rules need your attention.", fieldErrors);

    public static readonly Error ConcurrentEdit =
        Error.Conflict("eligibility.concurrent_edit", "Someone else changed these rules. Reload the page and try again.");

    public static readonly Error NothingToCopy =
        Error.NotFound("eligibility.nothing_to_copy", "The campaign you are copying from has no eligibility rules.");

    /// <summary>A problem with the subject's name, shown under the name box.</summary>
    public static Error InvalidSubject(string message) =>
        Error.Validation("eligibility.invalid_subject", message, new Dictionary<string, string[]> { ["name"] = [message] });

    public static readonly Error SubjectNotFound =
        Error.NotFound("eligibility.subject_not_found", "This subject no longer exists. Reload the page.");

    public static Error SubjectInUse(string name, int ruleCount) =>
        Error.Conflict(
            "eligibility.subject_in_use",
            ruleCount == 1
                ? $"{name} is used by 1 saved rule. Remove that rule first."
                : $"{name} is used by {ruleCount} saved rules. Remove those rules first.");

    public static readonly Error SubjectNeededForTotals =
        Error.Conflict(
            "eligibility.subject_needed_for_totals",
            "A saved rule uses the total or the average score, which needs at least two subjects. Remove that rule first.");

    public static readonly Error NoUser =
        Error.Forbidden("eligibility.no_user", "You must be signed in.");
}
