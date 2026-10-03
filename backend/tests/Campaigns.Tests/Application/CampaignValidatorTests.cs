using Campaigns.Application;
using Campaigns.Tests.Infrastructure;

namespace Campaigns.Tests.Application;

public sealed class CampaignValidatorTests
{
    private static string[] Messages(Dictionary<string, string[]> errors, string field) =>
        errors.TryGetValue(field, out var messages) ? messages : [];

    // ---------- Create ----------

    [Fact]
    public void Create_ValidRequest_HasNoErrors()
    {
        Assert.Empty(CampaignValidator.ValidateCreate(TestData.ValidCreate()));
    }

    [Fact]
    public void Create_DescriptionIsOptional()
    {
        var request = TestData.ValidCreate() with { Description = null };

        Assert.Empty(CampaignValidator.ValidateCreate(request));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_RequiresName(string? name)
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate() with { Name = name });

        Assert.Equal(["Enter a campaign name."], Messages(errors, "name"));
    }

    [Fact]
    public void Create_RejectsNameLongerThan100Characters()
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate(new string('a', 101)));

        Assert.Equal(["Campaign name must be 100 characters or fewer."], Messages(errors, "name"));
    }

    [Fact]
    public void Create_AcceptsNameOfExactly100Characters()
    {
        Assert.Empty(CampaignValidator.ValidateCreate(TestData.ValidCreate(new string('a', 100))));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public void Create_RequiresAcademicYear(string? year)
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate() with { AcademicYear = year });

        Assert.Equal(["Choose an academic year."], Messages(errors, "academicYear"));
    }

    [Fact]
    public void Create_RejectsDescriptionLongerThan500Characters()
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate() with { Description = new string('a', 501) });

        Assert.Equal(["Description must be 500 characters or fewer."], Messages(errors, "description"));
    }

    private static CreateCampaignRequest CopyRequest(Guid? source, params string[] parts) =>
        TestData.ValidCreate() with { StartMode = StartModes.Copy, CopyFrom = new CopyFromRequest(source, parts) };

    [Fact]
    public void Create_AcceptsCopyModeWithASourceAndKnownParts()
    {
        var errors = CampaignValidator.ValidateCreate(CopyRequest(Guid.NewGuid(), CopyParts.All.ToArray()));

        Assert.Empty(errors);
    }

    [Fact]
    public void Create_CopyModeNeedsASourceAndAtLeastOnePart()
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate() with { StartMode = StartModes.Copy });

        Assert.Equal(["Choose the campaign to copy from."], Messages(errors, "copyFrom.sourceCampaignId"));
        Assert.Equal(["Choose at least one thing to copy."], Messages(errors, "copyFrom.parts"));
    }

    [Fact]
    public void Create_CopyModeRejectsAnEmptySourceId()
    {
        var errors = CampaignValidator.ValidateCreate(CopyRequest(Guid.Empty, CopyParts.Provinces));

        Assert.Single(Messages(errors, "copyFrom.sourceCampaignId"));
    }

    [Fact]
    public void Create_CopyModeRejectsAPartThatIsNotOnTheList()
    {
        var errors = CampaignValidator.ValidateCreate(CopyRequest(Guid.NewGuid(), CopyParts.Provinces, "Candidates"));

        Assert.Single(Messages(errors, "copyFrom.parts"));
    }

    [Fact]
    public void Create_CopyModeRejectsAPartChosenTwice()
    {
        var errors = CampaignValidator.ValidateCreate(CopyRequest(Guid.NewGuid(), CopyParts.Provinces, CopyParts.Provinces));

        Assert.Single(Messages(errors, "copyFrom.parts"));
    }

    [Fact]
    public void Create_FromScratchIgnoresAnyCopyFromThatCameAlong()
    {
        var request = TestData.ValidCreate() with { CopyFrom = new CopyFromRequest(null, ["Nonsense"]) };

        Assert.Empty(CampaignValidator.ValidateCreate(request));
    }

    [Fact]
    public void Create_RejectsUnknownStartMode()
    {
        var errors = CampaignValidator.ValidateCreate(TestData.ValidCreate() with { StartMode = "magic" });

        Assert.Single(Messages(errors, "startMode"));
    }

    [Fact]
    public void Create_TreatsMissingStartModeAsStartFromScratch()
    {
        Assert.Empty(CampaignValidator.ValidateCreate(TestData.ValidCreate() with { StartMode = null }));
    }

    // ---------- Save draft ----------

    [Fact]
    public void Draft_OnlyNameAndAcademicYearAreRequired()
    {
        Assert.Empty(CampaignValidator.ValidateInfo(TestData.MinimalInfo("Selection 2027"), complete: false));
    }

    [Fact]
    public void Draft_StillRequiresNameAndAcademicYear()
    {
        var errors = CampaignValidator.ValidateInfo(TestData.MinimalInfo("x") with { Name = "", AcademicYear = null }, complete: false);

        Assert.Single(Messages(errors, "name"));
        Assert.Single(Messages(errors, "academicYear"));
    }

    [Fact]
    public void Draft_RejectsEndDateBeforeStartDate_AndNamesTheStartDate()
    {
        var request = TestData.MinimalInfo("x") with
        {
            StartDate = new DateOnly(2026, 11, 2),
            EndDate = new DateOnly(2026, 10, 30),
        };

        var errors = CampaignValidator.ValidateInfo(request, complete: false);

        Assert.Equal(["End date must be after the start date (2 Nov 2026)."], Messages(errors, "endDate"));
    }

    [Fact]
    public void Draft_RejectsEndDateEqualToStartDate()
    {
        var day = new DateOnly(2026, 11, 2);
        var errors = CampaignValidator.ValidateInfo(TestData.MinimalInfo("x") with { StartDate = day, EndDate = day }, complete: false);

        Assert.Single(Messages(errors, "endDate"));
    }

    [Fact]
    public void Draft_AllowsEndDateAloneOrStartDateAlone()
    {
        Assert.Empty(CampaignValidator.ValidateInfo(
            TestData.MinimalInfo("x") with { EndDate = new DateOnly(2026, 10, 30) }, complete: false));
        Assert.Empty(CampaignValidator.ValidateInfo(
            TestData.MinimalInfo("x") with { StartDate = new DateOnly(2026, 10, 30) }, complete: false));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Draft_RejectsExpectedCandidatesThatAreNotPositive(int value)
    {
        var errors = CampaignValidator.ValidateInfo(TestData.MinimalInfo("x") with { ExpectedCandidates = value }, complete: false);

        Assert.Equal(["Expected candidates must be a whole number greater than 0."], Messages(errors, "expectedCandidates"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Draft_RejectsSeatsThatAreNotPositive(int value)
    {
        var errors = CampaignValidator.ValidateInfo(TestData.MinimalInfo("x") with { SeatsAvailable = value }, complete: false);

        Assert.Equal(["Seats available must be a whole number greater than 0."], Messages(errors, "seatsAvailable"));
    }

    [Fact]
    public void Draft_RejectsSeatsAboveExpectedCandidates()
    {
        var errors = CampaignValidator.ValidateInfo(
            TestData.MinimalInfo("x") with { ExpectedCandidates = 1500, SeatsAvailable = 1501 }, complete: false);

        Assert.Equal(["Seats available cannot be more than expected candidates (1,500)."], Messages(errors, "seatsAvailable"));
    }

    [Fact]
    public void Draft_AllowsSeatsEqualToExpectedCandidates()
    {
        Assert.Empty(CampaignValidator.ValidateInfo(
            TestData.MinimalInfo("x") with { ExpectedCandidates = 150, SeatsAvailable = 150 }, complete: false));
    }

    [Fact]
    public void Draft_DoesNotRequireProvinces()
    {
        Assert.Empty(CampaignValidator.ValidateInfo(TestData.MinimalInfo("x") with { ProvinceIds = [] }, complete: false));
    }

    // ---------- Save and continue ----------

    [Fact]
    public void Complete_ValidRequest_HasNoErrors()
    {
        Assert.Empty(CampaignValidator.ValidateInfo(TestData.ValidInfo("Selection 2027"), complete: true));
    }

    [Fact]
    public void Complete_RequiresEveryField()
    {
        var errors = CampaignValidator.ValidateInfo(TestData.MinimalInfo("Selection 2027"), complete: true);

        Assert.Equal(["Enter a start date."], Messages(errors, "startDate"));
        Assert.Equal(["Enter an end date."], Messages(errors, "endDate"));
        Assert.Equal(["Enter the expected number of candidates."], Messages(errors, "expectedCandidates"));
        Assert.Equal(["Enter the number of seats available."], Messages(errors, "seatsAvailable"));
        Assert.Equal(["Choose at least one target province."], Messages(errors, "provinceIds"));
        Assert.Equal(5, errors.Count);
    }

    [Fact]
    public void Complete_RequiresAtLeastOneProvince()
    {
        var errors = CampaignValidator.ValidateInfo(TestData.ValidInfo("x") with { ProvinceIds = [] }, complete: true);

        Assert.Equal(["Choose at least one target province."], Messages(errors, "provinceIds"));
    }

    [Fact]
    public void Complete_StillAppliesTheDateAndNumberRules()
    {
        var errors = CampaignValidator.ValidateInfo(
            TestData.ValidInfo("x") with
            {
                EndDate = new DateOnly(2026, 10, 30),
                SeatsAvailable = 2000,
            },
            complete: true);

        Assert.Single(Messages(errors, "endDate"));
        Assert.Single(Messages(errors, "seatsAvailable"));
    }

    [Fact]
    public void FormatDate_UsesDayShortMonthYear()
    {
        Assert.Equal("2 Nov 2026", CampaignValidator.FormatDate(new DateOnly(2026, 11, 2)));
    }
}
