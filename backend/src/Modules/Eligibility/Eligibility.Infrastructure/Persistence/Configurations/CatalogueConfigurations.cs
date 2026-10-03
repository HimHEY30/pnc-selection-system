using Eligibility.Domain.Catalogue;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Eligibility.Infrastructure.Persistence.Configurations;

/// <summary>
/// The field catalogue tables. Their rows are the catalogue: the first migration seeds the
/// launch fields, options and operators from <see cref="LaunchCatalogue"/>, and a new field
/// later is just another row (plus a migration that inserts it).
/// </summary>
internal sealed class FieldConfiguration : IEntityTypeConfiguration<FieldDefinition>
{
    public void Configure(EntityTypeBuilder<FieldDefinition> builder)
    {
        builder.ToTable("fields", table =>
        {
            table.HasCheckConstraint("ck_fields_value_type", "value_type IN (1, 2, 3, 4)");
            table.HasCheckConstraint("ck_fields_decimals", "decimals >= 0");

            // A campaign's exam subject has both a campaign and a name; a shared field has neither.
            table.HasCheckConstraint("ck_fields_subject", "(campaign_id IS NULL) = (subject_name IS NULL)");
        });

        builder.HasKey(f => f.Key);
        builder.Property(f => f.Key).HasColumnName("key").HasMaxLength(50);
        builder.Property(f => f.Label).HasColumnName("label").HasMaxLength(100).IsRequired();
        builder.Property(f => f.ValueType).HasColumnName("value_type").HasConversion<short>();
        builder.Property(f => f.OptionsSource).HasColumnName("options_source").HasConversion<short?>();
        builder.Property(f => f.Derivation).HasColumnName("derivation").HasConversion<short>();
        builder.Property(f => f.CandidateAttribute).HasColumnName("candidate_attribute").HasMaxLength(50).IsRequired();
        builder.Property(f => f.Unit).HasColumnName("unit").HasMaxLength(20);
        builder.Property(f => f.Decimals).HasColumnName("decimals");
        builder.Property(f => f.MinValue).HasColumnName("min_value").HasPrecision(18, 4);
        builder.Property(f => f.MaxValue).HasColumnName("max_value").HasPrecision(18, 4);
        builder.Property(f => f.Position).HasColumnName("position");

        // A foreign key to campaigns.campaigns is added by hand in the migration (another module's table).
        builder.Property(f => f.CampaignId).HasColumnName("campaign_id");
        builder.Property(f => f.SubjectName).HasColumnName("subject_name").HasMaxLength(ExamSubjects.NameMax);

        // "This campaign's subjects" is asked every time the page opens. A unique index on the name
        // (ignoring case) is added by hand in the migration: EF cannot describe an expression index.
        builder.HasIndex(f => f.CampaignId).HasDatabaseName("ix_fields_campaign_id");

        builder.HasMany(f => f.Options)
            .WithOne()
            .HasForeignKey(o => o.FieldKey)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(f => f.Options).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasData(LaunchCatalogue.Fields.Select(f => new
        {
            f.Key,
            f.Label,
            f.ValueType,
            f.OptionsSource,
            f.Derivation,
            f.CandidateAttribute,
            f.Unit,
            f.Decimals,
            f.MinValue,
            f.MaxValue,
            f.Position,
        }));
    }
}

internal sealed class ExamSetupConfiguration : IEntityTypeConfiguration<ExamSetup>
{
    public void Configure(EntityTypeBuilder<ExamSetup> builder)
    {
        builder.ToTable("exam_setups");

        // One row per campaign. The foreign key to campaigns.campaigns is added by hand in the migration.
        builder.HasKey(s => s.CampaignId);
        builder.Property(s => s.CampaignId).HasColumnName("campaign_id").ValueGeneratedNever();
        builder.Property(s => s.CreatedAt).HasColumnName("created_at").IsRequired();
    }
}

internal sealed class FieldOptionConfiguration : IEntityTypeConfiguration<FieldOption>
{
    public void Configure(EntityTypeBuilder<FieldOption> builder)
    {
        builder.ToTable("field_options");

        builder.HasKey(o => new { o.FieldKey, o.Key });
        builder.Property(o => o.FieldKey).HasColumnName("field_key").HasMaxLength(50);
        builder.Property(o => o.Key).HasColumnName("key").HasMaxLength(50);
        builder.Property(o => o.Label).HasColumnName("label").HasMaxLength(100).IsRequired();
        builder.Property(o => o.Position).HasColumnName("position");

        builder.HasData(LaunchCatalogue.Fields
            .SelectMany(f => f.Options)
            .Select(o => new { o.FieldKey, o.Key, o.Label, o.Position }));
    }
}

internal sealed class OperatorConfiguration : IEntityTypeConfiguration<OperatorDefinition>
{
    public void Configure(EntityTypeBuilder<OperatorDefinition> builder)
    {
        builder.ToTable("operators", table =>
        {
            table.HasCheckConstraint("ck_operators_value_type", "value_type IN (1, 2, 3, 4)");
            table.HasCheckConstraint("ck_operators_arity", "arity IN (0, 1, 2, 3)");
        });

        builder.HasKey(o => o.Key);
        builder.Property(o => o.Key).HasColumnName("key").HasMaxLength(50);
        builder.Property(o => o.Label).HasColumnName("label").HasMaxLength(100).IsRequired();
        builder.Property(o => o.ValueType).HasColumnName("value_type").HasConversion<short>();
        builder.Property(o => o.Arity).HasColumnName("arity").HasConversion<short>();
        builder.Property(o => o.Position).HasColumnName("position");

        // "Which operators does a field of this type offer" is asked every time the builder opens.
        builder.HasIndex(o => o.ValueType).HasDatabaseName("ix_operators_value_type");

        builder.HasData(OperatorDefinition.Defaults.Select(o => new { o.Key, o.Label, o.ValueType, o.Arity, o.Position }));
    }
}
