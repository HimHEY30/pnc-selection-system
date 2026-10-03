using System.Text.RegularExpressions;
using SharedKernel;

namespace Sessions.Domain;

/// <summary>What a person types to describe an alumnus or a partner.</summary>
public sealed record HostDetails(
    HostType Type,
    string Name,
    PartnerKind? PartnerKind,
    string? ContactPerson,
    string? Phone,
    string? Email);

/// <summary>
/// An alumnus or a partner organisation that can run information sessions. They are not system
/// users, so they live in this reusable directory. Officers are not here: a session points at the
/// staff member directly. A host is switched off instead of deleted, so old sessions keep their host.
/// </summary>
public sealed class SessionHost
{
    private static readonly Regex PhonePattern = new(@"^\+?[0-9(][0-9 ()\-]{4,}$", RegexOptions.Compiled);

    /// <summary>A phone number has at least this many digits, so "((((((" is not one.</summary>
    private const int PhoneMinDigits = 6;
    private static readonly Regex EmailPattern = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    public Guid Id { get; private set; }
    public HostType Type { get; private set; }
    public string Name { get; private set; } = string.Empty;

    /// <summary>Trimmed, case-folded name. Backs the unique index (one alumnus or partner per name).</summary>
    public string NameNormalized { get; private set; } = string.Empty;

    /// <summary>What kind of organisation, for a partner. Null for an alumnus.</summary>
    public PartnerKind? PartnerKind { get; private set; }

    /// <summary>Who to call at a partner organisation.</summary>
    public string? ContactPerson { get; private set; }

    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public bool IsActive { get; private set; }

    public string CreatedById { get; private set; } = string.Empty;
    public string CreatedByName { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>PostgreSQL xmin. Detects two people saving the same host at once.</summary>
    public uint Version { get; private set; }

    private SessionHost() { }

    public static string Normalize(string name) => name.Trim().ToLowerInvariant();

    public static Result<SessionHost> Create(HostDetails details, string createdById, string createdByName, DateTimeOffset now)
    {
        var checkedDetails = Check(details);
        if (checkedDetails.IsFailure)
        {
            return Result.Failure<SessionHost>(checkedDetails.Error);
        }

        var host = new SessionHost
        {
            Id = Guid.NewGuid(),
            IsActive = true,
            CreatedById = createdById,
            CreatedByName = createdByName,
            CreatedAt = now,
        };
        host.Apply(checkedDetails.Value, now);
        return host;
    }

    /// <summary>Changes a host's details. A host cannot change from alumnus to partner or back.</summary>
    public Result Update(HostDetails details, DateTimeOffset now)
    {
        if (details.Type != Type)
        {
            return Result.Failure(SessionErrors.Invalid("type", "A host cannot change from alumnus to partner or back. Add a new host instead."));
        }

        var checkedDetails = Check(details);
        if (checkedDetails.IsFailure)
        {
            return Result.Failure(checkedDetails.Error);
        }

        Apply(checkedDetails.Value, now);
        return Result.Success();
    }

    public void SetActive(bool active, DateTimeOffset now)
    {
        IsActive = active;
        UpdatedAt = now;
    }

    private void Apply(HostDetails d, DateTimeOffset now)
    {
        Type = d.Type;
        Name = d.Name;
        NameNormalized = Normalize(d.Name);
        PartnerKind = d.PartnerKind;
        ContactPerson = d.ContactPerson;
        Phone = d.Phone;
        Email = d.Email;
        UpdatedAt = now;
    }

    /// <summary>Tidies the text and returns the details to store, or every problem found.</summary>
    private static Result<HostDetails> Check(HostDetails details)
    {
        var errors = new Dictionary<string, string[]>();

        if (details.Type is not (HostType.Alumni or HostType.Partner))
        {
            errors["type"] = ["Choose alumnus or partner. An officer is picked on the session itself."];
        }

        var name = SessionLimits.Clean(details.Name);
        if (name is null)
        {
            errors["name"] = ["Enter a name."];
        }
        else if (name.Length > SessionLimits.HostNameMax)
        {
            errors["name"] = [$"Use at most {SessionLimits.HostNameMax} characters."];
        }

        PartnerKind? kind = null;
        string? contactPerson = null;
        if (details.Type == HostType.Partner)
        {
            if (details.PartnerKind is null || !Enum.IsDefined(details.PartnerKind.Value))
            {
                errors["partnerKind"] = ["Choose what kind of organisation this is."];
            }
            else
            {
                kind = details.PartnerKind;
            }

            contactPerson = SessionLimits.Clean(details.ContactPerson);
            if (contactPerson is { Length: > SessionLimits.ContactMax })
            {
                errors["contactPerson"] = [$"Use at most {SessionLimits.ContactMax} characters."];
            }
        }

        var phone = SessionLimits.Clean(details.Phone);
        if (phone is not null
            && (phone.Length > SessionLimits.PhoneMax
                || !PhonePattern.IsMatch(phone)
                || phone.Count(char.IsDigit) < PhoneMinDigits))
        {
            errors["phone"] = ["Enter a phone number such as 012 345 678 or +855 12 345 678."];
        }

        var email = details.Email?.Trim();
        email = string.IsNullOrEmpty(email) ? null : email;
        if (email is not null && (email.Length > SessionLimits.EmailMax || !EmailPattern.IsMatch(email)))
        {
            errors["email"] = ["Enter an email address such as name@example.org."];
        }

        if (phone is null && email is null && !errors.ContainsKey("phone") && !errors.ContainsKey("email"))
        {
            errors["phone"] = ["Give a phone number or an email address, so the host can be reached."];
        }

        return errors.Count > 0
            ? Result.Failure<HostDetails>(SessionErrors.Invalid(errors))
            : Result.Success(new HostDetails(details.Type, name!, kind, contactPerson, phone, email));
    }
}
