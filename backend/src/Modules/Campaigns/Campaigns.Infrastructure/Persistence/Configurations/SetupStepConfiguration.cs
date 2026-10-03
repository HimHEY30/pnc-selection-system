using Campaigns.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Campaigns.Infrastructure.Persistence.Configurations;

internal sealed class SetupStepConfiguration : IEntityTypeConfiguration<SetupStep>
{
    public void Configure(EntityTypeBuilder<SetupStep> builder)
    {
        builder.ToTable("campaign_setup_steps", table =>
        {
            table.HasCheckConstraint("ck_campaign_setup_steps_step", "step BETWEEN 1 AND 5");
            table.HasCheckConstraint("ck_campaign_setup_steps_status", "status IN (0, 1, 2)");
        });

        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(s => s.CampaignId).HasColumnName("campaign_id").IsRequired();
        builder.Property(s => s.Step).HasColumnName("step").HasConversion<short>().IsRequired();
        builder.Property(s => s.Status).HasColumnName("status").HasConversion<short>().IsRequired();
        builder.Property(s => s.UpdatedAt).HasColumnName("updated_at").IsRequired();

        // One row per campaign per step. This also serves lookups by campaign_id.
        builder.HasIndex(s => new { s.CampaignId, s.Step }).IsUnique().HasDatabaseName("ux_campaign_setup_steps_campaign_step");
    }
}
