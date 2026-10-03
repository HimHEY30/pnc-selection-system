using Campaigns.Tests.Infrastructure;
using Npgsql;

namespace Campaigns.Tests.Persistence;

/// <summary>
/// Proves the database itself refuses bad data, so the rules hold even if some future
/// code path skips the application-layer validation.
/// </summary>
[Collection(CampaignsApiCollection.Name)]
public sealed class DatabaseSchemaTests
{
    private readonly CampaignsApiFixture _fixture;

    public DatabaseSchemaTests(CampaignsApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        return connection;
    }

    private async Task<int> ExecuteAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return await command.ExecuteNonQueryAsync();
    }

    private Task<int> InsertCampaignAsync(
        string name,
        string? start = null,
        string? end = null,
        int? expected = null,
        int? seats = null,
        short status = 0) =>
        ExecuteAsync(
            """
            INSERT INTO campaigns.campaigns
                (id, name, name_normalized, academic_year, status, start_date, end_date,
                 expected_candidates, seats_available, created_by_id, created_by_name, created_at, updated_at)
            VALUES
                (@id, @name, @normalized, '2027–2028', @status, @start::date, @end::date,
                 @expected, @seats, 'u', 'U', now(), now())
            """,
            ("id", Guid.NewGuid()),
            ("name", name),
            ("normalized", name.ToLowerInvariant()),
            ("status", status),
            ("start", start),
            ("end", end),
            ("expected", expected),
            ("seats", seats));

    private static async Task AssertViolationAsync(Task<int> insert, string constraint)
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() => insert);
        Assert.Equal(constraint, ex.ConstraintName);
    }

    [Fact]
    public async Task Migrations_CreateEveryTableInTheCampaignsSchema()
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'campaigns' ORDER BY table_name",
            connection);
        var tables = new List<string>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        Assert.Equal(
            ["__ef_migrations_history", "campaign_provinces", "campaign_setup_steps", "campaigns", "provinces"],
            tables);
    }

    [Fact]
    public async Task ProvinceSeed_Has25ProvincesWithUniqueCodes()
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand("SELECT count(*), count(DISTINCT code) FROM campaigns.provinces", connection);
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();

        Assert.Equal(25, reader.GetInt64(0));
        Assert.Equal(25, reader.GetInt64(1));
    }

    [Fact]
    public async Task EndDateMustBeAfterStartDate()
    {
        await AssertViolationAsync(
            InsertCampaignAsync($"db-{Guid.NewGuid():N}", start: "2026-11-02", end: "2026-10-30"),
            "ck_campaigns_dates");
    }

    [Fact]
    public async Task ExpectedCandidatesAndSeatsMustBePositive()
    {
        await AssertViolationAsync(InsertCampaignAsync($"db-{Guid.NewGuid():N}", expected: 0), "ck_campaigns_expected_candidates");
        await AssertViolationAsync(InsertCampaignAsync($"db-{Guid.NewGuid():N}", seats: -1), "ck_campaigns_seats_available");
    }

    [Fact]
    public async Task SeatsCannotExceedExpectedCandidates()
    {
        await AssertViolationAsync(
            InsertCampaignAsync($"db-{Guid.NewGuid():N}", expected: 100, seats: 101),
            "ck_campaigns_seats_within_expected");
    }

    [Fact]
    public async Task StatusMustBeAKnownValue()
    {
        await AssertViolationAsync(InsertCampaignAsync($"db-{Guid.NewGuid():N}", status: 7), "ck_campaigns_status");
    }

    [Fact]
    public async Task NamesAreUnique()
    {
        var name = $"db-{Guid.NewGuid():N}";
        await InsertCampaignAsync(name);

        await AssertViolationAsync(InsertCampaignAsync(name), "ix_campaigns_name_normalized");
    }

    [Fact]
    public async Task AStepExistsOnlyOncePerCampaign_AndOnlyForTheFiveKnownSteps()
    {
        var campaign = await _fixture.CreateManagerClient().CreateCampaignAsync();

        await AssertViolationAsync(
            ExecuteAsync(
                "INSERT INTO campaigns.campaign_setup_steps (id, campaign_id, step, status, updated_at) VALUES (@id, @c, 1, 0, now())",
                ("id", Guid.NewGuid()), ("c", campaign.Id)),
            "ux_campaign_setup_steps_campaign_step");

        await AssertViolationAsync(
            ExecuteAsync(
                "INSERT INTO campaigns.campaign_setup_steps (id, campaign_id, step, status, updated_at) VALUES (@id, @c, 6, 0, now())",
                ("id", Guid.NewGuid()), ("c", campaign.Id)),
            "ck_campaign_setup_steps_step");
    }

    [Fact]
    public async Task ADeletedCampaignTakesItsStepsAndProvincesWithIt()
    {
        var client = _fixture.CreateManagerClient();
        var campaign = await client.CreateCampaignAsync();
        await client.CompleteInfoAsync(campaign.Id, TestData.ValidInfo(campaign.Name));

        await ExecuteAsync("DELETE FROM campaigns.campaigns WHERE id = @id", ("id", campaign.Id));

        Assert.Equal(0, await CountAsync("campaigns.campaign_setup_steps", campaign.Id));
        Assert.Equal(0, await CountAsync("campaigns.campaign_provinces", campaign.Id));
    }

    [Fact]
    public async Task ACampaignCannotPointAtAProvinceThatDoesNotExist()
    {
        var campaign = await _fixture.CreateManagerClient().CreateCampaignAsync();

        var ex = await Assert.ThrowsAsync<PostgresException>(() => ExecuteAsync(
            "INSERT INTO campaigns.campaign_provinces (campaign_id, province_id) VALUES (@c, 999)",
            ("c", campaign.Id)));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ex.SqlState);
    }

    private async Task<long> CountAsync(string table, Guid campaignId)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand($"SELECT count(*) FROM {table} WHERE campaign_id = @id", connection);
        command.Parameters.AddWithValue("id", campaignId);
        return (long)(await command.ExecuteScalarAsync())!;
    }
}
