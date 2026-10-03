using Campaigns.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Campaigns.Infrastructure.Persistence.Configurations;

internal sealed class CampaignProvinceConfiguration : IEntityTypeConfiguration<CampaignProvince>
{
    public void Configure(EntityTypeBuilder<CampaignProvince> builder)
    {
        builder.ToTable("campaign_provinces");

        builder.HasKey(p => new { p.CampaignId, p.ProvinceId });
        builder.Property(p => p.CampaignId).HasColumnName("campaign_id");
        builder.Property(p => p.ProvinceId).HasColumnName("province_id");

        // A province in use cannot be deleted from under a campaign.
        builder.HasOne<Province>()
            .WithMany()
            .HasForeignKey(p => p.ProvinceId)
            .OnDelete(DeleteBehavior.Restrict);

        // "Which campaigns target this province" - the primary key already covers the other direction.
        builder.HasIndex(p => p.ProvinceId).HasDatabaseName("ix_campaign_provinces_province_id");
    }
}
