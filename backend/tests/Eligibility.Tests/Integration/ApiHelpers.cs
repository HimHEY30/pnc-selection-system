using System.Net.Http.Json;
using Campaigns.Application;
using Eligibility.Application;

namespace Eligibility.Tests.Integration;

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

    public static async Task<CampaignDetailDto> GetCampaignAsync(this HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<CampaignDetailDto>($"/api/campaigns/{id}"))!;

    public static string StepStatus(this CampaignDetailDto campaign, string step = "EligibilityRules") =>
        campaign.Steps.Single(s => s.Step == step).Status;

    public static Task<HttpResponseMessage> GetRulesAsync(this HttpClient client, Guid campaignId) =>
        client.GetAsync($"/api/campaigns/{campaignId}/eligibility");

    public static Task<HttpResponseMessage> SaveDraftAsync(this HttpClient client, Guid campaignId, RuleSetRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/eligibility/draft", body);

    public static Task<HttpResponseMessage> CompleteAsync(this HttpClient client, Guid campaignId, RuleSetRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/eligibility", body);

    public static Task<HttpResponseMessage> TestAsync(this HttpClient client, Guid campaignId, TestRequest body) =>
        client.PostAsJsonAsync($"/api/campaigns/{campaignId}/eligibility/test", body);

    public static async Task<RuleSetDto> ReadRuleSetAsync(this HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<RuleSetDto>())!;
    }

    public static async Task<RuleSetDto> LoadRulesAsync(this HttpClient client, Guid campaignId) =>
        await (await client.GetRulesAsync(campaignId)).ReadRuleSetAsync();

    // ---------- Building requests ----------

    public static RuleInput Rule(
        string field,
        string op,
        string[]? values = null,
        string type = "Mandatory",
        string message = "Message.",
        bool active = true,
        Guid? id = null) => new(id ?? Guid.NewGuid(), field, op, values ?? [], type, message, active);

    public static GroupInput Group(string logic = "All", string name = "Group", Guid? id = null, params RuleInput[] rules) =>
        new(id ?? Guid.NewGuid(), name, logic, [.. rules]);

    public static RuleSetRequest Request(DateOnly? referenceDate = null, uint? version = null, params GroupInput[] groups) =>
        new(referenceDate, [.. groups], version);

    public static readonly DateOnly ReferenceDate = new(2026, 11, 2);

    /// <summary>The smallest request that can be completed.</summary>
    public static RuleSetRequest Completable(uint? version = null, RuleInput? rule = null) =>
        Request(ReferenceDate, version, Group(rules: rule ?? Rule("gender", "is", ["female"])));

    public static RuleSetRequest ToRequest(this RuleSetDto dto) => new(
        dto.AgeReferenceDate,
        dto.Groups.Select(g => new GroupInput(g.Id, g.Name, g.Logic,
            g.Rules.Select(r => new RuleInput(r.Id, r.FieldKey, r.OperatorKey, r.Values, r.Type, r.Message, r.IsActive)).ToList())).ToList(),
        dto.Version);
}
