using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Eligibility.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialEligibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "eligibility");

            migrationBuilder.CreateTable(
                name: "audit_log",
                schema: "eligibility",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity = table.Column<short>(type: "smallint", nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.CheckConstraint("ck_audit_log_action", "action IN (0, 1, 2, 3, 4)");
                    table.CheckConstraint("ck_audit_log_entity", "entity IN (0, 1, 2)");
                });

            migrationBuilder.CreateTable(
                name: "fields",
                schema: "eligibility",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    value_type = table.Column<short>(type: "smallint", nullable: false),
                    options_source = table.Column<short>(type: "smallint", nullable: true),
                    derivation = table.Column<short>(type: "smallint", nullable: false),
                    candidate_attribute = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    decimals = table.Column<int>(type: "integer", nullable: false),
                    min_value = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    max_value = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fields", x => x.key);
                    table.CheckConstraint("ck_fields_decimals", "decimals >= 0");
                    table.CheckConstraint("ck_fields_value_type", "value_type IN (1, 2, 3, 4)");
                });

            migrationBuilder.CreateTable(
                name: "operators",
                schema: "eligibility",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    value_type = table.Column<short>(type: "smallint", nullable: false),
                    arity = table.Column<short>(type: "smallint", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_operators", x => x.key);
                    table.CheckConstraint("ck_operators_arity", "arity IN (0, 1, 2, 3)");
                    table.CheckConstraint("ck_operators_value_type", "value_type IN (1, 2, 3, 4)");
                });

            migrationBuilder.CreateTable(
                name: "rule_sets",
                schema: "eligibility",
                columns: table => new
                {
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    age_reference_date = table.Column<DateOnly>(type: "date", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    updated_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rule_sets", x => x.campaign_id);
                });

            migrationBuilder.CreateTable(
                name: "field_options",
                schema: "eligibility",
                columns: table => new
                {
                    field_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_field_options", x => new { x.field_key, x.key });
                    table.ForeignKey(
                        name: "FK_field_options_fields_field_key",
                        column: x => x.field_key,
                        principalSchema: "eligibility",
                        principalTable: "fields",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rule_groups",
                schema: "eligibility",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    logic = table.Column<short>(type: "smallint", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rule_groups", x => x.id);
                    table.CheckConstraint("ck_rule_groups_logic", "logic IN (1, 2)");
                    table.CheckConstraint("ck_rule_groups_position", "position >= 0");
                    table.ForeignKey(
                        name: "FK_rule_groups_rule_sets_campaign_id",
                        column: x => x.campaign_id,
                        principalSchema: "eligibility",
                        principalTable: "rule_sets",
                        principalColumn: "campaign_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rules",
                schema: "eligibility",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    field_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    operator_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    values = table.Column<string[]>(type: "text[]", nullable: false),
                    type = table.Column<short>(type: "smallint", nullable: false),
                    message = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rules", x => x.id);
                    table.CheckConstraint("ck_rules_message", "length(btrim(message)) > 0");
                    table.CheckConstraint("ck_rules_position", "position >= 0");
                    table.CheckConstraint("ck_rules_type", "type IN (1, 2)");
                    table.ForeignKey(
                        name: "FK_rules_fields_field_key",
                        column: x => x.field_key,
                        principalSchema: "eligibility",
                        principalTable: "fields",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_rules_operators_operator_key",
                        column: x => x.operator_key,
                        principalSchema: "eligibility",
                        principalTable: "operators",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_rules_rule_groups_group_id",
                        column: x => x.group_id,
                        principalSchema: "eligibility",
                        principalTable: "rule_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "eligibility",
                table: "fields",
                columns: new[] { "key", "candidate_attribute", "decimals", "derivation", "label", "max_value", "min_value", "options_source", "position", "unit", "value_type" },
                values: new object[,]
                {
                    { "age", "date_of_birth", 0, (short)1, "Age", 120m, 0m, null, 1, "years", (short)1 },
                    { "attended_info_session", "attended_info_session", 0, (short)0, "Attended an information session", null, null, null, 8, null, (short)3 },
                    { "family_income", "family_income", 2, (short)0, "Family monthly income", null, 0m, null, 6, "USD", (short)1 },
                    { "gender", "gender", 0, (short)0, "Gender", null, null, (short)1, 2, null, (short)2 },
                    { "grade12_result", "grade12_result", 0, (short)0, "Grade 12 exam result", null, null, (short)1, 5, null, (short)2 },
                    { "highest_grade", "highest_grade", 0, (short)0, "Highest grade completed", null, null, (short)1, 4, null, (short)2 },
                    { "marital_status", "marital_status", 0, (short)0, "Marital status", null, null, (short)1, 7, null, (short)2 },
                    { "province", "province", 0, (short)0, "Province", null, null, (short)2, 3, null, (short)2 }
                });

            migrationBuilder.InsertData(
                schema: "eligibility",
                table: "operators",
                columns: new[] { "key", "arity", "label", "position", "value_type" },
                values: new object[,]
                {
                    { "after", (short)1, "after", 2, (short)4 },
                    { "at_least", (short)1, "at least", 5, (short)1 },
                    { "at_most", (short)1, "at most", 3, (short)1 },
                    { "before", (short)1, "before", 1, (short)4 },
                    { "between", (short)2, "between", 6, (short)1 },
                    { "date_between", (short)2, "between", 3, (short)4 },
                    { "equals", (short)1, "equals", 1, (short)1 },
                    { "greater_than", (short)1, "greater than", 4, (short)1 },
                    { "is", (short)1, "is", 1, (short)2 },
                    { "is_no", (short)0, "is no", 2, (short)3 },
                    { "is_none_of", (short)3, "is none of", 4, (short)2 },
                    { "is_not", (short)1, "is not", 2, (short)2 },
                    { "is_one_of", (short)3, "is one of", 3, (short)2 },
                    { "is_yes", (short)0, "is yes", 1, (short)3 },
                    { "less_than", (short)1, "less than", 2, (short)1 }
                });

            migrationBuilder.InsertData(
                schema: "eligibility",
                table: "field_options",
                columns: new[] { "field_key", "key", "label", "position" },
                values: new object[,]
                {
                    { "gender", "female", "Female", 1 },
                    { "gender", "male", "Male", 2 },
                    { "grade12_result", "A", "A", 1 },
                    { "grade12_result", "B", "B", 2 },
                    { "grade12_result", "C", "C", 3 },
                    { "grade12_result", "D", "D", 4 },
                    { "grade12_result", "E", "E", 5 },
                    { "grade12_result", "F", "F", 6 },
                    { "highest_grade", "diploma_or_higher", "Diploma or higher", 5 },
                    { "highest_grade", "grade_10", "Grade 10", 2 },
                    { "highest_grade", "grade_11", "Grade 11", 3 },
                    { "highest_grade", "grade_12", "Grade 12", 4 },
                    { "highest_grade", "grade_9", "Grade 9", 1 },
                    { "marital_status", "divorced", "Divorced", 3 },
                    { "marital_status", "married", "Married", 2 },
                    { "marital_status", "single", "Single", 1 },
                    { "marital_status", "widowed", "Widowed", 4 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_campaign_changed_at",
                schema: "eligibility",
                table: "audit_log",
                columns: new[] { "campaign_id", "changed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_entity_id",
                schema: "eligibility",
                table: "audit_log",
                column: "entity_id");

            migrationBuilder.CreateIndex(
                name: "ix_operators_value_type",
                schema: "eligibility",
                table: "operators",
                column: "value_type");

            migrationBuilder.CreateIndex(
                name: "ix_rule_groups_campaign_position",
                schema: "eligibility",
                table: "rule_groups",
                columns: new[] { "campaign_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_rules_field_key",
                schema: "eligibility",
                table: "rules",
                column: "field_key");

            migrationBuilder.CreateIndex(
                name: "IX_rules_operator_key",
                schema: "eligibility",
                table: "rules",
                column: "operator_key");

            migrationBuilder.CreateIndex(
                name: "ux_rules_group_field_operator_values",
                schema: "eligibility",
                table: "rules",
                columns: new[] { "group_id", "field_key", "operator_key", "values" },
                unique: true);

            // Written by hand: campaigns.campaigns belongs to the Campaigns module and its context,
            // so EF cannot model these links. The Campaigns migration always runs first (see Program.cs).
            migrationBuilder.AddForeignKey(
                name: "fk_rule_sets_campaigns_campaign_id",
                schema: "eligibility",
                table: "rule_sets",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_audit_log_campaigns_campaign_id",
                schema: "eligibility",
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
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "field_options",
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "rules",
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "fields",
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "operators",
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "rule_groups",
                schema: "eligibility");

            migrationBuilder.DropTable(
                name: "rule_sets",
                schema: "eligibility");
        }
    }
}
