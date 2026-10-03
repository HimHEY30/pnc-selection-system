using SharedKernel;

namespace Candidates.Domain;

public static class CandidateErrors
{
    public static Error Invalid(IReadOnlyDictionary<string, string[]> fieldErrors) =>
        Error.Validation("candidates.invalid", "Some fields need your attention.", fieldErrors);

    /// <summary>One problem under one field of the form.</summary>
    public static Error Invalid(string field, string message) =>
        Invalid(new Dictionary<string, string[]> { [field] = [message] });

    public static readonly Error NotFound =
        Error.NotFound("candidates.not_found", "This candidate does not exist.");

    public static readonly Error NoUser =
        Error.Forbidden("candidates.no_user", "You must be signed in.");

    public static readonly Error ConcurrentEdit =
        Error.Conflict("candidates.concurrent_edit", "Someone else changed this. Reload the page and try again.");

    public static readonly Error CampaignClosed =
        Error.Conflict("candidates.campaign_closed", "This campaign is closed, so its candidates can no longer be changed.");

    /// <summary>What storage reports when the phone is taken between the service's check and the save. The normal check names the candidate.</summary>
    public static readonly Error PhoneTaken =
        Error.Conflict("candidates.duplicate_phone", "This phone number already belongs to another candidate in this campaign.");

    public static Error DuplicatePhone(string existingName) =>
        Error.Conflict("candidates.duplicate_phone", $"This phone number already belongs to {existingName} in this campaign.");
}
