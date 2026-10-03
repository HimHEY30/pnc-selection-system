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

    public static readonly Error NoUser =
        Error.Forbidden("eligibility.no_user", "You must be signed in.");
}
