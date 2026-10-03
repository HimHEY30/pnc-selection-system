using Sessions.Application;
using Sessions.Domain;
using Sessions.Tests.Support;

namespace Sessions.Tests.Application;

public sealed class CandidateLookupsTests
{
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
    private readonly FakeRepository _repository = new();
    private readonly SessionChoices _sessions;
    private readonly SchoolDirectory _schools;

    public CandidateLookupsTests()
    {
        _sessions = new SessionChoices(_repository);
        _schools = new SchoolDirectory(_repository);
    }

    // ---------- sessions ----------

    private InformationSession AddPlanned(Guid campaignId, string title, DateOnly date)
    {
        var details = new SessionDetails(
            title, date, new TimeOnly(9, 0), new TimeOnly(10, 0), SessionFormat.InPerson, "Hall", null, null, null,
            "officer-1", "Sokha Officer", new HostRef(HostType.Officer, null, "officer-1", "Sokha Officer"));
        var session = InformationSession.Create(campaignId, details, "u", "U", Now).Value;
        _repository.AddSession(session);
        return session;
    }

    private InformationSession AddUnscheduled(Guid campaignId, string title)
    {
        var session = InformationSession.CreateUnscheduled(
            campaignId, new SessionTemplate(title, SessionFormat.InPerson, "Hall", null, null, null), "u", "U", Now).Value;
        _repository.AddSession(session);
        return session;
    }

    [Fact]
    public async Task A_campaigns_sessions_are_listed_soonest_first_with_the_undated_ones_last()
    {
        var campaign = Guid.NewGuid();
        AddUnscheduled(campaign, "Copied session");
        AddPlanned(campaign, "Later", new DateOnly(2027, 4, 1));
        AddPlanned(campaign, "Sooner", new DateOnly(2027, 3, 1));

        var list = await _sessions.ForCampaignAsync(campaign, CancellationToken.None);

        Assert.Equal(["Sooner", "Later", "Copied session"], list.Select(s => s.Title));
    }

    [Fact]
    public async Task Only_this_campaigns_sessions_are_listed()
    {
        var campaign = Guid.NewGuid();
        var mine = AddPlanned(campaign, "Mine", new DateOnly(2027, 3, 1));
        AddPlanned(Guid.NewGuid(), "Someone else's", new DateOnly(2027, 3, 1));

        var list = await _sessions.ForCampaignAsync(campaign, CancellationToken.None);

        Assert.Equal(mine.Id, Assert.Single(list).Id);
    }

    [Fact]
    public async Task A_planned_session_can_be_chosen_and_shows_its_date_and_status()
    {
        var campaign = Guid.NewGuid();
        var session = AddPlanned(campaign, "Battambang open day", new DateOnly(2027, 3, 1));

        var choice = await _sessions.FindAsync(campaign, session.Id, CancellationToken.None);

        Assert.NotNull(choice);
        Assert.Equal("Battambang open day", choice.Title);
        Assert.Equal(new DateOnly(2027, 3, 1), choice.Date);
        Assert.Equal("Planned", choice.Status);
        Assert.True(choice.CanBeChosen);
    }

    [Fact]
    public async Task A_cancelled_session_is_found_but_cannot_be_chosen()
    {
        var campaign = Guid.NewGuid();
        var session = AddPlanned(campaign, "Rained off", new DateOnly(2027, 3, 1));
        session.Cancel("Heavy rain", Now);

        var choice = await _sessions.FindAsync(campaign, session.Id, CancellationToken.None);

        Assert.Equal("Cancelled", choice!.Status);
        Assert.False(choice.CanBeChosen);
    }

    [Fact]
    public async Task An_unscheduled_session_cannot_be_chosen()
    {
        var campaign = Guid.NewGuid();
        var session = AddUnscheduled(campaign, "Copied session");

        var choice = await _sessions.FindAsync(campaign, session.Id, CancellationToken.None);

        Assert.Null(choice!.Date);
        Assert.False(choice.CanBeChosen);
    }

    [Fact]
    public async Task A_session_of_another_campaign_is_not_found()
    {
        var session = AddPlanned(Guid.NewGuid(), "Other campaign", new DateOnly(2027, 3, 1));

        Assert.Null(await _sessions.FindAsync(Guid.NewGuid(), session.Id, CancellationToken.None));
        Assert.Null(await _sessions.FindAsync(session.CampaignId, Guid.NewGuid(), CancellationToken.None));
    }

    // ---------- schools ----------

    private SessionHost AddPartner(string name, PartnerKind kind, bool active = true)
    {
        var host = SessionHost.Create(
            new HostDetails(HostType.Partner, name, kind, "Mr Rith", "012 345 678", null), "u", "U", Now).Value;
        if (!active)
        {
            host.SetActive(false, Now);
        }

        _repository.AddHost(host);
        return host;
    }

    [Fact]
    public async Task Only_active_high_schools_are_offered_by_name()
    {
        AddPartner("Zeta High School", PartnerKind.HighSchool);
        AddPartner("Alpha High School", PartnerKind.HighSchool);
        AddPartner("Hope NGO", PartnerKind.Ngo);
        AddPartner("Royal University", PartnerKind.University);
        AddPartner("Closed High School", PartnerKind.HighSchool, active: false);
        _repository.AddHost(SessionHost.Create(
            new HostDetails(HostType.Alumni, "Chenda Sok", null, null, "012 345 678", null), "u", "U", Now).Value);

        var list = await _schools.ListActiveAsync(CancellationToken.None);

        Assert.Equal(["Alpha High School", "Zeta High School"], list.Select(s => s.Name));
    }

    [Fact]
    public async Task An_active_high_school_is_found_by_id()
    {
        var school = AddPartner("Bak Touk High School", PartnerKind.HighSchool);

        var found = await _schools.FindActiveAsync(school.Id, CancellationToken.None);

        Assert.Equal(new SchoolChoice(school.Id, "Bak Touk High School"), found);
    }

    [Fact]
    public async Task A_host_that_is_not_an_active_high_school_is_not_found()
    {
        var ngo = AddPartner("Hope NGO", PartnerKind.Ngo);
        var off = AddPartner("Closed High School", PartnerKind.HighSchool, active: false);
        var alumnus = SessionHost.Create(
            new HostDetails(HostType.Alumni, "Chenda Sok", null, null, "012 345 678", null), "u", "U", Now).Value;
        _repository.AddHost(alumnus);

        Assert.Null(await _schools.FindActiveAsync(ngo.Id, CancellationToken.None));
        Assert.Null(await _schools.FindActiveAsync(off.Id, CancellationToken.None));
        Assert.Null(await _schools.FindActiveAsync(alumnus.Id, CancellationToken.None));
        Assert.Null(await _schools.FindActiveAsync(Guid.NewGuid(), CancellationToken.None));
    }
}
