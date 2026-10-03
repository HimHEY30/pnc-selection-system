using Candidates.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Candidates.Infrastructure;

/// <summary>
/// Applies this module's migrations. It must run after the Campaigns and Sessions migrations, because this
/// module's tables point at the campaigns and information_sessions tables.
/// </summary>
public static class CandidatesDatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CandidatesDbContext>();
        await db.Database.MigrateAsync(ct);
    }
}
