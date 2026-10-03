using Campaigns.Domain;
using Microsoft.EntityFrameworkCore;

namespace Campaigns.Infrastructure.Persistence;

public sealed class CampaignsDbContext : DbContext
{
    /// <summary>Every table of this module lives in its own schema (modular monolith).</summary>
    public const string Schema = "campaigns";

    public CampaignsDbContext(DbContextOptions<CampaignsDbContext> options) : base(options) { }

    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<SetupStep> SetupSteps => Set<SetupStep>();
    public DbSet<Province> Provinces => Set<Province>();
    public DbSet<CampaignProvince> CampaignProvinces => Set<CampaignProvince>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CampaignsDbContext).Assembly);
    }
}
