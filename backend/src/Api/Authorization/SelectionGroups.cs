namespace Api.Authorization;

/// <summary>
/// The four Keycloak groups/realm roles this system recognizes. Names must match
/// the group and realm role names in infra/keycloak/realm-export.json exactly.
/// </summary>
public static class SelectionGroups
{
    public const string SystemAdmin = "system-admin";
    public const string SelectionManager = "selection-manager";
    public const string SelectionOfficer = "selection-officer";
    public const string CommitteeUser = "committee-user";

    public const string ManagementTier = "ManagementTier";
    public const string OperationsTier = "OperationsTier";
}
