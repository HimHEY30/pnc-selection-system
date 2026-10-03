using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Candidates.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCandidates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "candidates");

            migrationBuilder.CreateTable(
                name: "audit_log",
                schema: "candidates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    candidate_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<short>(type: "smallint", nullable: false),
                    before = table.Column<string>(type: "jsonb", nullable: true),
                    after = table.Column<string>(type: "jsonb", nullable: true),
                    changed_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    changed_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_log", x => x.id);
                    table.CheckConstraint("ck_audit_log_action", "action IN (1, 2, 3)");
                });

            migrationBuilder.CreateTable(
                name: "candidates",
                schema: "candidates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_km = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    gender = table.Column<short>(type: "smallint", nullable: false),
                    date_of_birth = table.Column<DateOnly>(type: "date", nullable: false),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    province_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    province_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    district_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    district_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    commune_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    commune_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    village_code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    village_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    school_host_id = table.Column<Guid>(type: "uuid", nullable: true),
                    school_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    has_ngo_support = table.Column<bool>(type: "boolean", nullable: false),
                    ngo_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    created_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_candidates", x => x.id);
                    table.CheckConstraint("ck_candidates_address_codes", "((province_code IS NULL) = (district_code IS NULL) AND (province_code IS NULL) = (commune_code IS NULL)) AND (village_code IS NULL OR (village_name IS NOT NULL AND province_code IS NOT NULL))");
                    table.CheckConstraint("ck_candidates_address_names", "length(btrim(province_name)) > 0 AND length(btrim(district_name)) > 0 AND length(btrim(commune_name)) > 0 AND (village_name IS NULL OR length(btrim(village_name)) > 0)");
                    table.CheckConstraint("ck_candidates_gender", "gender IN (1, 2)");
                    table.CheckConstraint("ck_candidates_names", "length(btrim(name_km)) > 0 AND length(btrim(name_en)) > 0");
                    table.CheckConstraint("ck_candidates_ngo", "(has_ngo_support AND ngo_name IS NOT NULL AND length(btrim(ngo_name)) > 0) OR (NOT has_ngo_support AND ngo_name IS NULL)");
                    table.CheckConstraint("ck_candidates_phone", "phone ~ '^0[1-9][0-9]{7,8}$'");
                    table.CheckConstraint("ck_candidates_school", "length(btrim(school_name)) > 0");
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_campaign_changed_at",
                schema: "candidates",
                table: "audit_log",
                columns: new[] { "campaign_id", "changed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_candidate_id",
                schema: "candidates",
                table: "audit_log",
                column: "candidate_id");

            migrationBuilder.CreateIndex(
                name: "ix_candidates_campaign_created",
                schema: "candidates",
                table: "candidates",
                columns: new[] { "campaign_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_candidates_campaign_province",
                schema: "candidates",
                table: "candidates",
                columns: new[] { "campaign_id", "province_name" });

            migrationBuilder.CreateIndex(
                name: "ix_candidates_campaign_session",
                schema: "candidates",
                table: "candidates",
                columns: new[] { "campaign_id", "session_id" });

            migrationBuilder.CreateIndex(
                name: "ux_candidates_campaign_phone",
                schema: "candidates",
                table: "candidates",
                columns: new[] { "campaign_id", "phone" },
                unique: true);

            // Written by hand: the campaigns and sessions tables belong to other modules' contexts, so EF cannot
            // model these links. The Campaigns and Sessions migrations always run first (see Program.cs).
            // Deleting a campaign takes its candidates (and their audit lines) with it.
            migrationBuilder.AddForeignKey(
                name: "fk_candidates_campaigns_campaign_id",
                schema: "candidates",
                table: "candidates",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            // Deleting a session only clears where the candidate said they came from; the candidate stays.
            migrationBuilder.AddForeignKey(
                name: "fk_candidates_information_sessions_session_id",
                schema: "candidates",
                table: "candidates",
                column: "session_id",
                principalSchema: "sessions",
                principalTable: "information_sessions",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_audit_log_campaigns_campaign_id",
                schema: "candidates",
                table: "audit_log",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_log",
                schema: "candidates");

            migrationBuilder.DropTable(
                name: "candidates",
                schema: "candidates");
        }
    }
}
