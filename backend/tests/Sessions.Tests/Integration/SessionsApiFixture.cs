using Identity.Application;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SharedKernel;

namespace Sessions.Tests.Integration;

/// <summary>A staff list the tests control, standing in for Keycloak's admin API.</summary>
public sealed class FakeStaffDirectory : IStaffDirectory
{
    /// <summary>Who the pretend Keycloak lists. Set to null to make the directory unavailable.</summary>
    public IReadOnlyList<StaffMember>? Staff { get; set; } =
    [
        new("officer-1", "Sokha Officer", "selection-officer"),
        new("officer-2", "Vanna Officer", "selection-officer"),
        new("manager-1", "Dara Manager", "selection-manager"),
        new("admin-1", "Admin Demo", "system-admin"),
    ];

    public Task<Result<IReadOnlyList<StaffMember>>> ListAsync(CancellationToken ct) =>
        Task.FromResult(Staff is null
            ? Result.Failure<IReadOnlyList<StaffMember>>(IdentityErrors.StaffDirectoryUnavailable)
            : Result.Success(Staff));
}

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
