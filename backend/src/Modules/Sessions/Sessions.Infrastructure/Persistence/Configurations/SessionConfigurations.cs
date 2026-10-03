using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sessions.Domain;

namespace Sessions.Infrastructure.Persistence.Configurations;

internal sealed class SessionHostConfiguration : IEntityTypeConfiguration<SessionHost>
{
    public void Configure(EntityTypeBuilder<SessionHost> builder)
    {
        builder.ToTable("hosts", table =>
        {
            // Officers are not directory records: only alumni (2) and partners (3).
            table.HasCheckConstraint("ck_hosts_type", "type IN (2, 3)");
            table.HasCheckConstraint("ck_hosts_partner_kind", "(type = 3) = (partner_kind IS NOT NULL) AND (partner_kind IS NULL OR partner_kind IN (1, 2, 3, 4))");
            table.HasCheckConstraint("ck_hosts_contact", "phone IS NOT NULL OR email IS NOT NULL");
            table.HasCheckConstraint("ck_hosts_name", "length(btrim(name)) > 0");
        });

        builder.HasKey(h => h.Id);
        builder.Property(h => h.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(h => h.Type).HasColumnName("type").HasConversion<short>();
        builder.Property(h => h.Name).HasColumnName("name").HasMaxLength(SessionLimits.HostNameMax).IsRequired();
        builder.Property(h => h.NameNormalized).HasColumnName("name_normalized").HasMaxLength(SessionLimits.HostNameMax).IsRequired();
        builder.Property(h => h.PartnerKind).HasColumnName("partner_kind").HasConversion<short?>();
        builder.Property(h => h.ContactPerson).HasColumnName("contact_person").HasMaxLength(SessionLimits.ContactMax);
        builder.Property(h => h.Phone).HasColumnName("phone").HasMaxLength(SessionLimits.PhoneMax);
        builder.Property(h => h.Email).HasColumnName("email").HasMaxLength(SessionLimits.EmailMax);
        builder.Property(h => h.IsActive).HasColumnName("is_active");
        builder.Property(h => h.CreatedById).HasColumnName("created_by_id").HasMaxLength(100).IsRequired();
        builder.Property(h => h.CreatedByName).HasColumnName("created_by_name").HasMaxLength(200).IsRequired();
        builder.Property(h => h.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(h => h.UpdatedAt).HasColumnName("updated_at").IsRequired();

        // PostgreSQL's xmin changes on every update, so it works as a concurrency token for free.
        builder.Property(h => h.Version)
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();

        // One alumnus or partner per name, ignoring case.
        builder.HasIndex(h => new { h.Type, h.NameNormalized })
            .IsUnique()
            .HasDatabaseName("ux_hosts_type_name");
    }
}

internal sealed class InformationSessionConfiguration : IEntityTypeConfiguration<InformationSession>
{
    public void Configure(EntityTypeBuilder<InformationSession> builder)
    {
        builder.ToTable("information_sessions", table =>
        {
            table.HasCheckConstraint("ck_sessions_status", "status IN (1, 2, 3, 4)");
            table.HasCheckConstraint("ck_sessions_format", "format IN (1, 2, 3)");
            table.HasCheckConstraint("ck_sessions_host_type", "host_type IS NULL OR host_type IN (1, 2, 3)");
            table.HasCheckConstraint("ck_sessions_title", "length(btrim(title)) > 0");
            table.HasCheckConstraint("ck_sessions_times", "end_time > start_time");

            // The date, times, person responsible and host go together: all there, or all empty. Only an Unscheduled
            // session (a copy not yet scheduled), or one cancelled before it was scheduled, has them empty; a Planned or
            // Done session always has them.
            table.HasCheckConstraint(
                "ck_sessions_scheduled",
                "(session_date IS NULL) = (start_time IS NULL) "
                + "AND (session_date IS NULL) = (end_time IS NULL) "
                + "AND (session_date IS NULL) = (assignee_id IS NULL) "
                + "AND (session_date IS NULL) = (assignee_name IS NULL) "
                + "AND (session_date IS NULL) = (host_type IS NULL) "
                + "AND (session_date IS NOT NULL OR status IN (3, 4))");

            // In person and hybrid need a venue; online and hybrid need a link.
            table.HasCheckConstraint("ck_sessions_venue", "format = 2 OR venue IS NOT NULL");
            table.HasCheckConstraint("ck_sessions_link", "format = 1 OR meeting_link IS NOT NULL");

            // An officer host is a user; an alumnus or a partner is a directory record. Never both, and neither only
            // while the session has no host yet.
            table.HasCheckConstraint(
                "ck_sessions_host_shape",
                "(host_type IS NULL AND host_user_id IS NULL AND host_user_name IS NULL AND host_id IS NULL) "
                + "OR (host_type = 1 AND host_user_id IS NOT NULL AND host_user_name IS NOT NULL AND host_id IS NULL) "
                + "OR (host_type IN (2, 3) AND host_id IS NOT NULL AND host_user_id IS NULL AND host_user_name IS NULL)");

            // A cancelled session has a reason, and only a cancelled one does.
            table.HasCheckConstraint("ck_sessions_cancel_reason", "(status = 3) = (cancel_reason IS NOT NULL)");

            table.HasCheckConstraint("ck_sessions_expected", "expected_candidates IS NULL OR expected_candidates BETWEEN 0 AND 5000");

            // Females and males come as a pair, and a Done session always has them.
            table.HasCheckConstraint(
                "ck_sessions_attendance",
                "(actual_female IS NULL) = (actual_male IS NULL) "
                + "AND (actual_female IS NULL OR (actual_female BETWEEN 0 AND 5000 AND actual_male BETWEEN 0 AND 5000)) "
                + "AND (status <> 2 OR actual_female IS NOT NULL) "
                + "AND ((actual_female IS NULL) = (attendance_recorded_at IS NULL))");
        });

        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();

        // A foreign key to campaigns.campaigns is added by hand in the migration: that table belongs to
        // another module's context, so EF cannot model the link.
        builder.Property(s => s.CampaignId).HasColumnName("campaign_id").IsRequired();
        builder.Property(s => s.Title).HasColumnName("title").HasMaxLength(SessionLimits.TitleMax).IsRequired();
        builder.Property(s => s.Date).HasColumnName("session_date").HasColumnType("date");
        builder.Property(s => s.StartTime).HasColumnName("start_time").HasColumnType("time without time zone");
        builder.Property(s => s.EndTime).HasColumnName("end_time").HasColumnType("time without time zone");
        builder.Property(s => s.Format).HasColumnName("format").HasConversion<short>();
        builder.Property(s => s.Venue).HasColumnName("venue").HasMaxLength(SessionLimits.VenueMax);
        builder.Property(s => s.MeetingLink).HasColumnName("meeting_link").HasMaxLength(SessionLimits.MeetingLinkMax);

        // A foreign key to campaigns.provinces is added by hand in the migration, for the same reason.
        builder.Property(s => s.ProvinceId).HasColumnName("province_id");
        builder.Property(s => s.Notes).HasColumnName("notes").HasMaxLength(SessionLimits.NotesMax);
        builder.Property(s => s.AssigneeId).HasColumnName("assignee_id").HasMaxLength(100);
        builder.Property(s => s.AssigneeName).HasColumnName("assignee_name").HasMaxLength(200);

        builder.Property(s => s.HostType).HasColumnName("host_type").HasConversion<short?>();
        builder.Property(s => s.HostId).HasColumnName("host_id");
        builder.Property(s => s.HostUserId).HasColumnName("host_user_id").HasMaxLength(100);
        builder.Property(s => s.HostUserName).HasColumnName("host_user_name").HasMaxLength(200);

        builder.Property(s => s.Status).HasColumnName("status").HasConversion<short>();
        builder.Property(s => s.CancelReason).HasColumnName("cancel_reason").HasMaxLength(SessionLimits.CancelReasonMax);
        builder.Property(s => s.ExpectedCandidates).HasColumnName("expected_candidates");
        builder.Property(s => s.ActualFemale).HasColumnName("actual_female");
        builder.Property(s => s.ActualMale).HasColumnName("actual_male");
        builder.Property(s => s.AttendanceRecordedAt).HasColumnName("attendance_recorded_at");
        builder.Property(s => s.AttendanceRecordedById).HasColumnName("attendance_recorded_by_id").HasMaxLength(100);
        builder.Property(s => s.AttendanceRecordedByName).HasColumnName("attendance_recorded_by_name").HasMaxLength(200);

        builder.Property(s => s.CreatedById).HasColumnName("created_by_id").HasMaxLength(100).IsRequired();
        builder.Property(s => s.CreatedByName).HasColumnName("created_by_name").HasMaxLength(200).IsRequired();
        builder.Property(s => s.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(s => s.UpdatedAt).HasColumnName("updated_at").IsRequired();

        builder.Property(s => s.Version)
            .HasColumnName("xmin")
            .HasColumnType("xid")
            .ValueGeneratedOnAddOrUpdate()
            .IsConcurrencyToken();

        // Computed from the two counts, not stored.
        builder.Ignore(s => s.ActualTotal);
        builder.Ignore(s => s.HasAttendance);

        // A host record that sessions use cannot be deleted (hosts are switched off instead).
        builder.HasOne<SessionHost>()
            .WithMany()
            .HasForeignKey(s => s.HostId)
            .OnDelete(DeleteBehavior.Restrict);

        // "A campaign's sessions in date order", "what is on my plate", "what does this host run".
        builder.HasIndex(s => new { s.CampaignId, s.Date, s.StartTime }).HasDatabaseName("ix_sessions_campaign_date");
        builder.HasIndex(s => new { s.AssigneeId, s.Date }).HasDatabaseName("ix_sessions_assignee_date");
        builder.HasIndex(s => new { s.HostId, s.Date }).HasDatabaseName("ix_sessions_host_date");
        builder.HasIndex(s => new { s.HostUserId, s.Date }).HasDatabaseName("ix_sessions_host_user_date");
    }
}

internal sealed class SessionAuditEntryConfiguration : IEntityTypeConfiguration<SessionAuditEntry>
{
    public void Configure(EntityTypeBuilder<SessionAuditEntry> builder)
    {
        builder.ToTable("audit_log", table =>
        {
            table.HasCheckConstraint("ck_audit_log_entity", "entity IN (1, 2)");
            table.HasCheckConstraint("ck_audit_log_action", "action IN (1, 2, 3, 4, 5, 6, 7)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id").ValueGeneratedNever();

        // Null for a host, which belongs to no campaign. A foreign key to campaigns.campaigns is added by hand.
        builder.Property(a => a.CampaignId).HasColumnName("campaign_id");
        builder.Property(a => a.Entity).HasColumnName("entity").HasConversion<short>();
        builder.Property(a => a.EntityId).HasColumnName("entity_id");
        builder.Property(a => a.Action).HasColumnName("action").HasConversion<short>();
        builder.Property(a => a.BeforeJson).HasColumnName("before").HasColumnType("jsonb");
        builder.Property(a => a.AfterJson).HasColumnName("after").HasColumnType("jsonb");
        builder.Property(a => a.ChangedById).HasColumnName("changed_by_id").HasMaxLength(100).IsRequired();
        builder.Property(a => a.ChangedByName).HasColumnName("changed_by_name").HasMaxLength(200).IsRequired();
        builder.Property(a => a.ChangedAt).HasColumnName("changed_at").IsRequired();

        builder.HasIndex(a => new { a.CampaignId, a.ChangedAt }).HasDatabaseName("ix_audit_log_campaign_changed_at");
        builder.HasIndex(a => a.EntityId).HasDatabaseName("ix_audit_log_entity_id");
    }
}
