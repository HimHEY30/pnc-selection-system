namespace Identity.Domain;

/// <summary>
/// The groups recognized by this system. Names must match the Keycloak group
/// and realm role names in infra/keycloak/realm-export.json exactly.
/// </summary>
public enum Group
{
    SystemAdmin,
    SelectionManager,
    SelectionOfficer,
    CommitteeUser,
}

public static class GroupNames
{
    public const string SystemAdmin = "system-admin";
    public const string SelectionManager = "selection-manager";
    public const string SelectionOfficer = "selection-officer";
    public const string CommitteeUser = "committee-user";

    public static Group? FromKeycloakName(string name) => name switch
    {
        SystemAdmin => Group.SystemAdmin,
        SelectionManager => Group.SelectionManager,
        SelectionOfficer => Group.SelectionOfficer,
        CommitteeUser => Group.CommitteeUser,
        _ => null,
    };

    public static string ToKeycloakName(Group group) => group switch
    {
        Group.SystemAdmin => SystemAdmin,
        Group.SelectionManager => SelectionManager,
        Group.SelectionOfficer => SelectionOfficer,
        Group.CommitteeUser => CommitteeUser,
        _ => throw new ArgumentOutOfRangeException(nameof(group)),
    };
}
