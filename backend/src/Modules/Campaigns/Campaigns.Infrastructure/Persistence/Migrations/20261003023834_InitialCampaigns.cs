using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Campaigns.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCampaigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "campaigns");

            migrationBuilder.CreateTable(
                name: "campaigns",
                schema: "campaigns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name_normalized = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    academic_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: true),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    expected_candidates = table.Column<int>(type: "integer", nullable: true),
                    seats_available = table.Column<int>(type: "integer", nullable: true),
                    created_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_campaigns", x => x.id);
                    table.CheckConstraint("ck_campaigns_dates", "start_date IS NULL OR end_date IS NULL OR end_date > start_date");
                    table.CheckConstraint("ck_campaigns_expected_candidates", "expected_candidates IS NULL OR expected_candidates > 0");
                    table.CheckConstraint("ck_campaigns_seats_available", "seats_available IS NULL OR seats_available > 0");
                    table.CheckConstraint("ck_campaigns_seats_within_expected", "seats_available IS NULL OR expected_candidates IS NULL OR seats_available <= expected_candidates");
                    table.CheckConstraint("ck_campaigns_status", "status IN (0, 1, 2)");
                });

            migrationBuilder.CreateTable(
                name: "provinces",
                schema: "campaigns",
                columns: table => new
                {
                    id = table.Column<short>(type: "smallint", nullable: false),
                    code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name_km = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_provinces", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "campaign_setup_steps",
                schema: "campaigns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    step = table.Column<short>(type: "smallint", nullable: false),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_campaign_setup_steps", x => x.id);
                    table.CheckConstraint("ck_campaign_setup_steps_status", "status IN (0, 1, 2)");
                    table.CheckConstraint("ck_campaign_setup_steps_step", "step BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "FK_campaign_setup_steps_campaigns_campaign_id",
                        column: x => x.campaign_id,
                        principalSchema: "campaigns",
                        principalTable: "campaigns",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "campaign_provinces",
                schema: "campaigns",
                columns: table => new
                {
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    province_id = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_campaign_provinces", x => new { x.campaign_id, x.province_id });
                    table.ForeignKey(
                        name: "FK_campaign_provinces_campaigns_campaign_id",
                        column: x => x.campaign_id,
                        principalSchema: "campaigns",
                        principalTable: "campaigns",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_campaign_provinces_provinces_province_id",
                        column: x => x.province_id,
                        principalSchema: "campaigns",
                        principalTable: "provinces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "campaigns",
                table: "provinces",
                columns: new[] { "id", "code", "name_en", "name_km" },
                values: new object[,]
                {
                    { (short)1, "KH-1", "Banteay Meanchey", null },
                    { (short)2, "KH-2", "Battambang", null },
                    { (short)3, "KH-3", "Kampong Cham", null },
                    { (short)4, "KH-4", "Kampong Chhnang", null },
                    { (short)5, "KH-5", "Kampong Speu", null },
                    { (short)6, "KH-6", "Kampong Thom", null },
                    { (short)7, "KH-7", "Kampot", null },
                    { (short)8, "KH-8", "Kandal", null },
                    { (short)9, "KH-9", "Koh Kong", null },
                    { (short)10, "KH-10", "Kratie", null },
                    { (short)11, "KH-11", "Mondulkiri", null },
                    { (short)12, "KH-12", "Phnom Penh", null },
                    { (short)13, "KH-13", "Preah Vihear", null },
                    { (short)14, "KH-14", "Prey Veng", null },
                    { (short)15, "KH-15", "Pursat", null },
                    { (short)16, "KH-16", "Ratanakiri", null },
                    { (short)17, "KH-17", "Siem Reap", null },
                    { (short)18, "KH-18", "Preah Sihanouk", null },
                    { (short)19, "KH-19", "Stung Treng", null },
                    { (short)20, "KH-20", "Svay Rieng", null },
                    { (short)21, "KH-21", "Takeo", null },
                    { (short)22, "KH-22", "Oddar Meanchey", null },
                    { (short)23, "KH-23", "Kep", null },
                    { (short)24, "KH-24", "Pailin", null },
                    { (short)25, "KH-25", "Tboung Khmum", null }
                });

            migrationBuilder.CreateIndex(
                name: "ix_campaign_provinces_province_id",
                schema: "campaigns",
                table: "campaign_provinces",
                column: "province_id");

            migrationBuilder.CreateIndex(
                name: "ux_campaign_setup_steps_campaign_step",
                schema: "campaigns",
                table: "campaign_setup_steps",
                columns: new[] { "campaign_id", "step" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_campaigns_created_at",
                schema: "campaigns",
                table: "campaigns",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_campaigns_name_normalized",
                schema: "campaigns",
                table: "campaigns",
                column: "name_normalized",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_campaigns_status",
                schema: "campaigns",
                table: "campaigns",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_provinces_code",
                schema: "campaigns",
                table: "provinces",
                column: "code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "campaign_provinces",
                schema: "campaigns");

            migrationBuilder.DropTable(
                name: "campaign_setup_steps",
                schema: "campaigns");

            migrationBuilder.DropTable(
                name: "provinces",
                schema: "campaigns");

            migrationBuilder.DropTable(
                name: "campaigns",
                schema: "campaigns");
        }
    }
}
