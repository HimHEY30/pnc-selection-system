using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Sessions.Infrastructure.Persistence;

/// <summary>
/// Used only by `dotnet ef` to build the context at design time (adding migrations).
/// It never runs in the app. Set SESSIONS_DB to override the default dev database.
/// </summary>
internal sealed class SessionsDbContextFactory : IDesignTimeDbContextFactory<SessionsDbContext>
{
    public SessionsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("SESSIONS_DB")
            ?? "Host=localhost;Port=5433;Database=ssms;Username=ssms;Password=ssms";

        var options = new DbContextOptionsBuilder<SessionsDbContext>()
            .UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", SessionsDbContext.Schema))
            .Options;

        return new SessionsDbContext(options);
    }
}
