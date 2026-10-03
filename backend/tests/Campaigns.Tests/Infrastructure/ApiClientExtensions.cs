using System.Net.Http.Json;
using Campaigns.Application;

namespace Campaigns.Tests.Infrastructure;

public static class ApiClientExtensions
{
    public static async Task<CampaignDetailDto> CreateCampaignAsync(this HttpClient client, string? name = null)
    {
        var response = await client.PostAsJsonAsync("/api/campaigns", TestData.ValidCreate(name));
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
    }

    public static async Task<CampaignDetailDto> GetCampaignAsync(this HttpClient client, Guid id)
    {
        var response = await client.GetAsync($"/api/campaigns/{id}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
    }

    public static Task<HttpResponseMessage> SaveDraftAsync(this HttpClient client, Guid id, CampaignInfoRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{id}/info/draft", body);

    public static Task<HttpResponseMessage> CompleteInfoAsync(this HttpClient client, Guid id, CampaignInfoRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{id}/info", body);

    public static async Task<CampaignDetailDto> ReadCampaignAsync(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<CampaignDetailDto>())!;
}
