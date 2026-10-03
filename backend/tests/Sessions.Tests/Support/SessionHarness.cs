using Campaigns.Application;
using Campaigns.Domain;
using Identity.Domain;
using Sessions.Application;
using Sessions.Domain;

namespace Sessions.Tests.Support;

/// <summary>Wires the session service to the fakes, with a draft campaign and two directory hosts ready, and builds requests.</summary>
public sealed class SessionHarness
{
    public FakeRepository Repository { get; } = new();
    public FakeGateway Gateway { get; } = new();
    public FakeCurrentUser User { get; } = new();
    public FakeStaffDirectory Staff { get; } = new();
    public FakeClock Clock { get; } = new();
    public SessionService Service { get; }

    public CampaignSetupContext Campaign { get; private set; }
    public SessionHost Alumnus { get; }
    public SessionHost Partner { get; }

    public SessionHarness(string campaignStatus = "Draft")
    {
        Service = new SessionService(Repository, Gateway, User, Staff, Clock);
        Campaign = Gateway.AddCampaign(campaignStatus);

        Alumnus = AddHost(new HostDetails(HostType.Alumni, "Chenda Sok", null, null, "012 345 678", null));
        Partner = AddHost(new HostDetails(HostType.Partner, "Hope NGO", PartnerKind.Ngo, "Mr Rith", "012 999 888", null));
    }

    public Guid CampaignId => Campaign.CampaignId;

    public SessionHost AddHost(HostDetails details)
    {
        var host = SessionHost.Create(details, "manager-1", "Dara Manager", Clock.UtcNow).Value;
        Repository.AddHost(host);
        return host;
    }

    public CampaignSetupContext AddCampaign(string status = "Draft") => Gateway.AddCampaign(status);

    /// <summary>A valid form for an in-person session run by officer-1 and assigned to the signed-in manager.</summary>
    public static SessionRequest Request(
        string title = "Open day at Kampong Cham High School",
        DateOnly? date = null,
        string start = "09:00",
        string end = "11:00",
        string format = "InPerson",
        string? venue = "School hall",
        string? link = null,
        short? province = null,
        string? notes = null,
        string assignee = "manager-1",
        string hostType = "Officer",
        Guid? hostId = null,
        string? hostUserId = "officer-1") => new(
        title, date ?? new DateOnly(2027, 3, 20), start, end, format, venue, link, province, notes, assignee, hostType, hostId, hostUserId);

    public SessionRequest AlumnusRequest(string start = "09:00", string end = "11:00", DateOnly? date = null) =>
        Request(start: start, end: end, date: date, hostType: "Alumni", hostId: Alumnus.Id, hostUserId: null);

    public SessionRequest PartnerRequest(string start = "09:00", string end = "11:00", DateOnly? date = null) =>
        Request(start: start, end: end, date: date, hostType: "Partner", hostId: Partner.Id, hostUserId: null);

    public async Task<SessionDto> CreateAsync(SessionRequest? request = null, Guid? campaignId = null)
    {
        var result = await Service.CreateAsync(campaignId ?? CampaignId, request ?? Request(), CancellationToken.None);
        Assert.True(result.IsSuccess, result.IsFailure ? $"{result.Error.Code}: {result.Error.Message}" : "");
        return result.Value;
    }

    public void SignInAs(string subject, string name, params Group[] groups) => User.SignInAs(subject, name, groups);
}
