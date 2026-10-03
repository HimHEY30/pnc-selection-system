using Npgsql;

namespace Eligibility.Tests.Integration;

/// <summary>The shared database and running API for this project's integration tests.</summary>
public sealed class EligibilityApiFixture : ApiFixture
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
}

[CollectionDefinition(Name)]
public sealed class EligibilityApiCollection : ICollectionFixture<EligibilityApiFixture>
{
    public const string Name = "Eligibility API";
}
