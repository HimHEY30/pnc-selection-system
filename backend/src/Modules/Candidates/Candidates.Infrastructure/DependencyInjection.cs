using Candidates.Application;
using Candidates.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SharedKernel;

namespace Candidates.Infrastructure;

/// <summary>
/// Everything needed to compose the Candidates module into the Host. Program.cs calls
/// <see cref="AddCandidatesInfrastructure"/> and, once the app is built and the Campaigns and Sessions
/// databases are up to date, <see cref="CandidatesDatabaseInitializer.InitializeAsync"/>.
/// </summary>
public static class DependencyInjection
{
    /// <summary>The setting that points this module at its own database, if it ever gets one.</summary>
    public const string ConnectionStringName = "Candidates";

    /// <summary>Until then it shares the application database with Campaigns.</summary>
    public const string FallbackConnectionStringName = "Campaigns";

    public static IServiceCollection AddCandidatesInfrastructure(this IServiceCollection services)
    {
        // Read when the context is first created, not here, so late configuration still counts.
        services.AddDbContext<CandidatesDbContext>((provider, options) =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            var connectionString = configuration.GetConnectionString(ConnectionStringName)
                ?? configuration.GetConnectionString(FallbackConnectionStringName)
                ?? throw new InvalidOperationException(
                    $"Neither 'ConnectionStrings:{ConnectionStringName}' nor 'ConnectionStrings:{FallbackConnectionStringName}' is configured.");

            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", CandidatesDbContext.Schema));
        });

        services.TryAddSingleton<IClock, SystemClock>();
        services.AddScoped<ICandidateRepository, CandidateRepository>();
        services.AddScoped<ICandidateService, CandidateService>();

        return services;
    }
}
