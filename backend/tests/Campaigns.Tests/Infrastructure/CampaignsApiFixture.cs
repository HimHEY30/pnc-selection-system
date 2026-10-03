using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace Campaigns.Tests.Infrastructure;

/// <summary>
/// One real PostgreSQL container and one running copy of the API, shared by every
/// integration test. Starting the API applies the real migrations to the empty
/// database, so the tests also prove the migrations and the province seed work.
/// </summary>
public sealed class CampaignsApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("ssms_tests")
        .WithUsername("ssms")
        .WithPassword("ssms")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public string ConnectionString => _postgres.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            // "Testing" (not Development) so appsettings.Development.json and its
            // local connection string are never loaded.
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["ConnectionStrings:Campaigns"] = ConnectionString,
                    ["Seed:DemoCampaigns"] = "false",
                }));
            builder.ConfigureTestServices(services =>
            {
                services
                    .AddAuthentication(options =>
                    {
                        options.DefaultScheme = TestAuthHandler.SchemeName;
                        options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                        options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                    })
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            });
        });
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        await _postgres.DisposeAsync();
    }

    /// <summary>An HTTP client signed in with the given realm roles. No roles = not signed in.</summary>
    public HttpClient CreateClient(string? name = null, params string[] roles)
    {
        var client = _factory!.CreateClient();
        if (roles.Length > 0)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, string.Join(',', roles));
        }

        if (name is not null)
        {
            client.DefaultRequestHeaders.Add(TestAuthHandler.NameHeader, name);
        }

        return client;
    }

    public HttpClient CreateManagerClient(string? name = null) => CreateClient(name, Roles.SelectionManager);
}

public static class Roles
{
    public const string SystemAdmin = "system-admin";
    public const string SelectionManager = "selection-manager";
    public const string SelectionOfficer = "selection-officer";
    public const string CommitteeUser = "committee-user";
}

[CollectionDefinition(Name)]
public sealed class CampaignsApiCollection : ICollectionFixture<CampaignsApiFixture>
{
    public const string Name = "Campaigns API";
}
