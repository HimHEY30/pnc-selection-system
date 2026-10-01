namespace Identity.Domain;

/// <summary>
/// Read-only shape of the caller, as asserted by the identity provider's token.
/// Keeps every other module from touching ClaimsPrincipal directly.
/// </summary>
public sealed class AuthenticatedUser
{
    public string Subject { get; }
    public string Username { get; }
    public IReadOnlyCollection<Group> Groups { get; }

    public AuthenticatedUser(string subject, string username, IReadOnlyCollection<Group> groups)
    {
        Subject = subject;
        Username = username;
        Groups = groups;
    }

    public bool IsInAnyGroup(params Group[] groups) => groups.Any(Groups.Contains);
}
