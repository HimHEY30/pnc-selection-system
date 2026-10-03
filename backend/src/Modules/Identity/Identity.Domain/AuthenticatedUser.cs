namespace Identity.Domain;

/// <summary>
/// Read-only shape of the caller, as asserted by the identity provider's token.
/// Keeps every other module from touching ClaimsPrincipal directly.
/// </summary>
public sealed class AuthenticatedUser
{
    public string Subject { get; }
    public string Username { get; }

    /// <summary>The person's full name as shown in the UI. Falls back to the username.</summary>
    public string DisplayName { get; }

    public IReadOnlyCollection<Group> Groups { get; }

    public AuthenticatedUser(string subject, string username, IReadOnlyCollection<Group> groups, string? displayName = null)
    {
        Subject = subject;
        Username = username;
        Groups = groups;
        DisplayName = string.IsNullOrWhiteSpace(displayName) ? username : displayName;
    }

    public bool IsInAnyGroup(params Group[] groups) => groups.Any(Groups.Contains);
}
