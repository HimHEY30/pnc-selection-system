namespace Identity.Application;

/// <summary>
/// Policy names shared between Identity.Infrastructure (where they're registered
/// against ASP.NET's authorization system) and every module's Api layer (where
/// [Authorize(Policy = ...)] references them). Neither side needs to know the
/// other's implementation details — just these names.
/// </summary>
public static class AuthorizationPolicies
{
    public const string SystemAdmin = "SystemAdmin";
    public const string SelectionManager = "SelectionManager";
    public const string SelectionOfficer = "SelectionOfficer";
    public const string CommitteeUser = "CommitteeUser";

    /// <summary>system-admin or selection-manager.</summary>
    public const string ManagementTier = "ManagementTier";

    /// <summary>system-admin, selection-manager, or selection-officer.</summary>
    public const string OperationsTier = "OperationsTier";
}
