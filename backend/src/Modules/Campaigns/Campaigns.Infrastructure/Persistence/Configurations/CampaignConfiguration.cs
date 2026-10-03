using Campaigns.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Campaigns.Infrastructure.Persistence.Configurations;

internal sealed class CampaignConfiguration : IEntityTypeConfiguration<Campaign>
{
    public const string NameIndexName = "ix_campaigns_name_normalized";

    public void Configure(EntityTypeBuilder<Campaign> builder)
    {
        builder.ToTable("campaigns", table =>
        {
            table.HasCheckConstraint("ck_campaigns_dates", "start_date IS NULL OR end_date IS NULL OR end_date > start_date");
            table.HasCheckConstraint("ck_campaigns_expected_candidates", "expected_candidates IS NULL OR expected_candidates > 0");
            table.HasCheckConstraint("ck_campaigns_seats_available", "seats_available IS NULL OR seats_available > 0");
            table.HasCheckConstraint(
                "ck_campaigns_seats_within_expected",
                "seats_available IS NULL OR expected_candidates IS NULL OR seats_available <= expected_candidates");
            table.HasCheckConstraint("ck_campaigns_status", "status IN (0, 1, 2)");
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id").ValueGeneratedNever();

        builder.Property(c => c.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
        builder.Property(c => c.NameNormalized).HasColumnName("name_normalized").HasMaxLength(100).IsRequired();
        builder.Property(c => c.AcademicYear).HasColumnName("academic_year").HasMaxLength(20).IsRequired();
        builder.Property(c => c.Description).HasColumnName("description").HasMaxLength(500);
        builder.Property(c => c.Status).HasColumnName("status").HasConversion<short>().IsRequired();
        builder.Property(c => c.StartDate).HasColumnName("start_date").HasColumnType("date");
        builder.Property(c => c.EndDate).HasColumnName("end_date").HasColumnType("date");
        builder.Property(c => c.ExpectedCandidates).HasColumnName("expected_candidates");
        builder.Property(c => c.SeatsAvailable).HasColumnName("seats_available");
        builder.Property(c => c.CreatedById).HasColumnName("created_by_id").HasMaxLength(100).IsRequired();
        builder.Property(c => c.CreatedByName).HasColumnName("created_by_name").HasMaxLength(200).IsRequired();
        builder.Property(c => c.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at").IsRequired();

        // PostgreSQL's xmin system column changes on every update of the row, so it
        // works as an optimistic-concurrency token with no extra column to maintain.
        builder.Property(c => c.Version)
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();

        builder.HasIndex(c => c.NameNormalized).IsUnique().HasDatabaseName(NameIndexName);
        builder.HasIndex(c => c.Status).HasDatabaseName("ix_campaigns_status");
        builder.HasIndex(c => c.CreatedAt).HasDatabaseName("ix_campaigns_created_at");

        builder.HasMany(c => c.Steps)
            .WithOne()
            .HasForeignKey(s => s.CampaignId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Steps).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(c => c.Provinces)
            .WithOne()
            .HasForeignKey(p => p.CampaignId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Provinces).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(c => c.DomainEvents);
        builder.Ignore(c => c.IsEditable);
        builder.Ignore(c => c.CanActivate);
    }
}
