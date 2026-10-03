using Campaigns.Domain;
using Candidates.Application;
using Candidates.Domain;
using Candidates.Tests.Support;
using SharedKernel;

namespace Candidates.Tests.Application;

public sealed class CandidateServiceTests
{
    private readonly FakeCandidateRepository _repository = new();
    private readonly FakeGateway _gateway = new();
    private readonly FakeSessionChoices _sessions = new();
    private readonly FakeSchoolDirectory _schools = new();
    private readonly FakeCurrentUser _user = new();
    private readonly FakeClock _clock = new();
    private readonly CandidateService _service;
    private readonly Guid _campaign;
    private int _phone = 12_000_000;

    public CandidateServiceTests()
    {
        _service = new CandidateService(_repository, _gateway, _sessions, _schools, _user, _clock);
        _campaign = _gateway.AddCampaign().CampaignId;
    }

    private string NextPhone() => "0" + ++_phone;

    private CandidateRequest Form(
        string? nameEn = "Sok Chenda",
        string? phone = null,
        string? gender = "Female",
        Guid? schoolHostId = null,
        string? schoolName = "Bak Touk High School",
        Guid? sessionId = null,
        bool? ngo = false,
        string? ngoName = null,
        uint? version = null,
        string province = "Phnom Penh") => new(
        "សុខ ចិន្តា", nameEn, gender, new DateOnly(2009, 5, 20), phone ?? NextPhone(),
        new AddressDto(new PlaceDto("12", province), new PlaceDto("1201", "Chamkar Mon"), new PlaceDto("120101", "Tonle Bassac"), null),
        schoolHostId, schoolName, sessionId, ngo, ngoName, version);

    private async Task<CandidateDto> AddAsync(CandidateRequest? form = null, Guid? campaign = null)
    {
        var result = await _service.CreateAsync(campaign ?? _campaign, form ?? Form(), CancellationToken.None);
        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        _repository.Audit.Clear();
        _repository.ResetSaves();
        return result.Value;
    }

    private static string[] FieldErrors(Result result, string field)
    {
        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    // ---------- Create ----------

    [Fact]
    public async Task Create_stores_the_candidate_with_who_made_it_and_audits_it()
    {
        var result = await _service.CreateAsync(_campaign, Form(nameEn: "  Sok   Chenda "), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sok Chenda", result.Value.NameEn);
        Assert.Equal("Female", result.Value.Gender);
        Assert.Equal("Sokha Officer", result.Value.CreatedByName);
        Assert.Equal(_campaign, result.Value.CampaignId);
        Assert.Single(_repository.Candidates);
        Assert.Equal(1, _repository.SaveCount);

        var audit = Assert.Single(_repository.Audit);
        Assert.Equal(AuditAction.Created, audit.Action);
        Assert.Equal(result.Value.Id, audit.CandidateId);
        Assert.Equal(_campaign, audit.CampaignId);
        Assert.Null(audit.BeforeJson);
        Assert.Contains("Sok Chenda", audit.AfterJson);
        Assert.Equal("officer-1", audit.ChangedById);
        Assert.Equal("Sokha Officer", audit.ChangedByName);
    }

    [Fact]
    public async Task Create_needs_a_signed_in_user()
    {
        _user.User = null;

        var result = await _service.CreateAsync(_campaign, Form(), CancellationToken.None);

        Assert.Equal(CandidateErrors.NoUser, result.Error);
        Assert.Empty(_repository.Candidates);
    }

    [Fact]
    public async Task Create_for_an_unknown_campaign_is_not_found()
    {
        var result = await _service.CreateAsync(Guid.NewGuid(), Form(), CancellationToken.None);

        Assert.Equal(CampaignErrors.NotFound, result.Error);
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Active")]
    public async Task Create_works_while_the_campaign_is_a_draft_or_running(string status)
    {
        var campaign = _gateway.AddCampaign(status).CampaignId;

        Assert.True((await _service.CreateAsync(campaign, Form(), CancellationToken.None)).IsSuccess);
    }

    [Fact]
    public async Task Create_is_refused_once_the_campaign_is_closed()
    {
        var closed = _gateway.AddCampaign("Closed").CampaignId;

        var result = await _service.CreateAsync(closed, Form(), CancellationToken.None);

        Assert.Equal(CandidateErrors.CampaignClosed, result.Error);
        Assert.Empty(_repository.Candidates);
        Assert.Equal(0, _repository.SaveCount);
    }

    [Fact]
    public async Task Create_reports_every_field_problem_at_once_and_stores_nothing()
    {
        var result = await _service.CreateAsync(
            _campaign, Form(nameEn: "Sok 123", phone: "bad", gender: "other", schoolHostId: Guid.NewGuid(), sessionId: Guid.NewGuid()), CancellationToken.None);

        foreach (var field in new[] { "nameEn", "phone", "gender", "schoolHostId", "sessionId" })
        {
            Assert.Contains(field, result.Error.FieldErrors!.Keys);
        }

        Assert.Empty(_repository.Candidates);
        Assert.Empty(_repository.Audit);
        Assert.Equal(0, _repository.SaveCount);
    }

    [Theory]
    [InlineData("female", Gender.Female)]
    [InlineData(" MALE ", Gender.Male)]
    public async Task Gender_is_read_by_name_in_any_case(string typed, Gender expected)
    {
        var created = await AddAsync(Form(gender: typed));

        Assert.Equal(expected.ToString(), created.Gender);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("3")]
    [InlineData("Other")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Gender_that_is_not_a_name_is_refused(string? typed)
    {
        var result = await _service.CreateAsync(_campaign, Form(gender: typed), CancellationToken.None);

        Assert.Single(FieldErrors(result, "gender"));
    }

    // ---------- Phone ----------

    [Fact]
    public async Task Create_refuses_a_phone_that_is_already_in_the_campaign_and_names_the_candidate()
    {
        await AddAsync(Form(nameEn: "Vann Dara", phone: "012 345 678"));

        var result = await _service.CreateAsync(_campaign, Form(nameEn: "Sok Chenda", phone: "+855 12 345 678"), CancellationToken.None);

        Assert.Equal(ErrorType.Conflict, result.Error.Type);
        Assert.Equal("candidates.duplicate_phone", result.Error.Code);
        Assert.Contains("Vann Dara", result.Error.Message);
        Assert.Single(_repository.Candidates);
        Assert.Equal(0, _repository.SaveCount);
    }

    [Fact]
    public async Task The_same_phone_is_fine_in_another_campaign()
    {
        var other = _gateway.AddCampaign().CampaignId;
        await AddAsync(Form(phone: "012 345 678"));

        Assert.True((await _service.CreateAsync(other, Form(phone: "012 345 678"), CancellationToken.None)).IsSuccess);
    }

    [Fact]
    public async Task A_phone_taken_between_the_check_and_the_save_comes_back_as_taken()
    {
        _repository.FailNextSave = CandidateErrors.PhoneTaken;

        var result = await _service.CreateAsync(_campaign, Form(), CancellationToken.None);

        Assert.Equal(CandidateErrors.PhoneTaken, result.Error);
    }

    // ---------- School ----------

    [Fact]
    public async Task A_school_from_the_directory_gets_its_name_from_there_not_from_the_form()
    {
        var school = _schools.Add("Bak Touk High School");

        var created = await AddAsync(Form(schoolHostId: school.Id, schoolName: "Something the form made up"));

        Assert.Equal(school.Id, created.SchoolHostId);
        Assert.Equal("Bak Touk High School", created.SchoolName);
    }

    [Fact]
    public async Task A_typed_school_has_no_host()
    {
        var created = await AddAsync(Form(schoolHostId: null, schoolName: "Tiny Village School"));

        Assert.Null(created.SchoolHostId);
        Assert.Equal("Tiny Village School", created.SchoolName);
    }

    [Fact]
    public async Task A_host_that_is_not_an_active_high_school_is_refused()
    {
        var result = await _service.CreateAsync(_campaign, Form(schoolHostId: Guid.NewGuid()), CancellationToken.None);

        Assert.Single(FieldErrors(result, "schoolHostId"));
    }

    // ---------- Session ----------

    [Fact]
    public async Task A_session_of_the_campaign_can_be_chosen_and_shows_in_the_result()
    {
        var session = _sessions.Add(_campaign, "Battambang open day", date: new DateOnly(2027, 3, 1));

        var created = await AddAsync(Form(sessionId: session.Id));

        Assert.Equal(session.Id, created.Session!.Id);
        Assert.Equal("Battambang open day", created.Session.Title);
        Assert.Equal(new DateOnly(2027, 3, 1), created.Session.Date);
    }

    [Fact]
    public async Task The_session_is_optional()
    {
        Assert.Null((await AddAsync(Form(sessionId: null))).Session);
    }

    [Fact]
    public async Task A_session_of_another_campaign_is_refused()
    {
        var other = _gateway.AddCampaign().CampaignId;
        var session = _sessions.Add(other);

        var result = await _service.CreateAsync(_campaign, Form(sessionId: session.Id), CancellationToken.None);

        Assert.Single(FieldErrors(result, "sessionId"));
    }

    [Theory]
    [InlineData("Cancelled")]
    [InlineData("Unscheduled")]
    public async Task A_session_that_cannot_be_chosen_is_refused(string status)
    {
        var session = _sessions.Add(_campaign, status: status);

        var result = await _service.CreateAsync(_campaign, Form(sessionId: session.Id), CancellationToken.None);

        Assert.Single(FieldErrors(result, "sessionId"));
    }

    // ---------- NGO ----------

    [Fact]
    public async Task Ngo_support_is_stored_with_its_name()
    {
        var created = await AddAsync(Form(ngo: true, ngoName: "Hope NGO"));

        Assert.True(created.HasNgoSupport);
        Assert.Equal("Hope NGO", created.NgoName);
    }

    [Fact]
    public async Task A_missing_ngo_answer_means_no_support()
    {
        Assert.False((await AddAsync(Form(ngo: null))).HasNgoSupport);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Update_changes_the_candidate_and_audits_before_and_after()
    {
        var created = await AddAsync(Form(nameEn: "Sok Chenda"));

        var result = await _service.UpdateAsync(
            _campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, version: created.Version), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sok Dara", result.Value.NameEn);
        Assert.Equal(1, _repository.SaveCount);

        var audit = Assert.Single(_repository.Audit);
        Assert.Equal(AuditAction.Updated, audit.Action);
        Assert.Contains("Sok Chenda", audit.BeforeJson);
        Assert.Contains("Sok Dara", audit.AfterJson);
    }

    [Fact]
    public async Task Update_with_no_real_change_saves_and_audits_nothing()
    {
        var created = await AddAsync();

        var result = await _service.UpdateAsync(
            _campaign, created.Id, Form(phone: created.Phone, version: created.Version), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, _repository.SaveCount);
        Assert.Empty(_repository.Audit);
    }

    [Fact]
    public async Task Update_without_the_version_or_with_an_old_one_is_a_concurrent_edit()
    {
        var created = await AddAsync();

        var missing = await _service.UpdateAsync(_campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, version: null), CancellationToken.None);
        var stale = await _service.UpdateAsync(_campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, version: created.Version + 5), CancellationToken.None);

        Assert.Equal(CandidateErrors.ConcurrentEdit, missing.Error);
        Assert.Equal(CandidateErrors.ConcurrentEdit, stale.Error);
        Assert.Equal("Sok Chenda", _repository.Candidates[created.Id].NameEn);
    }

    [Fact]
    public async Task Update_of_an_unknown_candidate_or_one_in_another_campaign_is_not_found()
    {
        var other = _gateway.AddCampaign().CampaignId;
        var created = await AddAsync();

        Assert.Equal(CandidateErrors.NotFound, (await _service.UpdateAsync(_campaign, Guid.NewGuid(), Form(version: 0), CancellationToken.None)).Error);
        Assert.Equal(CandidateErrors.NotFound, (await _service.UpdateAsync(other, created.Id, Form(version: created.Version), CancellationToken.None)).Error);
    }

    [Fact]
    public async Task Update_is_refused_once_the_campaign_is_closed()
    {
        var created = await AddAsync();
        _gateway.Campaigns[_campaign] = _gateway.Campaigns[_campaign] with { Status = "Closed" };

        var result = await _service.UpdateAsync(_campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, version: created.Version), CancellationToken.None);

        Assert.Equal(CandidateErrors.CampaignClosed, result.Error);
        Assert.Equal("Sok Chenda", _repository.Candidates[created.Id].NameEn);
    }

    [Fact]
    public async Task Update_may_keep_its_own_phone_but_not_take_another_candidates()
    {
        var first = await AddAsync(Form(phone: "012 345 678"));
        var second = await AddAsync(Form(nameEn: "Vann Dara", phone: "097 111 2222"));

        var keeps = await _service.UpdateAsync(_campaign, first.Id, Form(nameEn: "Sok Dara", phone: "012 345 678", version: first.Version), CancellationToken.None);
        var takes = await _service.UpdateAsync(_campaign, second.Id, Form(nameEn: "Vann Dara", phone: "012 345 678", version: second.Version), CancellationToken.None);

        Assert.True(keeps.IsSuccess);
        Assert.Equal("candidates.duplicate_phone", takes.Error.Code);
        Assert.Equal("0971112222", _repository.Candidates[second.Id].Phone);
    }

    [Fact]
    public async Task A_refused_update_leaves_the_candidate_as_it_was()
    {
        var created = await AddAsync();

        var result = await _service.UpdateAsync(_campaign, created.Id, Form(nameEn: "Sok 123", phone: created.Phone, version: created.Version), CancellationToken.None);

        Assert.Single(FieldErrors(result, "nameEn"));
        Assert.Equal("Sok Chenda", _repository.Candidates[created.Id].NameEn);
        Assert.Equal(0, _repository.SaveCount);
    }

    [Fact]
    public async Task An_unchanged_school_stays_even_after_it_was_switched_off()
    {
        var school = _schools.Add("Bak Touk High School");
        var created = await AddAsync(Form(schoolHostId: school.Id));
        _schools.Active.Clear();

        var result = await _service.UpdateAsync(
            _campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, schoolHostId: school.Id, version: created.Version), CancellationToken.None);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : "");
        Assert.Equal(school.Id, result.Value.SchoolHostId);
        Assert.Equal("Bak Touk High School", result.Value.SchoolName);
    }

    [Fact]
    public async Task A_switched_off_school_cannot_be_newly_chosen()
    {
        var school = _schools.Add("Bak Touk High School");
        var created = await AddAsync();
        _schools.Active.Clear();

        var result = await _service.UpdateAsync(
            _campaign, created.Id, Form(phone: created.Phone, schoolHostId: school.Id, version: created.Version), CancellationToken.None);

        Assert.Single(FieldErrors(result, "schoolHostId"));
    }

    [Fact]
    public async Task An_unchanged_session_stays_even_after_it_was_cancelled_but_a_cancelled_one_cannot_be_newly_chosen()
    {
        var session = _sessions.Add(_campaign, "Open day");
        var created = await AddAsync(Form(sessionId: session.Id));
        var cancelled = _sessions.Add(_campaign, "Rained off", status: "Cancelled");
        _sessions.SetStatus(session.Id, "Cancelled"); // called off after the candidate was added

        var keepsRef = await _service.UpdateAsync(
            _campaign, created.Id, Form(nameEn: "Sok Dara", phone: created.Phone, sessionId: session.Id, version: created.Version), CancellationToken.None);
        var picksCancelled = await _service.UpdateAsync(
            _campaign, created.Id, Form(phone: created.Phone, sessionId: cancelled.Id, version: created.Version), CancellationToken.None);

        Assert.True(keepsRef.IsSuccess);
        Assert.Single(FieldErrors(picksCancelled, "sessionId"));
    }

    [Fact]
    public async Task Update_can_clear_the_session_and_the_ngo()
    {
        var session = _sessions.Add(_campaign);
        var created = await AddAsync(Form(sessionId: session.Id, ngo: true, ngoName: "Hope NGO"));

        var result = await _service.UpdateAsync(
            _campaign, created.Id, Form(phone: created.Phone, sessionId: null, ngo: false, version: created.Version), CancellationToken.None);

        Assert.Null(result.Value.Session);
        Assert.False(result.Value.HasNgoSupport);
        Assert.Null(result.Value.NgoName);
    }

    // ---------- Delete ----------

    [Fact]
    public async Task Delete_removes_the_candidate_and_audits_what_it_looked_like()
    {
        var created = await AddAsync(Form(nameEn: "Sok Chenda"));

        var result = await _service.DeleteAsync(_campaign, created.Id, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(_repository.Candidates);
        var audit = Assert.Single(_repository.Audit);
        Assert.Equal(AuditAction.Deleted, audit.Action);
        Assert.Contains("Sok Chenda", audit.BeforeJson);
        Assert.Null(audit.AfterJson);
    }

    [Fact]
    public async Task Delete_of_an_unknown_candidate_or_one_in_another_campaign_is_not_found()
    {
        var other = _gateway.AddCampaign().CampaignId;
        var created = await AddAsync();

        Assert.Equal(CandidateErrors.NotFound, (await _service.DeleteAsync(_campaign, Guid.NewGuid(), CancellationToken.None)).Error);
        Assert.Equal(CandidateErrors.NotFound, (await _service.DeleteAsync(other, created.Id, CancellationToken.None)).Error);
        Assert.Single(_repository.Candidates);
    }

    [Fact]
    public async Task Delete_is_refused_once_the_campaign_is_closed()
    {
        var created = await AddAsync();
        _gateway.Campaigns[_campaign] = _gateway.Campaigns[_campaign] with { Status = "Closed" };

        var result = await _service.DeleteAsync(_campaign, created.Id, CancellationToken.None);

        Assert.Equal(CandidateErrors.CampaignClosed, result.Error);
        Assert.Single(_repository.Candidates);
    }

    [Fact]
    public async Task Delete_needs_a_signed_in_user()
    {
        var created = await AddAsync();
        _user.User = null;

        Assert.Equal(CandidateErrors.NoUser, (await _service.DeleteAsync(_campaign, created.Id, CancellationToken.None)).Error);
    }

    // ---------- Reading ----------

    [Fact]
    public async Task Get_returns_a_candidate_with_its_session_and_is_campaign_scoped()
    {
        var other = _gateway.AddCampaign().CampaignId;
        var session = _sessions.Add(_campaign, "Open day");
        var created = await AddAsync(Form(sessionId: session.Id));

        var found = await _service.GetAsync(_campaign, created.Id, CancellationToken.None);

        Assert.Equal("Open day", found.Value.Session!.Title);
        Assert.Equal(CandidateErrors.NotFound, (await _service.GetAsync(other, created.Id, CancellationToken.None)).Error);
        Assert.Equal(CampaignErrors.NotFound, (await _service.GetAsync(Guid.NewGuid(), created.Id, CancellationToken.None)).Error);
    }

    [Fact]
    public async Task A_cancelled_session_still_shows_on_the_candidate_as_cancelled()
    {
        var session = _sessions.Add(_campaign, "Open day");
        var created = await AddAsync(Form(sessionId: session.Id));
        _sessions.SetStatus(session.Id, "Cancelled");

        var found = await _service.GetAsync(_campaign, created.Id, CancellationToken.None);

        Assert.Equal("Cancelled", found.Value.Session!.Status);
    }

    [Fact]
    public async Task List_gives_the_campaign_its_page_its_provinces_and_whether_it_can_change()
    {
        await AddAsync(Form(province: "Siem Reap"));
        await AddAsync(Form(province: "Battambang"));
        await AddAsync(Form(province: "Siem Reap"), campaign: _gateway.AddCampaign().CampaignId);

        var result = await _service.ListAsync(_campaign, new CandidateListRequest(null, null, null, null, null, null), CancellationToken.None);

        Assert.Equal(2, result.Value.TotalCount);
        Assert.Equal(2, result.Value.Items.Count);
        Assert.Equal(["Battambang", "Siem Reap"], result.Value.Provinces);
        Assert.Equal("Selection 2027", result.Value.CampaignName);
        Assert.True(result.Value.CanChange);
    }

    [Fact]
    public async Task List_cannot_change_once_the_campaign_is_closed_but_can_still_be_read()
    {
        await AddAsync();
        _gateway.Campaigns[_campaign] = _gateway.Campaigns[_campaign] with { Status = "Closed" };

        var result = await _service.ListAsync(_campaign, new CandidateListRequest(null, null, null, null, null, null), CancellationToken.None);

        Assert.False(result.Value.CanChange);
        Assert.Single(result.Value.Items);
    }

    [Fact]
    public async Task List_for_an_unknown_campaign_is_not_found() =>
        Assert.Equal(
            CampaignErrors.NotFound,
            (await _service.ListAsync(Guid.NewGuid(), new CandidateListRequest(null, null, null, null, null, null), CancellationToken.None)).Error);

    [Theory]
    [InlineData(null, null, 1, 20)]
    [InlineData(0, 0, 1, 20)]
    [InlineData(-3, -1, 1, 20)]
    [InlineData(2, 50, 2, 50)]
    [InlineData(1, 1000, 1, 100)]
    public async Task List_keeps_the_page_and_its_size_within_sensible_limits(int? page, int? size, int expectedPage, int expectedSize)
    {
        await _service.ListAsync(_campaign, new CandidateListRequest(null, null, null, null, page, size), CancellationToken.None);

        Assert.Equal(expectedPage, _repository.LastQuery!.Page);
        Assert.Equal(expectedSize, _repository.LastQuery.PageSize);
    }

    [Fact]
    public async Task List_passes_the_search_and_filters_on()
    {
        var session = Guid.NewGuid();

        await _service.ListAsync(_campaign, new CandidateListRequest("chenda", "Battambang", session, true, 1, 10), CancellationToken.None);

        var query = _repository.LastQuery!;
        Assert.Equal(("chenda", "Battambang", session, true), (query.Search, query.ProvinceName, query.SessionId, query.NgoSupport));
    }

    [Fact]
    public async Task Session_choices_are_only_the_ones_that_can_be_chosen()
    {
        var good = _sessions.Add(_campaign, "Planned one");
        _sessions.Add(_campaign, "Called off", status: "Cancelled");
        _sessions.Add(_campaign, "Copied", status: "Unscheduled");
        _sessions.Add(_gateway.AddCampaign().CampaignId, "Other campaign");

        var result = await _service.ListSessionChoicesAsync(_campaign, CancellationToken.None);

        Assert.Equal(good.Id, Assert.Single(result.Value).Id);
        Assert.Equal(CampaignErrors.NotFound, (await _service.ListSessionChoicesAsync(Guid.NewGuid(), CancellationToken.None)).Error);
    }

    [Fact]
    public async Task Schools_are_the_active_high_schools()
    {
        _schools.Add("Zeta High School");
        _schools.Add("Alpha High School");

        var list = await _service.ListSchoolsAsync(CancellationToken.None);

        Assert.Equal(["Alpha High School", "Zeta High School"], list.Select(s => s.Name));
    }
}
