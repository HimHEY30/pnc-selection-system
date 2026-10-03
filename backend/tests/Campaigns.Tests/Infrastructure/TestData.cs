using Campaigns.Application;

namespace Campaigns.Tests.Infrastructure;

/// <summary>Ready-made requests for tests. Use `with { ... }` to break one rule at a time.</summary>
public static class TestData
{
    /// <summary>Siem Reap, Battambang, Kampong Cham, Takeo (ids from the province seed).</summary>
    public static readonly short[] FourProvinces = [2, 3, 17, 21];

    public static string UniqueName(string prefix = "Selection") => $"{prefix} {Guid.NewGuid():N}";

    public static CreateCampaignRequest ValidCreate(string? name = null) =>
        new(name ?? UniqueName(), "2027–2028", "Yearly selection of students for the PNC IT training programme.", StartModes.Scratch);

    /// <summary>A Step 1 request that passes "Save and continue".</summary>
    public static CampaignInfoRequest ValidInfo(string name) =>
        new(
            Name: name,
            AcademicYear: "2027–2028",
            Description: "Yearly selection of students for the PNC IT training programme.",
            StartDate: new DateOnly(2026, 11, 2),
            EndDate: new DateOnly(2027, 3, 31),
            ExpectedCandidates: 1500,
            SeatsAvailable: 150,
            ProvinceIds: FourProvinces,
            Version: null);

    /// <summary>A Step 1 request with only what "Save draft" requires.</summary>
    public static CampaignInfoRequest MinimalInfo(string name) =>
        new(name, "2027–2028", null, null, null, null, null, null, null);
}
