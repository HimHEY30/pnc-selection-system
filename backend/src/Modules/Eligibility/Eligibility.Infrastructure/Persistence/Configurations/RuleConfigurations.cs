using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Eligibility.Infrastructure.Persistence.Configurations;

internal sealed class RuleSetConfiguration : IEntityTypeConfiguration<RuleSet>
{
    public void Configure(EntityTypeBuilder<RuleSet> builder)
    {
        builder.ToTable("rule_sets");

        // One rule set per campaign, so the campaign id is the key. A foreign key to
        // campaigns.campaigns is added by hand in the migration: that table belongs to another
        // module's context, so EF cannot model the link.
        builder.HasKey(r => r.CampaignId);
        builder.Property(r => r.CampaignId).HasColumnName("campaign_id").ValueGeneratedNever();
        builder.Property(r => r.AgeReferenceDate).HasColumnName("age_reference_date").HasColumnType("date");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at").IsRequired();
        builder.Property(r => r.UpdatedById).HasColumnName("updated_by_id").HasMaxLength(100);
        builder.Property(r => r.UpdatedByName).HasColumnName("updated_by_name").HasMaxLength(200);

        // PostgreSQL's xmin changes on every update, so it works as a concurrency token for free.
        builder.Property(r => r.Version)
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();

        builder.HasMany(r => r.Groups)
            .WithOne()
            .HasForeignKey(g => g.CampaignId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(r => r.Groups).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class RuleGroupConfiguration : IEntityTypeConfiguration<RuleGroup>
{
    public void Configure(EntityTypeBuilder<RuleGroup> builder)
    {
        builder.ToTable("rule_groups", table =>
        {
            table.HasCheckConstraint("ck_rule_groups_logic", "logic IN (1, 2)");
            table.HasCheckConstraint("ck_rule_groups_position", "position >= 0");
        });

        builder.HasKey(g => g.Id);
        builder.Property(g => g.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(g => g.CampaignId).HasColumnName("campaign_id").IsRequired();
        builder.Property(g => g.Name).HasColumnName("name").HasMaxLength(60).IsRequired();
        builder.Property(g => g.Logic).HasColumnName("logic").HasConversion<short>();
        builder.Property(g => g.Position).HasColumnName("position");

        builder.HasIndex(g => new { g.CampaignId, g.Position }).HasDatabaseName("ix_rule_groups_campaign_position");

        builder.HasMany(g => g.Rules)
            .WithOne()
            .HasForeignKey(r => r.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(g => g.Rules).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class RuleConfiguration : IEntityTypeConfiguration<Rule>
{
    public void Configure(EntityTypeBuilder<Rule> builder)
    {
        builder.ToTable("rules", table =>
        {
            table.HasCheckConstraint("ck_rules_type", "type IN (1, 2)");
            table.HasCheckConstraint("ck_rules_position", "position >= 0");
            table.HasCheckConstraint("ck_rules_message", "length(btrim(message)) > 0");
        });

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(r => r.GroupId).HasColumnName("group_id").IsRequired();
        builder.Property(r => r.FieldKey).HasColumnName("field_key").HasMaxLength(50).IsRequired();
        builder.Property(r => r.OperatorKey).HasColumnName("operator_key").HasMaxLength(50).IsRequired();
        builder.Property(r => r.Values).HasColumnName("values").HasColumnType("text[]").IsRequired();
        builder.Property(r => r.Type).HasColumnName("type").HasConversion<short>();
        builder.Property(r => r.Message).HasColumnName("message").HasMaxLength(200).IsRequired();
        builder.Property(r => r.IsActive).HasColumnName("is_active");
        builder.Property(r => r.Position).HasColumnName("position");

        // The same check twice in one group is refused by the database as well as by validation.
        // Values are stored in canonical form, so equal rules have equal arrays.
        builder.HasIndex(r => new { r.GroupId, r.FieldKey, r.OperatorKey, r.Values })
            .IsUnique()
            .HasDatabaseName("ux_rules_group_field_operator_values");

        builder.HasIndex(r => r.FieldKey).HasDatabaseName("ix_rules_field_key");

        // The migration makes this key DEFERRABLE INITIALLY DEFERRED (EF cannot say so): a campaign's exam
        // subjects are deleted with the campaign, and so are its rules, and a key checked at once would
        // refuse to delete a subject before its rules had gone. A subject a rule uses is still refused, at commit.
        builder.HasOne<FieldDefinition>().WithMany().HasForeignKey(r => r.FieldKey).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne<OperatorDefinition>().WithMany().HasForeignKey(r => r.OperatorKey).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AuditEntryConfiguration : IEntityTypeConfiguration<EligibilityAuditEntry>
{
    public void Configure(EntityTypeBuilder<EligibilityAuditEntry> builder)
    {
        builder.ToTable("audit_log", table =>
        {
            table.HasCheckConstraint("ck_audit_log_entity", "entity IN (0, 1, 2, 3)");
            table.HasCheckConstraint("ck_audit_log_action", "action IN (0, 1, 2, 3, 4)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(a => a.CampaignId).HasColumnName("campaign_id").IsRequired();
        builder.Property(a => a.Entity).HasColumnName("entity").HasConversion<short>();
        builder.Property(a => a.EntityId).HasColumnName("entity_id");
        builder.Property(a => a.Action).HasColumnName("action").HasConversion<short>();
        builder.Property(a => a.BeforeJson).HasColumnName("before").HasColumnType("jsonb");
        builder.Property(a => a.AfterJson).HasColumnName("after").HasColumnType("jsonb");
        builder.Property(a => a.ChangedById).HasColumnName("changed_by_id").HasMaxLength(100).IsRequired();
        builder.Property(a => a.ChangedByName).HasColumnName("changed_by_name").HasMaxLength(200).IsRequired();
        builder.Property(a => a.ChangedAt).HasColumnName("changed_at").IsRequired();

        // "What changed on this campaign, newest first" and "history of this one rule".
        builder.HasIndex(a => new { a.CampaignId, a.ChangedAt }).HasDatabaseName("ix_audit_log_campaign_changed_at");
        builder.HasIndex(a => a.EntityId).HasDatabaseName("ix_audit_log_entity_id");
    }
}
