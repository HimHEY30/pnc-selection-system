using Candidates.Domain;
using SharedKernel;

namespace Candidates.Tests.Domain;

public sealed class CandidateTests
{
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
    private static readonly Guid Campaign = Guid.NewGuid();
    private const string Khmer = "សុខ ចិន្តា";

    private static CandidateAddress PickedAddress(Place? village = null) => new(
        new Place("12", "Phnom Penh"), new Place("1201", "Chamkar Mon"), new Place("120101", "Tonle Bassac"), village);

    private static CandidateAddress TypedAddress(Place? village = null) => new(
        new Place(null, "Kampong Cham"), new Place(null, "Cheung Prey"), new Place(null, "Prey Chhor"), village);

    private static CandidateDetails Valid(
        string? nameKm = Khmer,
        string? nameEn = "Sok Chenda",
        Gender? gender = Gender.Female,
        DateOnly? birth = null,
        string? phone = "012 345 678",
        CandidateAddress? address = null,
        Guid? schoolHostId = null,
        string? schoolName = "Hun Sen Prey Chhor High School",
        Guid? sessionId = null,
        bool ngo = false,
        string? ngoName = null) =>
        new(nameKm, nameEn, gender, birth ?? new DateOnly(2009, 5, 20), phone, address ?? PickedAddress(),
            schoolHostId, schoolName, sessionId, ngo, ngoName);

    private static Candidate Created(CandidateDetails? details = null) =>
        Candidate.Create(Campaign, details ?? Valid(), "u1", "Dara", Now).Value;

    private static string[] Errors(Result result, string field)
    {
        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.Validation, result.Error.Type);
        return result.Error.FieldErrors![field];
    }

    private static Result<Candidate> Try(CandidateDetails details) => Candidate.Create(Campaign, details, "u1", "Dara", Now);

    // ---------- creating ----------

    [Fact]
    public void A_candidate_is_created_with_tidied_text_and_who_made_it()
    {
        var c = Created(Valid(nameEn: "  Sok   Chenda ", nameKm: "  សុខ   ចិន្តា "));

        Assert.Equal("Sok Chenda", c.NameEn);
        Assert.Equal("សុខ ចិន្តា", c.NameKm);
        Assert.Equal(Campaign, c.CampaignId);
        Assert.Equal(Gender.Female, c.Gender);
        Assert.Equal("012345678", c.Phone);
        Assert.Equal("u1", c.CreatedById);
        Assert.Equal("Dara", c.CreatedByName);
        Assert.Equal(Now, c.CreatedAt);
        Assert.NotEqual(Guid.Empty, c.Id);
    }

    [Fact]
    public void Every_problem_is_reported_at_once()
    {
        var result = Try(new CandidateDetails(null, null, null, null, null, null, null, null, null, false, null));

        foreach (var field in new[] { "nameKm", "nameEn", "gender", "dateOfBirth", "phone", "province", "district", "commune", "schoolName" })
        {
            Assert.Contains(field, result.Error.FieldErrors!.Keys);
        }
    }

    // ---------- names ----------

    [Theory]
    [InlineData("Sok Chenda")]
    [InlineData("សុខ123")]
    [InlineData("សុខ ១២")]
    [InlineData("សុខ-ចិន្តា")]
    [InlineData("   ")]
    public void The_khmer_name_must_be_khmer_letters_only(string name) =>
        Assert.Single(Errors(Try(Valid(nameKm: name)), "nameKm"));

    [Fact]
    public void A_khmer_name_may_hold_the_zero_width_marks_khmer_text_uses() =>
        Assert.True(Try(Valid(nameKm: "សុខ​ចិន្តា")).IsSuccess);

    [Theory]
    [InlineData("សុខ ចិន្តា")]
    [InlineData("Sok123")]
    [InlineData("Sok_Chenda")]
    [InlineData("-Sok")]
    public void The_english_name_must_use_english_letters(string name) =>
        Assert.Single(Errors(Try(Valid(nameEn: name)), "nameEn"));

    [Theory]
    [InlineData("O'Brien-Smith Jr.")]
    [InlineData("Chenda")]
    public void The_english_name_may_hold_hyphens_apostrophes_and_full_stops(string name) =>
        Assert.True(Try(Valid(nameEn: name)).IsSuccess);

    [Fact]
    public void Names_have_a_length_limit()
    {
        Assert.Single(Errors(Try(Valid(nameEn: new string('a', CandidateLimits.NameMax + 1))), "nameEn"));
        Assert.Single(Errors(Try(Valid(nameKm: new string('ក', CandidateLimits.NameMax + 1))), "nameKm"));
        Assert.True(Try(Valid(nameEn: new string('a', CandidateLimits.NameMax))).IsSuccess);
    }

    // ---------- gender ----------

    [Fact]
    public void Gender_is_required_and_must_be_one_of_the_two()
    {
        Assert.Single(Errors(Try(Valid(gender: null)), "gender"));
        Assert.Single(Errors(Try(Valid(gender: (Gender)9)), "gender"));
    }

    // ---------- date of birth ----------

    [Fact]
    public void The_birth_date_is_required() =>
        Assert.Single(Errors(Candidate.Create(Campaign, Valid() with { DateOfBirth = null }, "u1", "Dara", Now), "dateOfBirth"));

    [Fact]
    public void The_birth_date_cannot_be_in_the_future() =>
        Assert.Contains("future", Errors(Try(Valid(birth: new DateOnly(2027, 3, 11))), "dateOfBirth")[0]);

    [Fact]
    public void Today_in_cambodia_is_what_counts_not_today_in_utc()
    {
        // 20:00 UTC on 9 March is already 10 March in Cambodia (UTC+7), so a baby-faced 10 March birth date is "today", not the future.
        var lateUtc = new DateTimeOffset(2027, 3, 9, 20, 0, 0, TimeSpan.Zero);
        var result = Candidate.Create(Campaign, Valid(birth: new DateOnly(2027, 3, 10)), "u1", "Dara", lateUtc);

        // Today it is the age rule that fails, not the future rule.
        Assert.DoesNotContain("future", Errors(result, "dateOfBirth")[0]);
    }

    [Theory]
    [InlineData(2017, 3, 10, true)]   // turns 10 today
    [InlineData(2017, 3, 11, false)]  // turns 10 tomorrow
    [InlineData(1947, 3, 10, true)]   // turns 80 today
    [InlineData(1946, 3, 10, false)]  // is 81
    public void The_age_must_be_between_10_and_80_counted_to_the_day(int y, int m, int d, bool ok) =>
        Assert.Equal(ok, Try(Valid(birth: new DateOnly(y, m, d))).IsSuccess);

    // ---------- phone ----------

    [Theory]
    [InlineData("012 345 678", "012345678")]
    [InlineData("012-345-678", "012345678")]
    [InlineData("(012) 345.678", "012345678")]
    [InlineData("+855 12 345 678", "012345678")]
    [InlineData("+855 012 345 678", "012345678")]
    [InlineData("00855 12 345 678", "012345678")]
    [InlineData("097 123 4567", "0971234567")]
    [InlineData("+855971234567", "0971234567")]
    public void A_phone_is_stored_in_one_form_however_it_was_typed(string typed, string stored)
    {
        Assert.Equal(stored, Candidate.NormalizePhone(typed));
        Assert.Equal(stored, Created(Valid(phone: typed)).Phone);
    }

    [Theory]
    [InlineData("")]
    [InlineData("12345678")]            // no 0 or +855 in front
    [InlineData("012 345 67")]          // too short
    [InlineData("012 345 678 901")]     // too long
    [InlineData("+66 12 345 678")]      // another country
    [InlineData("012 345 67a")]
    [InlineData("00 12 345 678")]       // national part starts with 0
    public void A_phone_that_is_not_cambodian_is_refused(string typed)
    {
        Assert.Null(Candidate.NormalizePhone(typed));
        Assert.Single(Errors(Try(Valid(phone: typed)), "phone"));
    }

    // ---------- address ----------

    [Fact]
    public void An_address_picked_from_the_lists_keeps_codes_and_names()
    {
        var c = Created(Valid(address: PickedAddress(new Place("12010101", "Phum Muoy"))));

        Assert.Equal(("12", "Phnom Penh"), (c.ProvinceCode, c.ProvinceName));
        Assert.Equal(("1201", "Chamkar Mon"), (c.DistrictCode, c.DistrictName));
        Assert.Equal(("120101", "Tonle Bassac"), (c.CommuneCode, c.CommuneName));
        Assert.Equal(("12010101", "Phum Muoy"), (c.VillageCode, c.VillageName));
    }

    [Fact]
    public void The_village_is_optional()
    {
        var c = Created(Valid(address: PickedAddress()));

        Assert.Null(c.VillageCode);
        Assert.Null(c.VillageName);
    }

    [Fact]
    public void An_address_typed_by_hand_has_names_and_no_codes()
    {
        var c = Created(Valid(address: TypedAddress(new Place(null, "Prey Chhor Village"))));

        Assert.Null(c.ProvinceCode);
        Assert.Equal("Kampong Cham", c.ProvinceName);
        Assert.Null(c.VillageCode);
        Assert.Equal("Prey Chhor Village", c.VillageName);
    }

    [Theory]
    [InlineData("province")]
    [InlineData("district")]
    [InlineData("commune")]
    public void Province_district_and_commune_are_each_required(string level)
    {
        var a = PickedAddress();
        var address = level switch
        {
            "province" => a with { Province = null },
            "district" => a with { District = new Place(null, " ") },
            _ => a with { Commune = null },
        };

        Assert.Single(Errors(Try(Valid(address: address)), level));
    }

    [Fact]
    public void A_missing_address_is_refused() =>
        Assert.Contains("province", Candidate.Create(Campaign, Valid() with { Address = null }, "u1", "Dara", Now).Error.FieldErrors!.Keys);

    [Fact]
    public void Codes_are_given_for_all_three_levels_or_for_none()
    {
        var mixed = new CandidateAddress(new Place("12", "Phnom Penh"), new Place(null, "Chamkar Mon"), new Place("120101", "Tonle Bassac"), null);

        Assert.Single(Errors(Try(Valid(address: mixed)), "province"));
    }

    [Fact]
    public void A_village_picked_from_the_list_needs_its_code()
    {
        var address = PickedAddress(new Place(null, "Phum Muoy"));

        Assert.Single(Errors(Try(Valid(address: address)), "village"));
    }

    [Fact]
    public void A_typed_village_cannot_have_a_code()
    {
        var address = TypedAddress(new Place("12010101", "Phum Muoy"));

        Assert.Single(Errors(Try(Valid(address: address)), "village"));
    }

    [Fact]
    public void A_village_with_a_code_but_no_name_is_refused() =>
        Assert.Single(Errors(Try(Valid(address: PickedAddress(new Place("12010101", null)))), "village"));

    [Fact]
    public void A_blank_village_is_the_same_as_none() =>
        Assert.True(Try(Valid(address: PickedAddress(new Place(" ", " ")))).IsSuccess);

    // ---------- school and session ----------

    [Fact]
    public void A_school_from_the_directory_keeps_its_id_and_name()
    {
        var host = Guid.NewGuid();
        var c = Created(Valid(schoolHostId: host, schoolName: "Bak Touk High School"));

        Assert.Equal(host, c.SchoolHostId);
        Assert.Equal("Bak Touk High School", c.SchoolName);
    }

    [Fact]
    public void A_typed_school_has_no_host_id() =>
        Assert.Null(Created(Valid(schoolHostId: null)).SchoolHostId);

    [Fact]
    public void The_school_name_is_required_and_limited()
    {
        Assert.Single(Errors(Try(Valid(schoolName: " ")), "schoolName"));
        Assert.Single(Errors(Try(Valid(schoolName: new string('a', CandidateLimits.SchoolNameMax + 1))), "schoolName"));
    }

    [Fact]
    public void The_session_is_optional_and_kept_when_given()
    {
        var session = Guid.NewGuid();

        Assert.Null(Created().SessionId);
        Assert.Equal(session, Created(Valid(sessionId: session)).SessionId);
    }

    // ---------- NGO support ----------

    [Fact]
    public void With_ngo_support_the_name_is_required_and_kept()
    {
        Assert.Single(Errors(Try(Valid(ngo: true, ngoName: " ")), "ngoName"));

        var c = Created(Valid(ngo: true, ngoName: "  Hope   NGO "));

        Assert.True(c.HasNgoSupport);
        Assert.Equal("Hope NGO", c.NgoName);
    }

    [Fact]
    public void Without_ngo_support_the_name_must_be_empty()
    {
        Assert.Single(Errors(Try(Valid(ngo: false, ngoName: "Hope NGO")), "ngoName"));

        var c = Created(Valid(ngo: false, ngoName: null));

        Assert.False(c.HasNgoSupport);
        Assert.Null(c.NgoName);
    }

    [Fact]
    public void The_ngo_name_is_limited() =>
        Assert.Single(Errors(Try(Valid(ngo: true, ngoName: new string('a', CandidateLimits.NgoNameMax + 1))), "ngoName"));

    // ---------- validating without applying ----------

    [Fact]
    public void Validate_returns_the_tidied_details_and_changes_nothing()
    {
        var c = Created();

        var result = Candidate.Validate(Valid(nameEn: "  Sok   Dara ", phone: "097 123 4567"), Now);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sok Dara", result.Value.NameEn);
        Assert.Equal("0971234567", result.Value.Phone);
        Assert.Equal("Sok Chenda", c.NameEn);
    }

    [Fact]
    public void Validate_reports_the_same_problems_as_create() =>
        Assert.Single(Errors(Candidate.Validate(Valid(phone: "bad"), Now), "phone"));

    // ---------- changing ----------

    [Fact]
    public void Changing_replaces_the_details_and_moves_the_updated_time_but_not_who_made_it()
    {
        var c = Created();
        var later = Now.AddDays(2);

        var result = c.Change(Valid(nameEn: "Sok Dara", phone: "097 123 4567", ngo: true, ngoName: "Hope NGO"), later);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sok Dara", c.NameEn);
        Assert.Equal("0971234567", c.Phone);
        Assert.True(c.HasNgoSupport);
        Assert.Equal(later, c.UpdatedAt);
        Assert.Equal(Now, c.CreatedAt);
        Assert.Equal("u1", c.CreatedById);
    }

    [Fact]
    public void A_change_that_is_refused_leaves_the_candidate_as_it_was()
    {
        var c = Created();

        var result = c.Change(Valid(nameEn: "Sok 123", phone: "bad"), Now.AddDays(1));

        Assert.Contains("nameEn", result.Error.FieldErrors!.Keys);
        Assert.Equal("Sok Chenda", c.NameEn);
        Assert.Equal("012345678", c.Phone);
        Assert.Equal(Now, c.UpdatedAt);
    }

    [Fact]
    public void A_change_can_clear_the_village_session_and_ngo()
    {
        var c = Created(Valid(address: PickedAddress(new Place("12010101", "Phum Muoy")), sessionId: Guid.NewGuid(), ngo: true, ngoName: "Hope NGO"));

        c.Change(Valid(address: PickedAddress(), sessionId: null, ngo: false), Now.AddDays(1));

        Assert.Null(c.VillageCode);
        Assert.Null(c.VillageName);
        Assert.Null(c.SessionId);
        Assert.False(c.HasNgoSupport);
        Assert.Null(c.NgoName);
    }
}
