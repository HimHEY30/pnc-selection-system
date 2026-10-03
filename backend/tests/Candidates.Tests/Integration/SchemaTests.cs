using Npgsql;

namespace Candidates.Tests.Integration;

/// <summary>
/// Proves the database itself refuses bad data, so the rules hold even if some future code path skips validation,
/// and that the migration, its links to the campaigns and sessions tables and their cascades work.
/// </summary>
[Collection(CandidatesApiCollection.Name)]
public sealed class SchemaTests
{
    private readonly CandidatesApiFixture _fixture;

    public SchemaTests(CandidatesApiFixture fixture)
    {
        _fixture = fixture;
    }

    private static int _phone = 10_000_000;

    private static string NextPhone() => "0" + Interlocked.Increment(ref _phone);

    /// <summary>A candidate who picked the address from the lists, unless a column is overridden.</summary>
    private Task<int> InsertAsync(
        Guid campaignId,
        Guid? id = null,
        string nameKm = "សុខ ចិន្តា",
        string nameEn = "Sok Chenda",
        short gender = 1,
        string? phone = null,
        string? provinceCode = "12",
        string provinceName = "Phnom Penh",
        string? districtCode = "1201",
        string? communeCode = "120101",
        string? villageCode = null,
        string? villageName = null,
        string schoolName = "Bak Touk High School",
        Guid? sessionId = null,
        bool ngo = false,
        string? ngoName = null) => _fixture.ExecuteAsync(
        """
        insert into candidates.candidates
            (id, campaign_id, name_km, name_en, gender, date_of_birth, phone,
             province_code, province_name, district_code, district_name, commune_code, commune_name, village_code, village_name,
             school_name, session_id, has_ngo_support, ngo_name, created_by_id, created_by_name, created_at, updated_at)
        values
            (@id, @c, @nk, @ne, @g, date '2009-05-20', @p,
             @pc, @pn, @dc, 'Chamkar Mon', @cc, 'Tonle Bassac', @vc, @vn,
             @sn, @s, @ngo, @nn, 'u', 'U', now(), now())
        """,
        ("id", id ?? Guid.NewGuid()), ("c", campaignId), ("nk", nameKm), ("ne", nameEn), ("g", gender),
        ("p", phone ?? NextPhone()), ("pc", provinceCode), ("pn", provinceName), ("dc", districtCode), ("cc", communeCode),
        ("vc", villageCode), ("vn", villageName), ("sn", schoolName), ("s", sessionId), ("ngo", ngo), ("nn", ngoName));

    private async Task<Guid> InsertSessionAsync(Guid campaignId)
    {
        var id = Guid.NewGuid();
        await _fixture.ExecuteAsync(
            """
            insert into sessions.information_sessions
                (id, campaign_id, title, session_date, start_time, end_time, format, venue, assignee_id, assignee_name,
                 host_type, host_user_id, host_user_name, status, created_by_id, created_by_name, created_at, updated_at)
            values
                (@id, @c, 'Open day', date '2027-03-20', time '09:00', time '11:00', 1, 'Hall', 'officer-1', 'Sokha',
                 1, 'officer-1', 'Sokha', 1, 'u', 'U', now(), now())
            """,
            ("id", id), ("c", campaignId));
        return id;
    }

    private static async Task AssertViolationAsync(Task<int> statement, string constraintOrState)
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() => statement);
        Assert.True(
            ex.ConstraintName == constraintOrState || ex.SqlState == constraintOrState,
            $"expected {constraintOrState}, got {ex.ConstraintName} / {ex.SqlState}");
    }

    // ---------- Migration ----------

    [Fact]
    public async Task TheMigration_CreatesEveryTableInTheCandidatesSchema()
    {
        var tables = new List<string>();
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "select table_name from information_schema.tables where table_schema = 'candidates' order by table_name", connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        Assert.Equal(["__ef_migrations_history", "audit_log", "candidates"], tables);
    }

    // ---------- Valid shapes ----------

    [Fact]
    public async Task ACandidateOfEachShape_IsAccepted()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var session = await InsertSessionAsync(campaign);

        await InsertAsync(campaign);
        await InsertAsync(campaign, villageCode: "12010101", villageName: "Phum Muoy");
        await InsertAsync(campaign, provinceCode: null, districtCode: null, communeCode: null, villageName: "Typed Village");
        await InsertAsync(campaign, sessionId: session, ngo: true, ngoName: "Hope NGO");
    }

    [Fact]
    public async Task ThePhoneMayRepeatInAnotherCampaign()
    {
        var first = await _fixture.CreateCampaignAsync();
        var second = await _fixture.CreateCampaignAsync();

        await InsertAsync(first, phone: "0912345678");
        await InsertAsync(second, phone: "0912345678");
    }

    // ---------- Refused shapes ----------

    [Fact]
    public async Task ThePhoneIsUniqueInACampaign()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        await InsertAsync(campaign, phone: "0912345679");

        await AssertViolationAsync(InsertAsync(campaign, phone: "0912345679"), "ux_candidates_campaign_phone");
    }

    [Theory]
    [InlineData("12345678")]
    [InlineData("0123")]
    [InlineData("00123456789")]
    [InlineData("012 345 678")]
    [InlineData("0123456789012")]
    public async Task APhoneNotInTheStoredForm_IsRefused(string phone)
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, phone: phone), "ck_candidates_phone");
    }

    [Fact]
    public async Task AnUnknownGender_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, gender: 3), "ck_candidates_gender");
    }

    [Fact]
    public async Task ABlankName_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, nameEn: "  "), "ck_candidates_names");
        await AssertViolationAsync(InsertAsync(campaign, nameKm: ""), "ck_candidates_names");
    }

    [Fact]
    public async Task ABlankSchool_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, schoolName: " "), "ck_candidates_school");
    }

    [Fact]
    public async Task AddressCodes_AreAllThereOrAllMissing()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, districtCode: null), "ck_candidates_address_codes");
        await AssertViolationAsync(InsertAsync(campaign, provinceCode: null, districtCode: "1201", communeCode: null), "ck_candidates_address_codes");
    }

    [Fact]
    public async Task AVillageCode_NeedsAVillageNameAndTheOtherCodes()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, villageCode: "12010101", villageName: null), "ck_candidates_address_codes");
        await AssertViolationAsync(
            InsertAsync(campaign, provinceCode: null, districtCode: null, communeCode: null, villageCode: "12010101", villageName: "Phum Muoy"),
            "ck_candidates_address_codes");
    }

    [Fact]
    public async Task ABlankPlaceName_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, provinceName: " "), "ck_candidates_address_names");
        await AssertViolationAsync(InsertAsync(campaign, villageName: " "), "ck_candidates_address_names");
    }

    [Fact]
    public async Task TheNgoName_IsThereIfAndOnlyIfThereIsSupport()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, ngo: true, ngoName: null), "ck_candidates_ngo");
        await AssertViolationAsync(InsertAsync(campaign, ngo: true, ngoName: " "), "ck_candidates_ngo");
        await AssertViolationAsync(InsertAsync(campaign, ngo: false, ngoName: "Hope NGO"), "ck_candidates_ngo");
    }

    // ---------- Links to other modules' tables ----------

    [Fact]
    public async Task ACandidate_NeedsARealCampaign() =>
        await AssertViolationAsync(InsertAsync(Guid.NewGuid()), "23503");

    [Fact]
    public async Task ACandidate_NeedsARealSessionIfItNamesOne()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(InsertAsync(campaign, sessionId: Guid.NewGuid()), "23503");
    }

    [Fact]
    public async Task DeletingACampaign_TakesItsCandidatesAndTheirAuditLines()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var candidate = Guid.NewGuid();
        await InsertAsync(campaign, id: candidate);
        await _fixture.ExecuteAsync(
            """
            insert into candidates.audit_log (id, campaign_id, candidate_id, action, changed_by_id, changed_by_name, changed_at)
            values (@id, @c, @cand, 1, 'u', 'U', now())
            """,
            ("id", Guid.NewGuid()), ("c", campaign), ("cand", candidate));

        await _fixture.ExecuteAsync("delete from campaigns.campaigns where id = @c", ("c", campaign));

        Assert.Equal(0L, await _fixture.ScalarAsync<long>("select count(*) from candidates.candidates where campaign_id = @c", ("c", campaign)));
        Assert.Equal(0L, await _fixture.ScalarAsync<long>("select count(*) from candidates.audit_log where campaign_id = @c", ("c", campaign)));
    }

    [Fact]
    public async Task DeletingASession_OnlyClearsTheLinkAndKeepsTheCandidate()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var session = await InsertSessionAsync(campaign);
        var candidate = Guid.NewGuid();
        await InsertAsync(campaign, id: candidate, sessionId: session);

        await _fixture.ExecuteAsync("delete from sessions.information_sessions where id = @s", ("s", session));

        Assert.Equal(1L, await _fixture.ScalarAsync<long>("select count(*) from candidates.candidates where id = @c", ("c", candidate)));
        Assert.True(await _fixture.ScalarAsync<bool>("select session_id is null from candidates.candidates where id = @c", ("c", candidate)));
    }

    [Fact]
    public async Task AnAuditLine_WithAnUnknownAction_IsRefused()
    {
        var campaign = await _fixture.CreateCampaignAsync();

        await AssertViolationAsync(
            _fixture.ExecuteAsync(
                """
                insert into candidates.audit_log (id, campaign_id, candidate_id, action, changed_by_id, changed_by_name, changed_at)
                values (@id, @c, @cand, 9, 'u', 'U', now())
                """,
                ("id", Guid.NewGuid()), ("c", campaign), ("cand", Guid.NewGuid())),
            "ck_audit_log_action");
    }
}
