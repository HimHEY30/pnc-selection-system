using System.Net.Http.Json;

namespace Ssms.TestSupport;

/// <summary>The body of an RFC 7807 problem response as this API writes it.</summary>
public sealed record ProblemBody(string? Title, int? Status, string? Code, Dictionary<string, string[]>? Errors);

public static class HttpResponseExtensions
{
    public static async Task<ProblemBody> ReadProblemAsync(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemBody>())!;
}
