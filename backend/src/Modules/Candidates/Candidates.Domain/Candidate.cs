using System.Text.RegularExpressions;
using SharedKernel;

namespace Candidates.Domain;

/// <summary>
/// One level of an address. The code comes from the address service the browser used; the name is kept next to it so
/// the record still reads correctly if that service later renames or renumbers a place. When the service could not be
/// reached the person types the name and there is no code.
/// </summary>
public sealed record Place(string? Code, string? Name);

public sealed record CandidateAddress(Place? Province, Place? District, Place? Commune, Place? Village);

/// <summary>
/// What a person types to describe a candidate. Everything is nullable so a missing field becomes a message under that
/// field rather than a failure to read the request.
/// </summary>
public sealed record CandidateDetails(
    string? NameKm,
    string? NameEn,
    Gender? Gender,
    DateOnly? DateOfBirth,
    string? Phone,
    CandidateAddress? Address,
    /// <summary>The partner (a high school) in the directory, or null when the school is typed.</summary>
    Guid? SchoolHostId,
    /// <summary>The school's name: copied from the directory by the caller, or typed.</summary>
    string? SchoolName,
    /// <summary>The information session the candidate says they came to. Optional.</summary>
    Guid? SessionId,
    bool HasNgoSupport,
    string? NgoName);

/// <summary>
/// A person applying in one campaign. The same person in a later year is a new candidate. The class keeps every rule
/// about the candidate's own fields; rules that need other data (a duplicate phone, the campaign being open, the
/// session belonging to the campaign) are checked by the service before it gets here.
/// </summary>
public sealed class Candidate
{
    private static readonly Regex EnglishName = new(@"^[A-Za-z][A-Za-z .'\-]*$", RegexOptions.Compiled);

    public Guid Id { get; private set; }
    public Guid CampaignId { get; private set; }

    public string NameKm { get; private set; } = string.Empty;
    public string NameEn { get; private set; } = string.Empty;
    public Gender Gender { get; private set; }
    public DateOnly DateOfBirth { get; private set; }

    /// <summary>Digits only, in one form: a leading 0 and then 8 or 9 digits, however it was typed.</summary>
    public string Phone { get; private set; } = string.Empty;

    public string? ProvinceCode { get; private set; }
    public string ProvinceName { get; private set; } = string.Empty;
    public string? DistrictCode { get; private set; }
    public string DistrictName { get; private set; } = string.Empty;
    public string? CommuneCode { get; private set; }
    public string CommuneName { get; private set; } = string.Empty;
    public string? VillageCode { get; private set; }
    public string? VillageName { get; private set; }

    /// <summary>Null when the school was typed because it is not in the partner directory.</summary>
    public Guid? SchoolHostId { get; private set; }
    public string SchoolName { get; private set; } = string.Empty;

    public Guid? SessionId { get; private set; }

    public bool HasNgoSupport { get; private set; }
    public string? NgoName { get; private set; }

    public string CreatedById { get; private set; } = string.Empty;
    public string CreatedByName { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>PostgreSQL xmin. Detects two people saving the same candidate at once.</summary>
    public uint Version { get; private set; }

    private Candidate() { }

    public static Result<Candidate> Create(Guid campaignId, CandidateDetails details, string createdById, string createdByName, DateTimeOffset now)
    {
        var checkedDetails = Check(details, now);
        if (checkedDetails.IsFailure)
        {
            return Result.Failure<Candidate>(checkedDetails.Error);
        }

        var candidate = new Candidate
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            CreatedById = createdById,
            CreatedByName = createdByName,
            CreatedAt = now,
        };
        candidate.Apply(checkedDetails.Value, now);
        return candidate;
    }

    public Result Change(CandidateDetails details, DateTimeOffset now)
    {
        var checkedDetails = Check(details, now);
        if (checkedDetails.IsFailure)
        {
            return Result.Failure(checkedDetails.Error);
        }

        Apply(checkedDetails.Value, now);
        return Result.Success();
    }

    /// <summary>
    /// Checks details against the rules without creating or changing anything, so the service can look for a duplicate
    /// phone before it touches a candidate it loaded. Returns the tidied details, or every problem found.
    /// </summary>
    public static Result<CandidateDetails> Validate(CandidateDetails details, DateTimeOffset now) => Check(details, now);

    /// <summary>The phone as it is stored, or null if it is not a Cambodian number. The service uses this to look for a duplicate.</summary>
    public static string? NormalizePhone(string? phone)
    {
        var text = CandidateLimits.Clean(phone);
        if (text is null)
        {
            return null;
        }

        var compact = new string(text.Where(c => c is not (' ' or '-' or '(' or ')' or '.')).ToArray());
        string national;
        if (compact.StartsWith("+855", StringComparison.Ordinal))
        {
            national = compact[4..];
        }
        else if (compact.StartsWith("00855", StringComparison.Ordinal))
        {
            national = compact[5..];
        }
        else if (compact.StartsWith('0'))
        {
            national = compact[1..];
        }
        else
        {
            return null;
        }

        // People write "+855 012 345 678" too, with the 0 that the international form drops.
        if (!compact.StartsWith('0') && national.StartsWith('0'))
        {
            national = national[1..];
        }

        if (national.Length is < CandidateLimits.PhoneNationalDigitsMin or > CandidateLimits.PhoneNationalDigitsMax
            || national[0] == '0'
            || !national.All(char.IsAsciiDigit))
        {
            return null;
        }

        return "0" + national;
    }

    private void Apply(CandidateDetails d, DateTimeOffset now)
    {
        NameKm = d.NameKm!;
        NameEn = d.NameEn!;
        Gender = d.Gender!.Value;
        DateOfBirth = d.DateOfBirth!.Value;
        Phone = d.Phone!;
        ProvinceCode = d.Address!.Province!.Code;
        ProvinceName = d.Address.Province.Name!;
        DistrictCode = d.Address.District!.Code;
        DistrictName = d.Address.District.Name!;
        CommuneCode = d.Address.Commune!.Code;
        CommuneName = d.Address.Commune.Name!;
        VillageCode = d.Address.Village?.Code;
        VillageName = d.Address.Village?.Name;
        SchoolHostId = d.SchoolHostId;
        SchoolName = d.SchoolName!;
        SessionId = d.SessionId;
        HasNgoSupport = d.HasNgoSupport;
        NgoName = d.NgoName;
        UpdatedAt = now;
    }

    /// <summary>Tidies the text and returns the details to store, or every problem found.</summary>
    private static Result<CandidateDetails> Check(CandidateDetails d, DateTimeOffset now)
    {
        var errors = new Dictionary<string, string[]>();

        var nameKm = CandidateLimits.Clean(d.NameKm);
        if (nameKm is null)
        {
            errors["nameKm"] = ["Enter the name in Khmer."];
        }
        else if (nameKm.Length > CandidateLimits.NameMax)
        {
            errors["nameKm"] = [$"Use at most {CandidateLimits.NameMax} characters."];
        }
        else if (!IsKhmerName(nameKm))
        {
            errors["nameKm"] = ["Write this name in Khmer letters only."];
        }

        var nameEn = CandidateLimits.Clean(d.NameEn);
        if (nameEn is null)
        {
            errors["nameEn"] = ["Enter the name in English."];
        }
        else if (nameEn.Length > CandidateLimits.NameMax)
        {
            errors["nameEn"] = [$"Use at most {CandidateLimits.NameMax} characters."];
        }
        else if (!EnglishName.IsMatch(nameEn))
        {
            errors["nameEn"] = ["Use English letters, spaces, hyphens, apostrophes and full stops only."];
        }

        if (d.Gender is null || !Enum.IsDefined(d.Gender.Value))
        {
            errors["gender"] = ["Choose female or male."];
        }

        if (d.DateOfBirth is not { } birth)
        {
            errors["dateOfBirth"] = ["Enter the date of birth."];
        }
        else
        {
            var today = CandidateLimits.LocalToday(now);
            var age = AgeOn(birth, today);
            if (birth > today)
            {
                errors["dateOfBirth"] = ["The date of birth cannot be in the future."];
            }
            else if (age < CandidateLimits.AgeMin || age > CandidateLimits.AgeMax)
            {
                errors["dateOfBirth"] = [$"The age must be between {CandidateLimits.AgeMin} and {CandidateLimits.AgeMax}. Check the date."];
            }
        }

        var phone = NormalizePhone(d.Phone);
        if (phone is null)
        {
            errors["phone"] = ["Enter a Cambodian phone number such as 012 345 678 or +855 12 345 678."];
        }

        var address = CheckAddress(d.Address, errors);

        var schoolName = CandidateLimits.Clean(d.SchoolName);
        if (schoolName is null)
        {
            errors["schoolName"] = ["Choose the high school, or enter its name."];
        }
        else if (schoolName.Length > CandidateLimits.SchoolNameMax)
        {
            errors["schoolName"] = [$"Use at most {CandidateLimits.SchoolNameMax} characters."];
        }

        string? ngoName = null;
        if (d.HasNgoSupport)
        {
            ngoName = CandidateLimits.Clean(d.NgoName);
            if (ngoName is null)
            {
                errors["ngoName"] = ["Enter the name of the NGO that supports this candidate."];
            }
            else if (ngoName.Length > CandidateLimits.NgoNameMax)
            {
                errors["ngoName"] = [$"Use at most {CandidateLimits.NgoNameMax} characters."];
            }
        }
        else if (CandidateLimits.Clean(d.NgoName) is not null)
        {
            errors["ngoName"] = ["Leave the NGO name empty when there is no NGO support."];
        }

        return errors.Count > 0
            ? Result.Failure<CandidateDetails>(CandidateErrors.Invalid(errors))
            : Result.Success(new CandidateDetails(
                nameKm, nameEn, d.Gender, d.DateOfBirth, phone, address, d.SchoolHostId, schoolName, d.SessionId, d.HasNgoSupport, ngoName));
    }

    /// <summary>
    /// Province, district and commune are needed; the village is optional. Either all the codes are given (picked from
    /// the address service) or none are (typed by hand because the service could not be reached).
    /// </summary>
    private static CandidateAddress? CheckAddress(CandidateAddress? address, Dictionary<string, string[]> errors)
    {
        var province = CleanPlace(address?.Province);
        var district = CleanPlace(address?.District);
        var commune = CleanPlace(address?.Commune);
        var village = CleanPlace(address?.Village);
        var before = errors.Count;

        RequirePlace("province", province, "Choose the province.", errors);
        RequirePlace("district", district, "Choose the district.", errors);
        RequirePlace("commune", commune, "Choose the commune.", errors);

        if (errors.Count == before)
        {
            var codes = new[] { province!.Code, district!.Code, commune!.Code };
            var picked = codes.Count(c => c is not null);
            if (picked is > 0 and < 3)
            {
                errors["province"] = ["Pick the province, district and commune from the lists, or type all three."];
            }
            else if (village is not null)
            {
                // Picked from the lists: the village needs its code. Typed by hand: it has none.
                if (village.Name is null || (picked == 3) != (village.Code is not null))
                {
                    errors["village"] = picked == 3
                        ? ["Pick the village from the list, or leave it empty."]
                        : ["Type the village name, or leave it empty."];
                }
            }
        }

        return errors.Count == before ? new CandidateAddress(province, district, commune, village) : null;
    }

    private static Place? CleanPlace(Place? place)
    {
        var code = CandidateLimits.Clean(place?.Code);
        var name = CandidateLimits.Clean(place?.Name);
        return code is null && name is null ? null : new Place(code, name);
    }

    private static void RequirePlace(string field, Place? place, string missing, Dictionary<string, string[]> errors)
    {
        if (place?.Name is null)
        {
            errors[field] = [missing];
        }
        else if (place.Name.Length > CandidateLimits.PlaceNameMax || place.Code?.Length > CandidateLimits.PlaceCodeMax)
        {
            errors[field] = ["This place is not valid. Choose it again."];
        }
    }

    /// <summary>Khmer letters and spaces only (the zero-width marks that Khmer text uses are allowed), at least one letter, no digits.</summary>
    private static bool IsKhmerName(string name)
    {
        var anyLetter = false;
        foreach (var c in name)
        {
            if (c is >= '០' and <= '៩')
            {
                return false;
            }

            if (c is >= 'ក' and <= '៿')
            {
                anyLetter = true;
            }
            else if (c is not (' ' or '​' or '‌' or '‍'))
            {
                return false;
            }
        }

        return anyLetter;
    }

    private static int AgeOn(DateOnly birth, DateOnly today)
    {
        var age = today.Year - birth.Year;
        return birth > today.AddYears(-age) ? age - 1 : age;
    }
}
