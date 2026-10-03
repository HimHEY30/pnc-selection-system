using Eligibility.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Eligibility.Infrastructure;

/// <summary>
/// Applies this module's migrations, which also seed the field catalogue. It must run after
/// the Campaigns migrations, because this module's tables point at the campaigns table.
/// </summary>
public static class EligibilityDatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EligibilityDbContext>();
        await db.Database.MigrateAsync(ct);
    }
}
