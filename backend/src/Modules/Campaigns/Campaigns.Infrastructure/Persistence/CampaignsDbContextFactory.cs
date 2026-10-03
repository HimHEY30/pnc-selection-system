using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Campaigns.Infrastructure.Persistence;

/// <summary>
/// Used only by `dotnet ef` to build the context at design time (adding migrations).
/// It never runs in the app. Set CAMPAIGNS_DB to override the default dev database.
/// </summary>
internal sealed class CampaignsDbContextFactory : IDesignTimeDbContextFactory<CampaignsDbContext>
{
    public CampaignsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("CAMPAIGNS_DB")
            ?? "Host=localhost;Port=5433;Database=ssms;Username=ssms;Password=ssms";

        var options = new DbContextOptionsBuilder<CampaignsDbContext>()
            .UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", CampaignsDbContext.Schema))
            .Options;

        return new CampaignsDbContext(options);
    }
}
