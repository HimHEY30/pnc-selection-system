using Npgsql;
using static Eligibility.Tests.Integration.ApiHelpers;

namespace Eligibility.Tests.Integration;

/// <summary>
/// Proves the database itself refuses bad data, so the rules hold even if some future code
/// path skips validation, and that the migration and the catalogue seed work.
/// </summary>
[Collection(EligibilityApiCollection.Name)]
public sealed class SchemaTests
{
    private readonly EligibilityApiFixture _fixture;

    public SchemaTests(EligibilityApiFixture fixture)
    {
        _fixture = fixture;
    }

    private async Task<Guid> CampaignWithEmptyRuleSetAsync()
    {
        var id = (await _fixture.CreateManagerClient().CreateCampaignAsync()).Id;
        await _fixture.ExecuteAsync(
            "insert into eligibility.rule_sets (campaign_id, updated_at) values (@id, now())", ("id", id));
        return id;
    }

    private async Task<Guid> GroupAsync(Guid campaignId, string name = "G", short logic = 1)
    {
        var id = Guid.NewGuid();
        await _fixture.ExecuteAsync(
            "insert into eligibility.rule_groups (id, campaign_id, name, logic, position) values (@id, @c, @n, @l, 0)",
            ("id", id), ("c", campaignId), ("n", name), ("l", logic));
        return id;
    }

    private Task<int> InsertRuleAsync(
        Guid groupId,
        string field = "gender",
        string op = "is",
        string[]? values = null,
        short type = 1,
        string message = "Message.") => _fixture.ExecuteAsync(
        """
        insert into eligibility.rules (id, group_id, field_key, operator_key, "values", type, message, is_active, position)
        values (@id, @g, @f, @o, @v, @t, @m, true, 0)
        """,
        ("id", Guid.NewGuid()), ("g", groupId), ("f", field), ("o", op), ("v", values ?? ["female"]), ("t", type), ("m", message));

    private static async Task AssertViolationAsync(Task<int> statement, string constraintOrState)
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() => statement);
        Assert.True(
            ex.ConstraintName == constraintOrState || ex.SqlState == constraintOrState,
            $"expected {constraintOrState}, got {ex.ConstraintName} / {ex.SqlState}");
    }

    // ---------- Migration and seed ----------

    [Fact]
    public async Task TheMigration_CreatesEveryTableInTheEligibilitySchema()
    {
        var tables = new List<string>();
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "select table_name from information_schema.tables where table_schema = 'eligibility' order by table_name", connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        Assert.Equal(
            ["__ef_migrations_history", "audit_log", "field_options", "fields", "operators", "rule_groups", "rule_sets", "rules"],
            tables);
    }

    [Fact]
    public async Task TheCatalogueSeed_HasTheEightFieldsTheirOptionsAndTheOperators()
    {
        Assert.Equal(8, await _fixture.ScalarAsync<long>("select count(*) from eligibility.fields"));
        Assert.Equal(17, await _fixture.ScalarAsync<long>("select count(*) from eligibility.field_options")); // 2 + 5 + 6 + 4
        Assert.Equal(15, await _fixture.ScalarAsync<long>("select count(*) from eligibility.operators"));
        Assert.Equal(1, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.fields where key = 'age' and derivation = 1 and candidate_attribute = 'date_of_birth' and decimals = 0"));
        Assert.Equal(2, await _fixture.ScalarAsync<int>(
            "select decimals from eligibility.fields where key = 'family_income'"));
    }

    // ---------- Rules ----------

    [Fact]
    public async Task TheSameCheckTwiceInOneGroup_IsRefused_ButFineInAnotherGroup()
    {
        var campaign = await CampaignWithEmptyRuleSetAsync();
        var first = await GroupAsync(campaign, "First");
        var second = await GroupAsync(campaign, "Second");
        await InsertRuleAsync(first);

        await AssertViolationAsync(InsertRuleAsync(first), "ux_rules_group_field_operator_values");
        await InsertRuleAsync(second); // same check, different group: allowed
        await InsertRuleAsync(first, values: ["male"]); // different value: allowed
    }

    [Fact]
    public async Task ARuleNeedsARealMessage()
    {
        var group = await GroupAsync(await CampaignWithEmptyRuleSetAsync());

        await AssertViolationAsync(InsertRuleAsync(group, message: "   "), "ck_rules_message");
    }

    [Fact]
    public async Task ARuleTypeAndAGroupLogic_MustBeKnownValues()
    {
        var campaign = await CampaignWithEmptyRuleSetAsync();
        var group = await GroupAsync(campaign);

        await AssertViolationAsync(InsertRuleAsync(group, type: 3), "ck_rules_type");
        await AssertViolationAsync(
            _fixture.ExecuteAsync(
                "insert into eligibility.rule_groups (id, campaign_id, name, logic, position) values (@id, @c, 'x', 3, 0)",
                ("id", Guid.NewGuid()), ("c", campaign)),
            "ck_rule_groups_logic");
    }

    [Fact]
    public async Task ARuleMustPointAtARealFieldAndOperator()
    {
        var group = await GroupAsync(await CampaignWithEmptyRuleSetAsync());

        await AssertViolationAsync(InsertRuleAsync(group, field: "shoe_size"), PostgresErrorCodes.ForeignKeyViolation);
        await AssertViolationAsync(InsertRuleAsync(group, op: "sounds_like"), PostgresErrorCodes.ForeignKeyViolation);
    }

    [Fact]
    public async Task AFieldThatARuleUses_CannotBeDeleted()
    {
        var group = await GroupAsync(await CampaignWithEmptyRuleSetAsync());
        await InsertRuleAsync(group, field: "gender");

        await AssertViolationAsync(
            _fixture.ExecuteAsync("delete from eligibility.fields where key = 'gender'"),
            PostgresErrorCodes.ForeignKeyViolation);
    }

    [Fact]
    public async Task ARuleSetAndItsAuditLines_MustBelongToARealCampaign()
    {
        await AssertViolationAsync(
            _fixture.ExecuteAsync(
                "insert into eligibility.rule_sets (campaign_id, updated_at) values (@id, now())", ("id", Guid.NewGuid())),
            PostgresErrorCodes.ForeignKeyViolation);
        await AssertViolationAsync(
            _fixture.ExecuteAsync(
                """
                insert into eligibility.audit_log (id, campaign_id, entity, entity_id, action, changed_by_id, changed_by_name, changed_at)
                values (@id, @c, 2, @e, 0, 'u', 'U', now())
                """,
                ("id", Guid.NewGuid()), ("c", Guid.NewGuid()), ("e", Guid.NewGuid())),
            PostgresErrorCodes.ForeignKeyViolation);
    }

    // ---------- Cascade ----------

    [Fact]
    public async Task DeletingACampaign_TakesItsRulesAndAuditLinesWithIt()
    {
        var manager = _fixture.CreateManagerClient();
        var campaign = await manager.CreateCampaignAsync();
        await manager.SaveDraftAsync(campaign.Id, Completable());
        Assert.True(await _fixture.ScalarAsync<long>("select count(*) from eligibility.audit_log where campaign_id = @id", ("id", campaign.Id)) > 0);

        await _fixture.ExecuteAsync("delete from campaigns.campaigns where id = @id", ("id", campaign.Id));

        Assert.Equal(0, await _fixture.ScalarAsync<long>("select count(*) from eligibility.rule_sets where campaign_id = @id", ("id", campaign.Id)));
        Assert.Equal(0, await _fixture.ScalarAsync<long>("select count(*) from eligibility.rule_groups where campaign_id = @id", ("id", campaign.Id)));
        Assert.Equal(0, await _fixture.ScalarAsync<long>("select count(*) from eligibility.audit_log where campaign_id = @id", ("id", campaign.Id)));
        Assert.Equal(0, await _fixture.ScalarAsync<long>(
            "select count(*) from eligibility.rules r join eligibility.rule_groups g on g.id = r.group_id where g.campaign_id = @id", ("id", campaign.Id)));
    }

    [Fact]
    public async Task DeletingAGroup_TakesItsRulesWithIt()
    {
        var group = await GroupAsync(await CampaignWithEmptyRuleSetAsync());
        await InsertRuleAsync(group);

        await _fixture.ExecuteAsync("delete from eligibility.rule_groups where id = @id", ("id", group));

        Assert.Equal(0, await _fixture.ScalarAsync<long>("select count(*) from eligibility.rules where group_id = @id", ("id", group)));
    }
}
