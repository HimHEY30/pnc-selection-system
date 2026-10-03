using Campaigns.Application;
using Campaigns.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SharedKernel;

namespace Campaigns.Infrastructure;

/// <summary>
/// Everything needed to compose the Campaigns module into the Host. Program.cs
/// only calls <see cref="AddCampaignsInfrastructure"/> and, once the app is built,
/// <see cref="CampaignsDatabaseInitializer.InitializeAsync"/>.
/// </summary>
public static class DependencyInjection
{
    public const string ConnectionStringName = "Campaigns";

    public static IServiceCollection AddCampaignsInfrastructure(this IServiceCollection services)
    {
        // The connection string is read when the context is first created, not
        // here, so configuration supplied late (tests, hosting) is still honoured.
        services.AddDbContext<CampaignsDbContext>((provider, options) =>
        {
            var connectionString = provider.GetRequiredService<IConfiguration>().GetConnectionString(ConnectionStringName)
                ?? throw new InvalidOperationException(
                    $"Connection string 'ConnectionStrings:{ConnectionStringName}' is not configured.");

            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", CampaignsDbContext.Schema));
        });

        services.TryAddSingleton<IClock, SystemClock>();
        services.AddScoped<ICampaignRepository, CampaignRepository>();
        services.AddScoped<ICampaignService, CampaignService>();
        services.AddScoped<ICampaignSetupGateway, CampaignSetupGateway>();

        return services;
    }
}
