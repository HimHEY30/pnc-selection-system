using SharedKernel;

namespace Sessions.Domain;

public static class SessionErrors
{
    public static Error Invalid(IReadOnlyDictionary<string, string[]> fieldErrors) =>
        Error.Validation("sessions.invalid", "Some fields need your attention.", fieldErrors);

    /// <summary>One problem under one field of the form.</summary>
    public static Error Invalid(string field, string message) =>
        Invalid(new Dictionary<string, string[]> { [field] = [message] });

    public static readonly Error NotFound =
        Error.NotFound("sessions.not_found", "This session does not exist.");

    public static readonly Error HostNotFound =
        Error.NotFound("sessions.host_not_found", "This host does not exist.");

    public static readonly Error ConcurrentEdit =
        Error.Conflict("sessions.concurrent_edit", "Someone else changed this. Reload the page and try again.");

    public static readonly Error CampaignClosed =
        Error.Conflict("sessions.campaign_closed", "This campaign is closed, so its sessions can no longer be changed.");

    public static readonly Error NotPlanned =
        Error.Conflict("sessions.not_planned", "Only a planned session can be changed. This one is done or cancelled.");

    public static readonly Error AlreadyCancelled =
        Error.Conflict("sessions.cancelled", "This session was cancelled, so its numbers can no longer be changed.");

    public static readonly Error CannotCancelDone =
        Error.Conflict("sessions.cannot_cancel_done", "A session that took place cannot be cancelled.");

    public static readonly Error NotHeldYet =
        Error.Conflict("sessions.not_held_yet", "Attendance can be recorded once the session's date has arrived.");

    public static Error HostBusy(string hostName) =>
        Error.Conflict("sessions.host_busy", $"{hostName} already runs another session at that time.");

    /// <summary>What storage reports when two hosts of one type would share a name. The host service turns it into <see cref="HostNameTaken"/>.</summary>
    public static readonly Error DuplicateHost =
        Error.Conflict("sessions.duplicate_host", "A host with this name already exists.");

    public static Error HostNameTaken(HostType type) =>
        Invalid("name", type == HostType.Alumni
            ? "An alumnus with this name is already in the list."
            : "A partner with this name is already in the list.");

    public static readonly Error HostInactive =
        Error.Conflict("sessions.host_inactive", "This host is switched off. Switch it on or choose another host.");

    public static readonly Error NoUser =
        Error.Forbidden("sessions.no_user", "You must be signed in.");
}
