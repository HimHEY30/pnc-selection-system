using Campaigns.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Campaigns.Infrastructure;

/// <summary>Applies migrations (which also seed the 25 provinces) and, if asked, the demo campaigns.</summary>
public static class CampaignsDatabaseInitializer
{
    /// <summary>Set to true to create sample campaigns in an empty database. Off by default.</summary>
    public const string DemoSeedSetting = "Seed:DemoCampaigns";

    public static async Task InitializeAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CampaignsDbContext>();
        await db.Database.MigrateAsync(ct);

        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        if (configuration.GetValue<bool>(DemoSeedSetting))
        {
            await DemoCampaignSeeder.SeedAsync(db, ct);
        }
    }
}
