using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace Ssms.TestSupport;

/// <summary>
/// One real PostgreSQL container and one running copy of the whole API, for integration tests.
/// Starting the API applies every module's real migrations to the empty database, so tests also
/// prove the migrations and seeds work. Each test project derives a fixture from this and shares
/// it across its test classes through an xUnit collection.
/// </summary>
public abstract class ApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("ssms_tests")
        .WithUsername("ssms")
        .WithPassword("ssms")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public string ConnectionString => _postgres.GetConnectionString();

    /// <summary>The running app's service container, for tests that call a service directly.</summary>
    public IServiceProvider Services => _factory!.Services;

    /// <summary>A test project's chance to swap real services for fakes (for example the Keycloak staff list).</summary>
    protected virtual void ConfigureServices(IServiceCollection services)
    {
    }

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

                ConfigureServices(services);
            });
        });

        // The app starts (and applies the migrations) the first time anything touches the server.
        // Do it now, so a test that goes straight to the database never runs before the schema exists.
        _ = _factory.Server;
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
