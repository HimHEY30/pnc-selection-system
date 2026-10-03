using Sessions.Domain;
using SharedKernel;

namespace Sessions.Tests.Domain;

public sealed class SessionHostTests
{
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);

    private static HostDetails Alumnus(string name = "Chenda Sok", string? phone = "012 345 678", string? email = null) =>
        new(HostType.Alumni, name, null, null, phone, email);

    private static HostDetails Partner(
        string name = "Hope NGO",
        PartnerKind? kind = PartnerKind.Ngo,
        string? contact = "Mr Rith",
        string? phone = "+855 12 345 678",
        string? email = null) => new(HostType.Partner, name, kind, contact, phone, email);

    private static string[] Errors(Result result, string field)
    {
        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    [Fact]
    public void An_alumnus_is_created_active_with_tidied_text()
    {
        var host = SessionHost.Create(Alumnus(name: "  Chenda   Sok "), "m1", "Dara", Now).Value;

        Assert.Equal("Chenda Sok", host.Name);
        Assert.Equal("chenda sok", host.NameNormalized);
        Assert.Equal(HostType.Alumni, host.Type);
        Assert.True(host.IsActive);
        Assert.Null(host.PartnerKind);
        Assert.Equal("m1", host.CreatedById);
    }

    [Fact]
    public void An_alumnus_keeps_no_partner_details()
    {
        var details = new HostDetails(HostType.Alumni, "Chenda", PartnerKind.Ngo, "Someone", "012 345 678", null);

        var host = SessionHost.Create(details, "m1", "Dara", Now).Value;

        Assert.Null(host.PartnerKind);
        Assert.Null(host.ContactPerson);
    }

    [Fact]
    public void A_partner_keeps_its_kind_and_contact_person()
    {
        var host = SessionHost.Create(Partner(contact: "  Mr   Rith "), "m1", "Dara", Now).Value;

        Assert.Equal(PartnerKind.Ngo, host.PartnerKind);
        Assert.Equal("Mr Rith", host.ContactPerson);
    }

    [Fact]
    public void A_partner_needs_a_kind()
    {
        Assert.Equal(["Choose what kind of organisation this is."], Errors(SessionHost.Create(Partner(kind: null), "m", "M", Now), "partnerKind"));
        Assert.Single(Errors(SessionHost.Create(Partner(kind: (PartnerKind)9), "m", "M", Now), "partnerKind"));
    }

    [Theory]
    [InlineData(HostType.Officer)]
    [InlineData((HostType)9)]
    public void Only_alumni_and_partners_are_directory_hosts(HostType type)
    {
        var result = SessionHost.Create(new HostDetails(type, "Sokha", null, null, "012 345 678", null), "m", "M", Now);

        Assert.Single(Errors(result, "type"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void A_host_needs_a_name(string name) =>
        Assert.Equal(["Enter a name."], Errors(SessionHost.Create(Alumnus(name: name), "m", "M", Now), "name"));

    [Fact]
    public void A_name_has_at_most_120_characters()
    {
        Assert.True(SessionHost.Create(Alumnus(name: new string('a', 120)), "m", "M", Now).IsSuccess);
        Assert.Single(Errors(SessionHost.Create(Alumnus(name: new string('a', 121)), "m", "M", Now), "name"));
    }

    [Fact]
    public void A_host_needs_a_phone_or_an_email()
    {
        Assert.Equal(
            ["Give a phone number or an email address, so the host can be reached."],
            Errors(SessionHost.Create(Alumnus(phone: null, email: null), "m", "M", Now), "phone"));

        Assert.True(SessionHost.Create(Alumnus(phone: null, email: "chenda@example.org"), "m", "M", Now).IsSuccess);
        Assert.True(SessionHost.Create(Alumnus(phone: "012 345 678", email: null), "m", "M", Now).IsSuccess);
    }

    [Theory]
    [InlineData("12")]
    [InlineData("call me")]
    [InlineData("012-abc-678")]
    [InlineData("((((((")]
    [InlineData("(1) (2)")]
    public void A_phone_must_look_like_a_phone_number(string phone) =>
        Assert.Single(Errors(SessionHost.Create(Alumnus(phone: phone), "m", "M", Now), "phone"));

    [Theory]
    [InlineData("012 345 678")]
    [InlineData("+855 12 345 678")]
    [InlineData("(023) 123-456")]
    public void Common_phone_formats_are_accepted(string phone) =>
        Assert.True(SessionHost.Create(Alumnus(phone: phone), "m", "M", Now).IsSuccess);

    [Theory]
    [InlineData("chenda")]
    [InlineData("chenda@")]
    [InlineData("@example.org")]
    [InlineData("chenda @example.org")]
    public void An_email_must_look_like_an_email(string email) =>
        Assert.Single(Errors(SessionHost.Create(Alumnus(email: email), "m", "M", Now), "email"));

    [Fact]
    public void An_unusable_phone_is_not_also_reported_as_missing()
    {
        var result = SessionHost.Create(Alumnus(phone: "12", email: null), "m", "M", Now);

        Assert.Equal(["Enter a phone number such as 012 345 678 or +855 12 345 678."], Errors(result, "phone"));
    }

    [Fact]
    public void Update_changes_the_details_but_not_the_type()
    {
        var host = SessionHost.Create(Partner(), "m", "M", Now).Value;

        Assert.True(host.Update(Partner(name: "Hope Foundation", kind: PartnerKind.University), Now.AddHours(1)).IsSuccess);
        Assert.Equal("Hope Foundation", host.Name);
        Assert.Equal("hope foundation", host.NameNormalized);
        Assert.Equal(PartnerKind.University, host.PartnerKind);
        Assert.Equal(Now.AddHours(1), host.UpdatedAt);

        Assert.Single(Errors(host.Update(Alumnus(), Now), "type"));
        Assert.Equal(HostType.Partner, host.Type);
    }

    [Fact]
    public void A_failed_update_changes_nothing()
    {
        var host = SessionHost.Create(Partner(), "m", "M", Now).Value;

        Assert.True(host.Update(Partner(name: ""), Now.AddHours(1)).IsFailure);
        Assert.Equal("Hope NGO", host.Name);
        Assert.Equal(Now, host.UpdatedAt);
    }

    [Fact]
    public void A_host_can_be_switched_off_and_on()
    {
        var host = SessionHost.Create(Alumnus(), "m", "M", Now).Value;

        host.SetActive(false, Now.AddHours(1));
        Assert.False(host.IsActive);

        host.SetActive(true, Now.AddHours(2));
        Assert.True(host.IsActive);
        Assert.Equal(Now.AddHours(2), host.UpdatedAt);
    }
}
