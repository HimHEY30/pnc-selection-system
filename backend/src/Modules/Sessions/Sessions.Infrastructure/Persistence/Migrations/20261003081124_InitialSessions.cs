using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sessions.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "sessions");

            migrationBuilder.CreateTable(
                name: "audit_log",
                schema: "sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.CheckConstraint("ck_audit_log_action", "action IN (1, 2, 3, 4, 5, 6, 7)");
                    table.CheckConstraint("ck_audit_log_entity", "entity IN (1, 2)");
                });

            migrationBuilder.CreateTable(
                name: "hosts",
                schema: "sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<short>(type: "smallint", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    name_normalized = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    partner_kind = table.Column<short>(type: "smallint", nullable: true),
                    contact_person = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    email = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hosts", x => x.id);
                    table.CheckConstraint("ck_hosts_contact", "phone IS NOT NULL OR email IS NOT NULL");
                    table.CheckConstraint("ck_hosts_name", "length(btrim(name)) > 0");
                    table.CheckConstraint("ck_hosts_partner_kind", "(type = 3) = (partner_kind IS NOT NULL) AND (partner_kind IS NULL OR partner_kind IN (1, 2, 3, 4))");
                    table.CheckConstraint("ck_hosts_type", "type IN (2, 3)");
                });

            migrationBuilder.CreateTable(
                name: "information_sessions",
                schema: "sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    campaign_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    session_date = table.Column<DateOnly>(type: "date", nullable: false),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    format = table.Column<short>(type: "smallint", nullable: false),
                    venue = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    meeting_link = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    province_id = table.Column<short>(type: "smallint", nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    assignee_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    assignee_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    host_type = table.Column<short>(type: "smallint", nullable: false),
                    host_id = table.Column<Guid>(type: "uuid", nullable: true),
                    host_user_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    host_user_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    cancel_reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    expected_candidates = table.Column<int>(type: "integer", nullable: true),
                    actual_female = table.Column<int>(type: "integer", nullable: true),
                    actual_male = table.Column<int>(type: "integer", nullable: true),
                    attendance_recorded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    attendance_recorded_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    attendance_recorded_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_by_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_information_sessions", x => x.id);
                    table.CheckConstraint("ck_sessions_attendance", "(actual_female IS NULL) = (actual_male IS NULL) AND (actual_female IS NULL OR (actual_female BETWEEN 0 AND 5000 AND actual_male BETWEEN 0 AND 5000)) AND (status <> 2 OR actual_female IS NOT NULL) AND ((actual_female IS NULL) = (attendance_recorded_at IS NULL))");
                    table.CheckConstraint("ck_sessions_cancel_reason", "(status = 3) = (cancel_reason IS NOT NULL)");
                    table.CheckConstraint("ck_sessions_expected", "expected_candidates IS NULL OR expected_candidates BETWEEN 0 AND 5000");
                    table.CheckConstraint("ck_sessions_format", "format IN (1, 2, 3)");
                    table.CheckConstraint("ck_sessions_host_shape", "(host_type = 1 AND host_user_id IS NOT NULL AND host_user_name IS NOT NULL AND host_id IS NULL) OR (host_type IN (2, 3) AND host_id IS NOT NULL AND host_user_id IS NULL AND host_user_name IS NULL)");
                    table.CheckConstraint("ck_sessions_host_type", "host_type IN (1, 2, 3)");
                    table.CheckConstraint("ck_sessions_link", "format = 1 OR meeting_link IS NOT NULL");
                    table.CheckConstraint("ck_sessions_status", "status IN (1, 2, 3)");
                    table.CheckConstraint("ck_sessions_times", "end_time > start_time");
                    table.CheckConstraint("ck_sessions_title", "length(btrim(title)) > 0");
                    table.CheckConstraint("ck_sessions_venue", "format = 2 OR venue IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_information_sessions_hosts_host_id",
                        column: x => x.host_id,
                        principalSchema: "sessions",
                        principalTable: "hosts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_campaign_changed_at",
                schema: "sessions",
                table: "audit_log",
                columns: new[] { "campaign_id", "changed_at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_entity_id",
                schema: "sessions",
                table: "audit_log",
                column: "entity_id");

            migrationBuilder.CreateIndex(
                name: "ux_hosts_type_name",
                schema: "sessions",
                table: "hosts",
                columns: new[] { "type", "name_normalized" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sessions_assignee_date",
                schema: "sessions",
                table: "information_sessions",
                columns: new[] { "assignee_id", "session_date" });

            migrationBuilder.CreateIndex(
                name: "ix_sessions_campaign_date",
                schema: "sessions",
                table: "information_sessions",
                columns: new[] { "campaign_id", "session_date", "start_time" });

            migrationBuilder.CreateIndex(
                name: "ix_sessions_host_date",
                schema: "sessions",
                table: "information_sessions",
                columns: new[] { "host_id", "session_date" });

            migrationBuilder.CreateIndex(
                name: "ix_sessions_host_user_date",
                schema: "sessions",
                table: "information_sessions",
                columns: new[] { "host_user_id", "session_date" });

            // Written by hand: the campaigns and provinces tables belong to the Campaigns module's context,
            // so EF cannot model these links. The Campaigns migration always runs first (see Program.cs).
            // Deleting a campaign takes its sessions (and their audit lines) with it.
            migrationBuilder.AddForeignKey(
                name: "fk_information_sessions_campaigns_campaign_id",
                schema: "sessions",
                table: "information_sessions",
                column: "campaign_id",
                principalSchema: "campaigns",
                principalTable: "campaigns",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_information_sessions_provinces_province_id",
                schema: "sessions",
                table: "information_sessions",
                column: "province_id",
                principalSchema: "campaigns",
                principalTable: "provinces",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_audit_log_campaigns_campaign_id",
                schema: "sessions",
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
                schema: "sessions");

            migrationBuilder.DropTable(
                name: "information_sessions",
                schema: "sessions");

            migrationBuilder.DropTable(
                name: "hosts",
                schema: "sessions");
        }
    }
}
