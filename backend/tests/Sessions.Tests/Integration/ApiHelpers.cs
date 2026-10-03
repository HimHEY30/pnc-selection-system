using System.Net.Http.Json;
using Campaigns.Application;

namespace Sessions.Tests.Integration;

/// <summary>Short helpers so the tests read as what a person does on the page.</summary>
public static class ApiHelpers
{
    /// <summary>Creates a campaign and completes Step 1, so it has target provinces (Battambang and Siem Reap).</summary>
    public static async Task<CampaignDetailDto> CreateCampaignAsync(this HttpClient client, params short[] provinces)
    {
        var name = $"Selection {Guid.NewGuid():N}";
        var created = await client.PostAsJsonAsync("/api/campaigns",
            new CreateCampaignRequest(name, "2027–2028", null, StartModes.Scratch));
        created.EnsureSuccessStatusCode();
        var campaign = (await created.Content.ReadFromJsonAsync<CampaignDetailDto>())!;

        var info = new CampaignInfoRequest(
            name, "2027–2028", null, new DateOnly(2026, 11, 2), new DateOnly(2027, 3, 31), 1500, 150,
            provinces.Length == 0 ? [2, 17] : provinces, null);
        var completed = await client.PutAsJsonAsync($"/api/campaigns/{campaign.Id}/info", info);
        completed.EnsureSuccessStatusCode();
        return (await completed.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
    }
}
