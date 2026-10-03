using System.Net.Http.Json;
using Campaigns.Application;
using Sessions.Application;

namespace Sessions.Tests.Integration;

/// <summary>Short helpers so the tests read as what a person does on the page.</summary>
public static class ApiHelpers
{
    /// <summary>Makes the client's user have this Keycloak subject (the id a session's assignee is matched on).</summary>
    public static HttpClient AsUser(this HttpClient client, string subject)
    {
        client.DefaultRequestHeaders.Remove(TestAuthHandler.SubjectHeader);
        client.DefaultRequestHeaders.Add(TestAuthHandler.SubjectHeader, subject);
        return client;
    }

    private static int _dayCounter;

    /// <summary>
    /// A date nobody else in this run has used, in the far future. A host cannot run two sessions at once, and the tests
    /// share the officers, so each session gets its own day.
    /// </summary>
    public static DateOnly NextFutureDay() => new DateOnly(2100, 1, 1).AddDays(Interlocked.Increment(ref _dayCounter));

    /// <summary>A day long gone, unique like <see cref="NextFutureDay"/>, so attendance can be recorded for it.</summary>
    public static DateOnly NextPastDay() => new DateOnly(2000, 1, 1).AddDays(Interlocked.Increment(ref _dayCounter));

    /// <summary>A valid form: in person, 09:00 to 11:00, assigned to officer-1 and run by officer-1.</summary>
    public static SessionRequest SessionForm(
        DateOnly? date = null,
        string title = "Open day at Kampong Cham High School",
        string format = "InPerson",
        string? venue = "School hall",
        string? link = null,
        short? province = null,
        string assignee = "officer-1",
        string hostType = "Officer",
        Guid? hostId = null,
        string? hostUserId = "officer-1",
        string start = "09:00",
        string end = "11:00") => new(
        title, date ?? NextFutureDay(), start, end, format, venue, link, province, null, assignee, hostType, hostId, hostUserId);

    public static Task<HttpResponseMessage> PostSessionAsync(this HttpClient client, Guid campaignId, SessionRequest body) =>
        client.PostAsJsonAsync($"/api/campaigns/{campaignId}/sessions", body);

    public static Task<HttpResponseMessage> PutSessionAsync(this HttpClient client, Guid campaignId, Guid sessionId, SessionRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}", body);

    public static Task<HttpResponseMessage> CancelSessionAsync(this HttpClient client, Guid campaignId, Guid sessionId, string? reason) =>
        client.PostAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/cancel", new CancelRequest(reason));

    public static Task<HttpResponseMessage> PutExpectedAsync(this HttpClient client, Guid campaignId, Guid sessionId, int? expected) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/expected", new ExpectedRequest(expected));

    public static Task<HttpResponseMessage> PutAttendanceAsync(this HttpClient client, Guid campaignId, Guid sessionId, int? female, int? male) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/attendance", new AttendanceRequest(female, male));

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

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
