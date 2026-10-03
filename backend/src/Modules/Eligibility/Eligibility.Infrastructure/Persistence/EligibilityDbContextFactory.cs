using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Eligibility.Infrastructure.Persistence;

/// <summary>
/// Used only by `dotnet ef` to build the context at design time (adding migrations).
/// It never runs in the app. Set ELIGIBILITY_DB to override the default dev database.
/// </summary>
internal sealed class EligibilityDbContextFactory : IDesignTimeDbContextFactory<EligibilityDbContext>
{
    public EligibilityDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ELIGIBILITY_DB")
            ?? "Host=localhost;Port=5433;Database=ssms;Username=ssms;Password=ssms";

        var options = new DbContextOptionsBuilder<EligibilityDbContext>()
            .UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", EligibilityDbContext.Schema))
            .Options;

        return new EligibilityDbContext(options);
    }
}
