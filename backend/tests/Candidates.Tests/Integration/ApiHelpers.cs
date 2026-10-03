using System.Net.Http.Json;
using Candidates.Application;
using Sessions.Application;

namespace Candidates.Tests.Integration;

/// <summary>Short helpers so the tests read as what a person does on the page.</summary>
public static class ApiHelpers
{
    private static int _phone = 30_000_000;

    public static string NextPhone() => "0" + Interlocked.Increment(ref _phone);

    /// <summary>A valid form: an address picked from the lists, a typed school, no session, no NGO.</summary>
    public static CandidateRequest CandidateForm(
        string nameEn = "Sok Chenda",
        string? phone = null,
        string province = "Phnom Penh",
        Guid? schoolHostId = null,
        string? schoolName = "Bak Touk High School",
        Guid? sessionId = null,
        bool ngo = false,
        string? ngoName = null,
        uint? version = null) => new(
        "សុខ ចិន្តា", nameEn, "Female", new DateOnly(2009, 5, 20), phone ?? NextPhone(),
        new AddressDto(new PlaceDto("12", province), new PlaceDto("1201", "Chamkar Mon"), new PlaceDto("120101", "Tonle Bassac"), null),
        schoolHostId, schoolName, sessionId, ngo, ngoName, version);

    public static Task<HttpResponseMessage> PostCandidateAsync(this HttpClient client, Guid campaignId, CandidateRequest body) =>
        client.PostAsJsonAsync($"/api/campaigns/{campaignId}/candidates", body);

    public static Task<HttpResponseMessage> PutCandidateAsync(this HttpClient client, Guid campaignId, Guid candidateId, CandidateRequest body) =>
        client.PutAsJsonAsync($"/api/campaigns/{campaignId}/candidates/{candidateId}", body);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>Adds a high school to the partner directory, through the real API.</summary>
    public static async Task<HostDto> AddSchoolAsync(this HttpClient manager, string name, string kind = "HighSchool")
    {
        var response = await manager.PostAsJsonAsync("/api/session-hosts", new HostRequest("Partner", name, kind, "Mr Rith", "012 999 888", null));
        return await response.ReadAsync<HostDto>();
    }
}
