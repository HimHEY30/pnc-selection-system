using Campaigns.Application;
using Eligibility.Application;
using Eligibility.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SharedKernel;

namespace Eligibility.Infrastructure;

/// <summary>
/// Everything needed to compose the Eligibility module into the Host. Program.cs calls
/// <see cref="AddEligibilityInfrastructure"/> and, once the app is built and the Campaigns
/// database is up to date, <see cref="EligibilityDatabaseInitializer.InitializeAsync"/>.
/// </summary>
public static class DependencyInjection
{
    /// <summary>The setting that points this module at its own database, if it ever gets one.</summary>
    public const string ConnectionStringName = "Eligibility";

    /// <summary>Until then it shares the application database with Campaigns.</summary>
    public const string FallbackConnectionStringName = "Campaigns";

    public static IServiceCollection AddEligibilityInfrastructure(this IServiceCollection services)
    {
        // Read when the context is first created, not here, so late configuration still counts.
        services.AddDbContext<EligibilityDbContext>((provider, options) =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            var connectionString = configuration.GetConnectionString(ConnectionStringName)
                ?? configuration.GetConnectionString(FallbackConnectionStringName)
                ?? throw new InvalidOperationException(
                    $"Neither 'ConnectionStrings:{ConnectionStringName}' nor 'ConnectionStrings:{FallbackConnectionStringName}' is configured.");

            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", EligibilityDbContext.Schema));
        });

        services.TryAddSingleton<IClock, SystemClock>();
        services.AddScoped<IEligibilityRepository, EligibilityRepository>();
        services.AddScoped<IExamSubjectService, ExamSubjectService>();
        services.AddScoped<IEligibilityService, EligibilityService>();
        services.AddScoped<ICampaignCopyPart, EligibilityCopyPart>();

        return services;
    }
}
