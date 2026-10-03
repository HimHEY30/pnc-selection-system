using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sessions.Infrastructure.Persistence;

namespace Sessions.Infrastructure;

/// <summary>
/// Applies this module's migrations. It must run after the Campaigns migrations, because this
/// module's tables point at the campaigns and provinces tables.
/// </summary>
public static class SessionsDatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SessionsDbContext>();
        await db.Database.MigrateAsync(ct);
    }
}
