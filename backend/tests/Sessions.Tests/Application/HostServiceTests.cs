using Identity.Domain;
using Sessions.Application;
using Sessions.Domain;
using Sessions.Tests.Support;
using SharedKernel;

namespace Sessions.Tests.Application;

public sealed class HostServiceTests
{
    private readonly FakeRepository _repository = new();
    private readonly FakeCurrentUser _user = new();
    private readonly FakeClock _clock = new();
    private readonly HostService _service;

    public HostServiceTests()
    {
        _service = new HostService(_repository, _user, _clock);
    }

    private static HostRequest Alumnus(string name = "Chenda Sok", string? phone = "012 345 678") =>
        new("Alumni", name, null, null, phone, null);

    private static HostRequest Partner(string name = "Hope NGO", string kind = "Ngo") =>
        new("Partner", name, kind, "Mr Rith", "012 999 888", "info@hope.example.org");

    private async Task<HostDto> AddAsync(HostRequest request)
    {
        var result = await _service.CreateAsync(request, CancellationToken.None);
        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        return result.Value;
    }

    // ---------- Create ----------

    [Fact]
    public async Task Create_adds_an_alumnus_and_audits_it()
    {
        var host = await AddAsync(Alumnus());

        Assert.Equal("Alumni", host.Type);
        Assert.Equal("Chenda Sok", host.Name);
        Assert.True(host.IsActive);
        Assert.Single(_repository.Hosts);

        var audit = Assert.Single(_repository.Audit);
        Assert.Equal(AuditEntity.Host, audit.Entity);
        Assert.Equal(AuditAction.Created, audit.Action);
        Assert.Null(audit.CampaignId);
        Assert.Equal(host.Id, audit.EntityId);
        Assert.Null(audit.BeforeJson);
        Assert.Contains("Chenda Sok", audit.AfterJson);
        Assert.Equal("manager-1", audit.ChangedById);
        Assert.Equal("Dara Manager", audit.ChangedByName);
        Assert.Equal(1, _repository.SaveCount);
    }

    [Fact]
    public async Task Create_adds_a_partner_with_its_kind_and_contact()
    {
        var host = await AddAsync(Partner(kind: "highschool"));

        Assert.Equal("Partner", host.Type);
        Assert.Equal("HighSchool", host.PartnerKind);
        Assert.Equal("Mr Rith", host.ContactPerson);
        Assert.Equal("info@hope.example.org", host.Email);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Officer")]
    [InlineData("Robot")]
    [InlineData("2")]
    public async Task Create_needs_alumnus_or_partner(string? type)
    {
        var result = await _service.CreateAsync(new HostRequest(type, "Someone", null, null, "012 345 678", null), CancellationToken.None);

        Assert.Equal(["Choose alumnus or partner."], result.Error.FieldErrors!["type"]);
        Assert.Empty(_repository.Hosts);
        Assert.Empty(_repository.Audit);
    }

    [Theory]
    [InlineData("Bank")]
    [InlineData("3")]
    public async Task Create_refuses_an_unknown_partner_kind(string kind)
    {
        var result = await _service.CreateAsync(Partner(kind: kind), CancellationToken.None);

        Assert.Single(result.Error.FieldErrors!["partnerKind"]);
    }

    [Fact]
    public async Task Create_reports_the_domains_problems_per_field()
    {
        var result = await _service.CreateAsync(new HostRequest("Partner", " ", null, null, null, null), CancellationToken.None);

        Assert.Equal(ErrorType.Validation, result.Error.Type);
        Assert.Contains("name", result.Error.FieldErrors!.Keys);
        Assert.Contains("partnerKind", result.Error.FieldErrors.Keys);
        Assert.Contains("phone", result.Error.FieldErrors.Keys);
    }

    [Fact]
    public async Task Create_turns_a_duplicate_name_into_a_message_under_the_name_box()
    {
        _repository.FailNextSave = SessionErrors.DuplicateHost;

        var result = await _service.CreateAsync(Alumnus(), CancellationToken.None);

        Assert.Equal(["An alumnus with this name is already in the list."], result.Error.FieldErrors!["name"]);
    }

    [Fact]
    public async Task Create_needs_a_signed_in_user()
    {
        _user.User = null;

        var result = await _service.CreateAsync(Alumnus(), CancellationToken.None);

        Assert.Equal(SessionErrors.NoUser, result.Error);
        Assert.Empty(_repository.Hosts);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Update_changes_a_host_and_audits_before_and_after()
    {
        var host = await AddAsync(Partner());
        _repository.Audit.Clear();
        _user.SignInAs("manager-2", "Rith Manager", Group.SelectionManager);

        var result = await _service.UpdateAsync(host.Id, Partner(name: "Hope Foundation", kind: "University"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Hope Foundation", result.Value.Name);
        Assert.Equal("University", result.Value.PartnerKind);

        var audit = Assert.Single(_repository.Audit);
        Assert.Equal(AuditAction.Updated, audit.Action);
        Assert.Contains("Hope NGO", audit.BeforeJson);
        Assert.Contains("Hope Foundation", audit.AfterJson);
        Assert.Equal("manager-2", audit.ChangedById);
    }

    [Fact]
    public async Task Update_with_nothing_changed_saves_and_audits_nothing()
    {
        var host = await AddAsync(Partner());
        _repository.Audit.Clear();
        var saves = _repository.SaveCount;

        var result = await _service.UpdateAsync(host.Id, Partner(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(_repository.Audit);
        Assert.Equal(saves, _repository.SaveCount);
    }

    [Fact]
    public async Task Update_cannot_turn_an_alumnus_into_a_partner()
    {
        var host = await AddAsync(Alumnus());

        var result = await _service.UpdateAsync(host.Id, Partner(), CancellationToken.None);

        Assert.Single(result.Error.FieldErrors!["type"]);
        Assert.Equal("Alumni", _repository.Hosts[host.Id].Type.ToString());
    }

    [Fact]
    public async Task Update_of_an_unknown_host_is_not_found()
    {
        var result = await _service.UpdateAsync(Guid.NewGuid(), Alumnus(), CancellationToken.None);

        Assert.Equal(SessionErrors.HostNotFound, result.Error);
    }

    [Fact]
    public async Task Update_with_a_problem_changes_nothing()
    {
        var host = await AddAsync(Alumnus());
        _repository.Audit.Clear();

        var result = await _service.UpdateAsync(host.Id, Alumnus(name: ""), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Chenda Sok", _repository.Hosts[host.Id].Name);
        Assert.Empty(_repository.Audit);
    }

    // ---------- Switch off and on ----------

    [Fact]
    public async Task A_host_can_be_switched_off_and_on_with_an_audit_line_each_time()
    {
        var host = await AddAsync(Alumnus());
        _repository.Audit.Clear();

        var off = await _service.SetActiveAsync(host.Id, false, CancellationToken.None);
        var on = await _service.SetActiveAsync(host.Id, true, CancellationToken.None);

        Assert.False(off.Value.IsActive);
        Assert.True(on.Value.IsActive);
        Assert.Equal([AuditAction.Deactivated, AuditAction.Activated], _repository.Audit.Select(a => a.Action));
    }

    [Fact]
    public async Task Switching_to_the_state_a_host_is_already_in_does_nothing()
    {
        var host = await AddAsync(Alumnus());
        _repository.Audit.Clear();
        var saves = _repository.SaveCount;

        var result = await _service.SetActiveAsync(host.Id, true, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(_repository.Audit);
        Assert.Equal(saves, _repository.SaveCount);
    }

    [Fact]
    public async Task Switching_an_unknown_host_is_not_found()
    {
        var result = await _service.SetActiveAsync(Guid.NewGuid(), false, CancellationToken.None);

        Assert.Equal(SessionErrors.HostNotFound, result.Error);
    }

    // ---------- List ----------

    [Fact]
    public async Task List_returns_active_hosts_by_name_and_can_filter_by_type_or_include_switched_off_ones()
    {
        var zed = await AddAsync(Alumnus("Zed Alumnus"));
        await AddAsync(Alumnus("Abby Alumna"));
        var partner = await AddAsync(Partner("Mid School", "HighSchool"));
        var off = await AddAsync(Partner("Closed NGO"));
        await _service.SetActiveAsync(off.Id, false, CancellationToken.None);

        var all = (await _service.ListAsync(null, false, CancellationToken.None)).Value;
        var alumni = (await _service.ListAsync("alumni", false, CancellationToken.None)).Value;
        var withOff = (await _service.ListAsync("Partner", true, CancellationToken.None)).Value;

        Assert.Equal(["Abby Alumna", "Mid School", "Zed Alumnus"], all.Select(h => h.Name));
        Assert.Equal(["Abby Alumna", "Zed Alumnus"], alumni.Select(h => h.Name));
        Assert.Equal(["Closed NGO", "Mid School"], withOff.Select(h => h.Name));
        Assert.Contains(zed.Id, all.Select(h => h.Id));
        Assert.Contains(partner.Id, withOff.Select(h => h.Id));
    }

    [Theory]
    [InlineData("Officer")]
    [InlineData("nonsense")]
    public async Task List_refuses_a_type_that_is_not_in_the_directory(string type)
    {
        var result = await _service.ListAsync(type, false, CancellationToken.None);

        Assert.Single(result.Error.FieldErrors!["type"]);
    }
}
