using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Eligibility.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExamSubjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_rules_fields_field_key",
                schema: "eligibility",
                table: "rules");

            migrationBuilder.DropCheckConstraint(
                name: "ck_audit_log_entity",
                schema: "eligibility",
                table: "audit_log");

            migrationBuilder.AddColumn<Guid>(
                name: "campaign_id",
                schema: "eligibility",
                table: "fields",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "subject_name",
                schema: "eligibility",
                table: "fields",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "exam_setups",
                schema: "eligibility",
                columns: table => new
                {
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_setups", x => x.campaign_id);
                });

            // The total and the average of a campaign's exam subjects: shared fields, so no campaign.
            migrationBuilder.InsertData(
                schema: "eligibility",
                table: "fields",
                columns: new[] { "key", "campaign_id", "candidate_attribute", "decimals", "derivation", "label", "max_value", "min_value", "options_source", "position", "subject_name", "unit", "value_type" },
                values: new object[,]
                {
                    { "exam_average", null, "exam_average", 2, (short)4, "Average exam score", 100m, 0m, null, 91, null, "points", (short)1 },
                    { "exam_total", null, "exam_total", 2, (short)3, "Total exam score", null, 0m, null, 90, null, "points", (short)1 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_fields_campaign_id",
                schema: "eligibility",
                table: "fields",
                column: "campaign_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_fields_subject",
                schema: "eligibility",
                table: "fields",
                sql: "(campaign_id IS NULL) = (subject_name IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_audit_log_entity",
                schema: "eligibility",
                table: "audit_log",
                sql: "entity IN (0, 1, 2, 3)");

            // Written by hand: the same link as before, but checked when the transaction commits. A campaign's
            // exam subjects are deleted with the campaign, and so are its rules; checked at once (RESTRICT or
            // NO ACTION), the database would refuse to delete a subject before its rules had gone. A subject
            // a rule still uses is still refused, at commit. EF cannot describe a deferred key.
            migrationBuilder.Sql(
                """
                ALTER TABLE eligibility.rules
                ADD CONSTRAINT "FK_rules_fields_field_key" FOREIGN KEY (field_key)
                REFERENCES eligibility.fields (key) DEFERRABLE INITIALLY DEFERRED;
                """);

            // Written by hand: a campaign's subjects cannot have the same name twice, ignoring case and
            // outer spaces. EF cannot describe an expression index.
            migrationBuilder.Sql(
                """
                CREATE UNIQUE INDEX ux_fields_campaign_subject_name
                ON eligibility.fields (campaign_id, lower(btrim(subject_name)))
                WHERE campaign_id IS NOT NULL;
                """);

            // Written by hand: campaigns.campaigns belongs to the Campaigns module and its context,
            // so EF cannot model these links. The Campaigns migration always runs first (see Program.cs).
            migrationBuilder.AddForeignKey(
                name: "fk_fields_campaigns_campaign_id",
                schema: "eligibility",
                table: "fields",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_exam_setups_campaigns_campaign_id",
                schema: "eligibility",
                table: "exam_setups",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_rules_fields_field_key",
                schema: "eligibility",
                table: "rules");

            migrationBuilder.DropTable(
                name: "exam_setups",
                schema: "eligibility");

            migrationBuilder.DropForeignKey(
                name: "fk_fields_campaigns_campaign_id",
                schema: "eligibility",
                table: "fields");

            migrationBuilder.Sql("DROP INDEX eligibility.ux_fields_campaign_subject_name;");

            migrationBuilder.DropIndex(
                name: "ix_fields_campaign_id",
                schema: "eligibility",
                table: "fields");

            migrationBuilder.DropCheckConstraint(
                name: "ck_fields_subject",
                schema: "eligibility",
                table: "fields");

            migrationBuilder.DropCheckConstraint(
                name: "ck_audit_log_entity",
                schema: "eligibility",
                table: "audit_log");

            migrationBuilder.DeleteData(
                schema: "eligibility",
                table: "fields",
                keyColumn: "key",
                keyValue: "exam_average");

            migrationBuilder.DeleteData(
                schema: "eligibility",
                table: "fields",
                keyColumn: "key",
                keyValue: "exam_total");

            migrationBuilder.DropColumn(
                name: "campaign_id",
                schema: "eligibility",
                table: "fields");

            migrationBuilder.DropColumn(
                name: "subject_name",
                schema: "eligibility",
                table: "fields");

            migrationBuilder.AddCheckConstraint(
                name: "ck_audit_log_entity",
                schema: "eligibility",
                table: "audit_log",
                sql: "entity IN (0, 1, 2)");

            migrationBuilder.AddForeignKey(
                name: "FK_rules_fields_field_key",
                schema: "eligibility",
                table: "rules",
                column: "field_key",
                principalSchema: "eligibility",
                principalTable: "fields",
                principalColumn: "key",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
