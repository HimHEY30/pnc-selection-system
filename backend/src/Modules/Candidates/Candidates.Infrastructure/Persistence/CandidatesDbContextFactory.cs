using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Candidates.Infrastructure.Persistence;

/// <summary>
/// Used only by `dotnet ef` to build the context at design time (adding migrations).
/// It never runs in the app. Set CANDIDATES_DB to override the default dev database.
/// </summary>
internal sealed class CandidatesDbContextFactory : IDesignTimeDbContextFactory<CandidatesDbContext>
{
    public CandidatesDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("CANDIDATES_DB")
            ?? "Host=localhost;Port=5433;Database=ssms;Username=ssms;Password=ssms";

        var options = new DbContextOptionsBuilder<CandidatesDbContext>()
            .UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", CandidatesDbContext.Schema))
            .Options;

        return new CandidatesDbContext(options);
    }
}
