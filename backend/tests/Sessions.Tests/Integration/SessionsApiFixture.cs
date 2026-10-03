using Identity.Application;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Sessions.Tests.Support;

namespace Sessions.Tests.Integration;

/// <summary>The shared database and running API for this project's integration tests.</summary>
public sealed class SessionsApiFixture : ApiFixture
{
    public FakeStaffDirectory StaffDirectory { get; } = new();

    protected override void ConfigureServices(IServiceCollection services) =>
        services.AddSingleton<IStaffDirectory>(StaffDirectory);

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
public sealed class SessionsApiCollection : ICollectionFixture<SessionsApiFixture>
{
    public const string Name = "Sessions API";
}
