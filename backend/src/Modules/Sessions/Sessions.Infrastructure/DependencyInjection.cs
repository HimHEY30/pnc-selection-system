using Campaigns.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sessions.Application;
using Sessions.Infrastructure.Persistence;
using SharedKernel;

namespace Sessions.Infrastructure;

/// <summary>
/// Everything needed to compose the Sessions module into the Host. Program.cs calls
/// <see cref="AddSessionsInfrastructure"/> and, once the app is built and the Campaigns
/// database is up to date, <see cref="SessionsDatabaseInitializer.InitializeAsync"/>.
/// </summary>
public static class DependencyInjection
{
    /// <summary>The setting that points this module at its own database, if it ever gets one.</summary>
    public const string ConnectionStringName = "Sessions";

    /// <summary>Until then it shares the application database with Campaigns.</summary>
    public const string FallbackConnectionStringName = "Campaigns";

    public static IServiceCollection AddSessionsInfrastructure(this IServiceCollection services)
    {
        // Read when the context is first created, not here, so late configuration still counts.
        services.AddDbContext<SessionsDbContext>((provider, options) =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            var connectionString = configuration.GetConnectionString(ConnectionStringName)
                ?? configuration.GetConnectionString(FallbackConnectionStringName)
                ?? throw new InvalidOperationException(
                    $"Neither 'ConnectionStrings:{ConnectionStringName}' nor 'ConnectionStrings:{FallbackConnectionStringName}' is configured.");

            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", SessionsDbContext.Schema));
        });

        services.TryAddSingleton<IClock, SystemClock>();
        services.AddScoped<ISessionRepository, SessionRepository>();
        services.AddScoped<IHostService, HostService>();
        services.AddScoped<ISessionService, SessionService>();
        services.AddScoped<ICampaignCopyPart, SessionCopyPart>();
        services.AddScoped<ISessionChoices, SessionChoices>();
        services.AddScoped<ISchoolDirectory, SchoolDirectory>();

        return services;
    }
}
