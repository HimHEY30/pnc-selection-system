using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sessions.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowUnscheduledSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_host_shape",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_host_type",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "start_time",
                schema: "sessions",
                table: "information_sessions",
                type: "time without time zone",
                nullable: true,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "session_date",
                schema: "sessions",
                table: "information_sessions",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<short>(
                name: "host_type",
                schema: "sessions",
                table: "information_sessions",
                type: "smallint",
                nullable: true,
                oldClrType: typeof(short),
                oldType: "smallint");

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "end_time",
                schema: "sessions",
                table: "information_sessions",
                type: "time without time zone",
                nullable: true,
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone");

            migrationBuilder.AlterColumn<string>(
                name: "assignee_name",
                schema: "sessions",
                table: "information_sessions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "assignee_id",
                schema: "sessions",
                table: "information_sessions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100);

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_host_shape",
                schema: "sessions",
                table: "information_sessions",
                sql: "(host_type IS NULL AND host_user_id IS NULL AND host_user_name IS NULL AND host_id IS NULL) OR (host_type = 1 AND host_user_id IS NOT NULL AND host_user_name IS NOT NULL AND host_id IS NULL) OR (host_type IN (2, 3) AND host_id IS NOT NULL AND host_user_id IS NULL AND host_user_name IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_host_type",
                schema: "sessions",
                table: "information_sessions",
                sql: "host_type IS NULL OR host_type IN (1, 2, 3)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_scheduled",
                schema: "sessions",
                table: "information_sessions",
                sql: "(session_date IS NULL) = (start_time IS NULL) AND (session_date IS NULL) = (end_time IS NULL) AND (session_date IS NULL) = (assignee_id IS NULL) AND (session_date IS NULL) = (assignee_name IS NULL) AND (session_date IS NULL) = (host_type IS NULL) AND (session_date IS NOT NULL OR status IN (3, 4))");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "sessions",
                table: "information_sessions",
                sql: "status IN (1, 2, 3, 4)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Going back would have to invent a date, times, person and host for sessions that have none. Refuse
            // instead: schedule or delete those sessions first.
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM sessions.information_sessions WHERE session_date IS NULL) THEN
                        RAISE EXCEPTION 'Cannot undo AllowUnscheduledSessions: some sessions have no date yet. Schedule or delete them first.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_host_shape",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_host_type",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_scheduled",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "sessions",
                table: "information_sessions");

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "start_time",
                schema: "sessions",
                table: "information_sessions",
                type: "time without time zone",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0),
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "session_date",
                schema: "sessions",
                table: "information_sessions",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1),
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<short>(
                name: "host_type",
                schema: "sessions",
                table: "information_sessions",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0,
                oldClrType: typeof(short),
                oldType: "smallint",
                oldNullable: true);

            migrationBuilder.AlterColumn<TimeOnly>(
                name: "end_time",
                schema: "sessions",
                table: "information_sessions",
                type: "time without time zone",
                nullable: false,
                defaultValue: new TimeOnly(0, 0, 0),
                oldClrType: typeof(TimeOnly),
                oldType: "time without time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "assignee_name",
                schema: "sessions",
                table: "information_sessions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "assignee_id",
                schema: "sessions",
                table: "information_sessions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100,
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_host_shape",
                schema: "sessions",
                table: "information_sessions",
                sql: "(host_type = 1 AND host_user_id IS NOT NULL AND host_user_name IS NOT NULL AND host_id IS NULL) OR (host_type IN (2, 3) AND host_id IS NOT NULL AND host_user_id IS NULL AND host_user_name IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_host_type",
                schema: "sessions",
                table: "information_sessions",
                sql: "host_type IN (1, 2, 3)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "sessions",
                table: "information_sessions",
                sql: "status IN (1, 2, 3)");
        }
    }
}
