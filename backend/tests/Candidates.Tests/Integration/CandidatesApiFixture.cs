using System.Net.Http.Json;
using Campaigns.Application;
using Npgsql;

namespace Candidates.Tests.Integration;

/// <summary>The shared database and running API for this project's integration tests.</summary>
public sealed class CandidatesApiFixture : ApiFixture
{
    public async Task<int> ExecuteAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return await command.ExecuteNonQueryAsync();
    }

    public async Task<T> ScalarAsync<T>(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return (T)(await command.ExecuteScalarAsync())!;
    }

    /// <summary>Creates a campaign through the real API and completes Step 1.</summary>
    public async Task<Guid> CreateCampaignAsync()
    {
        var client = CreateManagerClient();
        var name = $"Selection {Guid.NewGuid():N}";
        var created = await client.PostAsJsonAsync("/api/campaigns",
            new CreateCampaignRequest(name, "2027–2028", null, StartModes.Scratch));
        created.EnsureSuccessStatusCode();
        var campaign = (await created.Content.ReadFromJsonAsync<CampaignDetailDto>())!;

        var info = new CampaignInfoRequest(
            name, "2027–2028", null, new DateOnly(2026, 11, 2), new DateOnly(2027, 3, 31), 1500, 150, [2, 17], null);
        var completed = await client.PutAsJsonAsync($"/api/campaigns/{campaign.Id}/info", info);
        completed.EnsureSuccessStatusCode();
        return campaign.Id;
    }
}

[CollectionDefinition(Name)]
public sealed class CandidatesApiCollection : ICollectionFixture<CandidatesApiFixture>
{
    public const string Name = "Candidates API";
}
