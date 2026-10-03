using Candidates.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Candidates.Infrastructure.Persistence.Configurations;

internal sealed class CandidateConfiguration : IEntityTypeConfiguration<Candidate>
{
    public void Configure(EntityTypeBuilder<Candidate> builder)
    {
        builder.ToTable("candidates", table =>
        {
            table.HasCheckConstraint("ck_candidates_gender", "gender IN (1, 2)");
            table.HasCheckConstraint("ck_candidates_names", "length(btrim(name_km)) > 0 AND length(btrim(name_en)) > 0");

            // 0 and then 8 or 9 digits, as Candidate.NormalizePhone stores it.
            table.HasCheckConstraint("ck_candidates_phone", "phone ~ '^0[1-9][0-9]{7,8}$'");

            // The three upper levels are picked from the address service (all codes) or typed (no codes). A village
            // code needs a village name, and exists only when the other codes do.
            table.HasCheckConstraint(
                "ck_candidates_address_codes",
                "((province_code IS NULL) = (district_code IS NULL) AND (province_code IS NULL) = (commune_code IS NULL)) "
                + "AND (village_code IS NULL OR (village_name IS NOT NULL AND province_code IS NOT NULL))");
            table.HasCheckConstraint(
                "ck_candidates_address_names",
                "length(btrim(province_name)) > 0 AND length(btrim(district_name)) > 0 AND length(btrim(commune_name)) > 0 "
                + "AND (village_name IS NULL OR length(btrim(village_name)) > 0)");

            table.HasCheckConstraint("ck_candidates_school", "length(btrim(school_name)) > 0");

            // The NGO name is there if and only if the candidate has NGO support.
            table.HasCheckConstraint(
                "ck_candidates_ngo",
                "(has_ngo_support AND ngo_name IS NOT NULL AND length(btrim(ngo_name)) > 0) OR (NOT has_ngo_support AND ngo_name IS NULL)");
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id").ValueGeneratedNever();

        // A foreign key to campaigns.campaigns is added by hand in the migration: that table belongs to
        // another module's context, so EF cannot model the link.
        builder.Property(c => c.CampaignId).HasColumnName("campaign_id").IsRequired();

        builder.Property(c => c.NameKm).HasColumnName("name_km").HasMaxLength(CandidateLimits.NameMax).IsRequired();
        builder.Property(c => c.NameEn).HasColumnName("name_en").HasMaxLength(CandidateLimits.NameMax).IsRequired();
        builder.Property(c => c.Gender).HasColumnName("gender").HasConversion<short>();
        builder.Property(c => c.DateOfBirth).HasColumnName("date_of_birth").HasColumnType("date");
        builder.Property(c => c.Phone).HasColumnName("phone").HasMaxLength(20).IsRequired();

        builder.Property(c => c.ProvinceCode).HasColumnName("province_code").HasMaxLength(CandidateLimits.PlaceCodeMax);
        builder.Property(c => c.ProvinceName).HasColumnName("province_name").HasMaxLength(CandidateLimits.PlaceNameMax).IsRequired();
        builder.Property(c => c.DistrictCode).HasColumnName("district_code").HasMaxLength(CandidateLimits.PlaceCodeMax);
        builder.Property(c => c.DistrictName).HasColumnName("district_name").HasMaxLength(CandidateLimits.PlaceNameMax).IsRequired();
        builder.Property(c => c.CommuneCode).HasColumnName("commune_code").HasMaxLength(CandidateLimits.PlaceCodeMax);
        builder.Property(c => c.CommuneName).HasColumnName("commune_name").HasMaxLength(CandidateLimits.PlaceNameMax).IsRequired();
        builder.Property(c => c.VillageCode).HasColumnName("village_code").HasMaxLength(CandidateLimits.PlaceCodeMax);
        builder.Property(c => c.VillageName).HasColumnName("village_name").HasMaxLength(CandidateLimits.PlaceNameMax);

        // No foreign key to the host directory: a host is switched off and never deleted, and the name is copied here.
        builder.Property(c => c.SchoolHostId).HasColumnName("school_host_id");
        builder.Property(c => c.SchoolName).HasColumnName("school_name").HasMaxLength(CandidateLimits.SchoolNameMax).IsRequired();

        // A foreign key to sessions.information_sessions is added by hand in the migration, for the same reason as
        // the campaign one. Deleting a session only clears the link.
        builder.Property(c => c.SessionId).HasColumnName("session_id");

        builder.Property(c => c.HasNgoSupport).HasColumnName("has_ngo_support");
        builder.Property(c => c.NgoName).HasColumnName("ngo_name").HasMaxLength(CandidateLimits.NgoNameMax);

        builder.Property(c => c.CreatedById).HasColumnName("created_by_id").HasMaxLength(100).IsRequired();
        builder.Property(c => c.CreatedByName).HasColumnName("created_by_name").HasMaxLength(200).IsRequired();
        builder.Property(c => c.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at").IsRequired();

        // PostgreSQL's xmin changes on every update, so it works as a concurrency token for free.
        builder.Property(c => c.Version)
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();

        // One candidate per phone number in a campaign.
        builder.HasIndex(c => new { c.CampaignId, c.Phone }).IsUnique().HasDatabaseName("ux_candidates_campaign_phone");

        // "The newest first" (the default list), "by province", "who came to this session".
        builder.HasIndex(c => new { c.CampaignId, c.CreatedAt }).HasDatabaseName("ix_candidates_campaign_created");
        builder.HasIndex(c => new { c.CampaignId, c.ProvinceName }).HasDatabaseName("ix_candidates_campaign_province");
        builder.HasIndex(c => new { c.CampaignId, c.SessionId }).HasDatabaseName("ix_candidates_campaign_session");
    }
}

internal sealed class CandidateAuditEntryConfiguration : IEntityTypeConfiguration<CandidateAuditEntry>
{
    public void Configure(EntityTypeBuilder<CandidateAuditEntry> builder)
    {
        builder.ToTable("audit_log", table =>
        {
            table.HasCheckConstraint("ck_audit_log_action", "action IN (1, 2, 3)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id").ValueGeneratedNever();

        // A foreign key to campaigns.campaigns is added by hand in the migration.
        builder.Property(a => a.CampaignId).HasColumnName("campaign_id").IsRequired();
        builder.Property(a => a.CandidateId).HasColumnName("candidate_id");
        builder.Property(a => a.Action).HasColumnName("action").HasConversion<short>();
        builder.Property(a => a.BeforeJson).HasColumnName("before").HasColumnType("jsonb");
        builder.Property(a => a.AfterJson).HasColumnName("after").HasColumnType("jsonb");
        builder.Property(a => a.ChangedById).HasColumnName("changed_by_id").HasMaxLength(100).IsRequired();
        builder.Property(a => a.ChangedByName).HasColumnName("changed_by_name").HasMaxLength(200).IsRequired();
        builder.Property(a => a.ChangedAt).HasColumnName("changed_at").IsRequired();

        builder.HasIndex(a => new { a.CampaignId, a.ChangedAt }).HasDatabaseName("ix_audit_log_campaign_changed_at");
        builder.HasIndex(a => a.CandidateId).HasDatabaseName("ix_audit_log_candidate_id");
    }
}
