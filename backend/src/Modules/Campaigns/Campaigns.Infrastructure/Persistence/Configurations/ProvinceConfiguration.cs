using Campaigns.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Campaigns.Infrastructure.Persistence.Configurations;

internal sealed class ProvinceConfiguration : IEntityTypeConfiguration<Province>
{
    // Cambodia's 25 provinces and municipalities. Code is the ISO 3166-2:KH
    // subdivision code and the id is its number, so ids are stable across environments.
    internal static readonly (short Id, string Name)[] All =
    [
        (1, "Banteay Meanchey"),
        (2, "Battambang"),
        (3, "Kampong Cham"),
        (4, "Kampong Chhnang"),
        (5, "Kampong Speu"),
        (6, "Kampong Thom"),
        (7, "Kampot"),
        (8, "Kandal"),
        (9, "Koh Kong"),
        (10, "Kratie"),
        (11, "Mondulkiri"),
        (12, "Phnom Penh"),
        (13, "Preah Vihear"),
        (14, "Prey Veng"),
        (15, "Pursat"),
        (16, "Ratanakiri"),
        (17, "Siem Reap"),
        (18, "Preah Sihanouk"),
        (19, "Stung Treng"),
        (20, "Svay Rieng"),
        (21, "Takeo"),
        (22, "Oddar Meanchey"),
        (23, "Kep"),
        (24, "Pailin"),
        (25, "Tboung Khmum"),
    ];

    public void Configure(EntityTypeBuilder<Province> builder)
    {
        builder.ToTable("provinces");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(p => p.Code).HasColumnName("code").HasMaxLength(10).IsRequired();
        builder.Property(p => p.NameEn).HasColumnName("name_en").HasMaxLength(100).IsRequired();
        builder.Property(p => p.NameKm).HasColumnName("name_km").HasMaxLength(100);

        builder.HasIndex(p => p.Code).IsUnique().HasDatabaseName("ux_provinces_code");

        builder.HasData(All.Select(p => new { p.Id, Code = $"KH-{p.Id}", NameEn = p.Name }));
    }
}
