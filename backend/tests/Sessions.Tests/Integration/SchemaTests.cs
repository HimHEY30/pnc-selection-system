using Npgsql;

namespace Sessions.Tests.Integration;

/// <summary>
/// Proves the database itself refuses bad data, so the rules hold even if some future code path
/// skips validation, and that the migration, its links to the campaigns tables and its cascade work.
/// </summary>
[Collection(SessionsApiCollection.Name)]
public sealed class SchemaTests
{
    private readonly SessionsApiFixture _fixture;

    public SchemaTests(SessionsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<Guid> CampaignAsync() => (await _fixture.CreateManagerClient().CreateCampaignAsync()).Id;

    private async Task<Guid> HostAsync(short type = 2, short? kind = null, string? phone = "012 345 678", string? email = null, string? name = null)
    {
        var id = Guid.NewGuid();
        await _fixture.ExecuteAsync(
            """
            insert into sessions.hosts (id, type, name, name_normalized, partner_kind, phone, email, is_active, created_by_id, created_by_name, created_at, updated_at)
            values (@id, @t, @n, lower(@n), @k, @p, @e, true, 'u', 'U', now(), now())
            """,
            ("id", id), ("t", type), ("n", name ?? "Host " + id.ToString("N")), ("k", kind), ("p", phone), ("e", email));
        return id;
    }

    /// <summary>An officer-hosted, in-person, planned session unless a column is overridden.</summary>
    private Task<int> InsertSessionAsync(
        Guid campaignId,
        short status = 1,
        short format = 1,
        string? venue = "Hall",
        string? link = null,
        short hostType = 1,
        Guid? hostId = null,
        string? hostUserId = "officer-1",
        string? hostUserName = "Sokha",
        string start = "09:00",
        string end = "11:00",
        string title = "Open day",
        string? cancelReason = null,
        int? expected = null,
        int? female = null,
        int? male = null,
        bool? recorded = null,
        short? province = null) => _fixture.ExecuteAsync(
        """
        insert into sessions.information_sessions
            (id, campaign_id, title, session_date, start_time, end_time, format, venue, meeting_link, province_id,
             assignee_id, assignee_name, host_type, host_id, host_user_id, host_user_name, status, cancel_reason,
             expected_candidates, actual_female, actual_male, attendance_recorded_at,
             created_by_id, created_by_name, created_at, updated_at)
        values
            (@id, @c, @title, date '2027-03-20', @s::time, @e::time, @f, @v, @l, @prov,
             'officer-1', 'Sokha', @ht, @hid, @hu, @hn, @st, @cr,
             @x, @fe, @ma, case when @rec then now() else null end,
             'u', 'U', now(), now())
        """,
        ("id", Guid.NewGuid()), ("c", campaignId), ("title", title), ("s", start), ("e", end), ("f", format), ("v", venue),
        ("l", link), ("prov", province), ("ht", hostType), ("hid", hostId), ("hu", hostUserId), ("hn", hostUserName),
        ("st", status), ("cr", cancelReason), ("x", expected), ("fe", female), ("ma", male),
        ("rec", recorded ?? female is not null));

    private static async Task AssertViolationAsync(Task<int> statement, string constraintOrState)
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() => statement);
        Assert.True(
            ex.ConstraintName == constraintOrState || ex.SqlState == constraintOrState,
            $"expected {constraintOrState}, got {ex.ConstraintName} / {ex.SqlState}");
    }

    // ---------- Migration ----------

    [Fact]
    public async Task TheMigration_CreatesEveryTableInTheSessionsSchema()
    {
        var tables = new List<string>();
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "select table_name from information_schema.tables where table_schema = 'sessions' order by table_name", connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        Assert.Equal(["__ef_migrations_history", "audit_log", "hosts", "information_sessions"], tables);
    }

    [Fact]
    public async Task AValidSessionOfEachShape_IsAccepted()
    {
        var campaign = await CampaignAsync();
        var alumnus = await HostAsync(2);
        var partner = await HostAsync(3, kind: 2);

        await InsertSessionAsync(campaign);
        await InsertSessionAsync(campaign, format: 2, venue: null, link: "https://meet.example.org/x");
        await InsertSessionAsync(campaign, format: 3, link: "https://meet.example.org/x");
        await InsertSessionAsync(campaign, hostType: 2, hostId: alumnus, hostUserId: null, hostUserName: null);
        await InsertSessionAsync(campaign, hostType: 3, hostId: partner, hostUserId: null, hostUserName: null, province: 2);
        await InsertSessionAsync(campaign, status: 3, cancelReason: "Rain");
        await InsertSessionAsync(campaign, status: 2, female: 10, male: 12, expected: 40);
        await InsertSessionAsync(campaign, female: 0, male: 0);

        Assert.Equal(8, await _fixture.ScalarAsync<long>(
            "select count(*) from sessions.information_sessions where campaign_id = @c", ("c", campaign)));
    }

    // ---------- Session checks ----------

    [Fact]
    public async Task ASession_NeedsAnExistingCampaign() =>
        await AssertViolationAsync(InsertSessionAsync(Guid.NewGuid()), "fk_information_sessions_campaigns_campaign_id");

    [Fact]
    public async Task ASession_NeedsAnExistingProvince() =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), province: 999), "fk_information_sessions_provinces_province_id");

    [Fact]
    public async Task ASession_MustEndAfterItStarts()
    {
        var campaign = await CampaignAsync();
        await AssertViolationAsync(InsertSessionAsync(campaign, start: "11:00", end: "11:00"), "ck_sessions_times");
        await AssertViolationAsync(InsertSessionAsync(campaign, start: "11:00", end: "09:00"), "ck_sessions_times");
    }

    [Fact]
    public async Task ASession_NeedsATitle() =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), title: "   "), "ck_sessions_title");

    [Theory]
    [InlineData((short)0)]
    [InlineData((short)4)]
    public async Task ASession_NeedsAKnownStatus(short status) =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), status: status), "ck_sessions_status");

    [Fact]
    public async Task ASession_NeedsAKnownFormat() =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), format: 4), "ck_sessions_format");

    [Fact]
    public async Task InPersonAndHybridNeedAVenue_OnlineAndHybridNeedALink()
    {
        var campaign = await CampaignAsync();

        await AssertViolationAsync(InsertSessionAsync(campaign, format: 1, venue: null), "ck_sessions_venue");
        await AssertViolationAsync(InsertSessionAsync(campaign, format: 3, venue: null, link: "https://x.example.org"), "ck_sessions_venue");
        await AssertViolationAsync(InsertSessionAsync(campaign, format: 2, venue: null, link: null), "ck_sessions_link");
        await AssertViolationAsync(InsertSessionAsync(campaign, format: 3, venue: "Hall", link: null), "ck_sessions_link");
    }

    [Fact]
    public async Task AnOfficerHost_NeedsAUser_AndNoDirectoryRecord()
    {
        var campaign = await CampaignAsync();
        var alumnus = await HostAsync(2);

        await AssertViolationAsync(InsertSessionAsync(campaign, hostUserId: null, hostUserName: null), "ck_sessions_host_shape");
        await AssertViolationAsync(InsertSessionAsync(campaign, hostId: alumnus), "ck_sessions_host_shape");
    }

    [Fact]
    public async Task AnAlumniOrPartnerHost_NeedsADirectoryRecord_AndNoUser()
    {
        var campaign = await CampaignAsync();
        var alumnus = await HostAsync(2);

        await AssertViolationAsync(
            InsertSessionAsync(campaign, hostType: 2, hostId: null, hostUserId: null, hostUserName: null), "ck_sessions_host_shape");
        await AssertViolationAsync(InsertSessionAsync(campaign, hostType: 2, hostId: alumnus), "ck_sessions_host_shape");
    }

    [Fact]
    public async Task AHostRecordThatDoesNotExist_IsRefused() =>
        await AssertViolationAsync(
            InsertSessionAsync(await CampaignAsync(), hostType: 3, hostId: Guid.NewGuid(), hostUserId: null, hostUserName: null),
            "FK_information_sessions_hosts_host_id");

    [Fact]
    public async Task AHostThatSessionsUse_CannotBeDeleted()
    {
        var campaign = await CampaignAsync();
        var partner = await HostAsync(3, kind: 1);
        await InsertSessionAsync(campaign, hostType: 3, hostId: partner, hostUserId: null, hostUserName: null);

        await AssertViolationAsync(
            _fixture.ExecuteAsync("delete from sessions.hosts where id = @id", ("id", partner)),
            "FK_information_sessions_hosts_host_id");
    }

    [Fact]
    public async Task ACancelledSession_HasAReason_AndOnlyACancelledOneDoes()
    {
        var campaign = await CampaignAsync();

        await AssertViolationAsync(InsertSessionAsync(campaign, status: 3, cancelReason: null), "ck_sessions_cancel_reason");
        await AssertViolationAsync(InsertSessionAsync(campaign, status: 1, cancelReason: "Rain"), "ck_sessions_cancel_reason");
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(5001)]
    public async Task TheExpectedNumber_StaysInRange(int expected) =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), expected: expected), "ck_sessions_expected");

    [Fact]
    public async Task Attendance_ComesAsAPairOfCountsInRange()
    {
        var campaign = await CampaignAsync();

        await AssertViolationAsync(InsertSessionAsync(campaign, female: 5, male: null, recorded: true), "ck_sessions_attendance");
        await AssertViolationAsync(InsertSessionAsync(campaign, female: -1, male: 5), "ck_sessions_attendance");
        await AssertViolationAsync(InsertSessionAsync(campaign, female: 5, male: 5001), "ck_sessions_attendance");
        await AssertViolationAsync(InsertSessionAsync(campaign, female: 5, male: 5, recorded: false), "ck_sessions_attendance");
    }

    [Fact]
    public async Task ADoneSession_AlwaysHasItsAttendance() =>
        await AssertViolationAsync(InsertSessionAsync(await CampaignAsync(), status: 2), "ck_sessions_attendance");

    // ---------- Host checks ----------

    [Fact]
    public async Task AHost_IsAnAlumnusOrAPartner_NotAnOfficer() =>
        await AssertViolationAsync(HostAsyncAsTask(type: 1), "ck_hosts_type");

    [Fact]
    public async Task APartner_HasAKind_AndAnAlumnusDoesNot()
    {
        await AssertViolationAsync(HostAsyncAsTask(type: 3, kind: null), "ck_hosts_partner_kind");
        await AssertViolationAsync(HostAsyncAsTask(type: 2, kind: 1), "ck_hosts_partner_kind");
        await AssertViolationAsync(HostAsyncAsTask(type: 3, kind: 9), "ck_hosts_partner_kind");
    }

    [Fact]
    public async Task AHost_CanBeReached() =>
        await AssertViolationAsync(HostAsyncAsTask(type: 2, phone: null, email: null), "ck_hosts_contact");

    [Fact]
    public async Task AHostName_IsUniquePerTypeIgnoringCase()
    {
        var name = "Hope NGO " + Guid.NewGuid().ToString("N");
        await HostAsync(3, kind: 1, name: name);

        await AssertViolationAsync(HostAsyncAsTask(type: 3, kind: 1, name: name.ToUpperInvariant()), "ux_hosts_type_name");

        // An alumnus may share a name with a partner.
        await HostAsync(2, name: name);
    }

    private async Task<int> HostAsyncAsTask(short type, short? kind = null, string? phone = "012 345 678", string? email = null, string? name = null)
    {
        await HostAsync(type, kind, phone, email, name);
        return 0;
    }

    // ---------- Audit log ----------

    [Fact]
    public async Task TheAuditLog_TakesAHostWithNoCampaign_ButNotAnUnknownCampaignOrAction()
    {
        const string insert =
            """
            insert into sessions.audit_log (id, campaign_id, entity, entity_id, action, changed_by_id, changed_by_name, changed_at)
            values (@id, @c, @e, @eid, @a, 'u', 'U', now())
            """;

        await _fixture.ExecuteAsync(insert, ("id", Guid.NewGuid()), ("c", null), ("e", (short)2), ("eid", Guid.NewGuid()), ("a", (short)1));

        await AssertViolationAsync(
            _fixture.ExecuteAsync(insert, ("id", Guid.NewGuid()), ("c", Guid.NewGuid()), ("e", (short)1), ("eid", Guid.NewGuid()), ("a", (short)1)),
            "fk_audit_log_campaigns_campaign_id");
        await AssertViolationAsync(
            _fixture.ExecuteAsync(insert, ("id", Guid.NewGuid()), ("c", null), ("e", (short)3), ("eid", Guid.NewGuid()), ("a", (short)1)),
            "ck_audit_log_entity");
        await AssertViolationAsync(
            _fixture.ExecuteAsync(insert, ("id", Guid.NewGuid()), ("c", null), ("e", (short)1), ("eid", Guid.NewGuid()), ("a", (short)8)),
            "ck_audit_log_action");
    }

    // ---------- Campaign delete ----------

    [Fact]
    public async Task DeletingACampaign_TakesItsSessionsAndTheirAuditLinesWithIt()
    {
        var campaign = await CampaignAsync();
        await InsertSessionAsync(campaign);
        await _fixture.ExecuteAsync(
            """
            insert into sessions.audit_log (id, campaign_id, entity, entity_id, action, changed_by_id, changed_by_name, changed_at)
            values (@id, @c, 1, @eid, 1, 'u', 'U', now())
            """,
            ("id", Guid.NewGuid()), ("c", campaign), ("eid", Guid.NewGuid()));

        await _fixture.ExecuteAsync("delete from campaigns.campaigns where id = @id", ("id", campaign));

        Assert.Equal(0, await _fixture.ScalarAsync<long>(
            "select count(*) from sessions.information_sessions where campaign_id = @c", ("c", campaign)));
        Assert.Equal(0, await _fixture.ScalarAsync<long>(
            "select count(*) from sessions.audit_log where campaign_id = @c", ("c", campaign)));
    }
}
