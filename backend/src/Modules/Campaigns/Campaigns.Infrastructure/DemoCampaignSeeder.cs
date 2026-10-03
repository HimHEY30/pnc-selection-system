using Campaigns.Domain;
using Campaigns.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Campaigns.Infrastructure;

/// <summary>
/// Sample campaigns for local development and demos, one per interesting state:
/// just created, partly filled in, and Step 1 complete. Built through the domain
/// methods so the data obeys the same rules as real data. Skipped if any campaign exists.
/// </summary>
internal static class DemoCampaignSeeder
{
    private const string SeedUserId = "seed";
    private const string SeedUserName = "Demo Seed";

    public static async Task SeedAsync(CampaignsDbContext db, CancellationToken ct)
    {
        if (await db.Campaigns.AnyAsync(ct))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;

        // Just created: only name and academic year, Step 1 In progress.
        var fresh = Campaign.Create("Selection 2028 (demo)", "2028–2029", null, SeedUserId, SeedUserName, now);

        // Draft saved with partial data: Step 1 In progress.
        var partial = Campaign.Create(
            "Selection 2027 (demo)", "2027–2028", "Yearly selection of students for the PNC IT training programme.",
            SeedUserId, SeedUserName, now);
        partial.SaveInfoDraft(
            new CampaignInfo(partial.Name, partial.AcademicYear, partial.Description,
                new DateOnly(2026, 11, 2), null, 1500, null, [2, 17, 3, 21]),
            now);

        // Step 1 complete: all five steps still not done, so it cannot be activated.
        var complete = Campaign.Create(
            "Selection 2026 (demo)", "2026–2027", "Previous cycle, used to try the completed state.",
            SeedUserId, SeedUserName, now);
        complete.CompleteInfo(
            new CampaignInfo(complete.Name, complete.AcademicYear, complete.Description,
                new DateOnly(2026, 1, 12), new DateOnly(2026, 6, 30), 1200, 120, [12, 2, 17]),
            now);

        db.Campaigns.AddRange(fresh, partial, complete);
        await db.SaveChangesAsync(ct);
    }
}
