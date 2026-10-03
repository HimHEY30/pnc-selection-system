using Eligibility.Domain.Catalogue;

namespace Eligibility.Tests.Catalogue;

public sealed class CatalogueTests
{
    private static readonly FieldCatalogue Catalogue = LaunchCatalogue.Create();

    [Fact]
    public void LaunchCatalogue_HasTheEightAgreedFields()
    {
        Assert.Equal(
            ["age", "gender", "province", "highest_grade", "grade12_result", "family_income", "marital_status", "attended_info_session"],
            LaunchCatalogue.Fields.OrderBy(f => f.Position).Select(f => f.Key));
    }

    [Fact]
    public void FieldKeys_AreUnique()
    {
        Assert.Equal(LaunchCatalogue.Fields.Count, LaunchCatalogue.Fields.Select(f => f.Key).Distinct().Count());
    }

    [Theory]
    [InlineData("age", FieldValueType.Number)]
    [InlineData("family_income", FieldValueType.Number)]
    [InlineData("gender", FieldValueType.Choice)]
    [InlineData("province", FieldValueType.Choice)]
    [InlineData("highest_grade", FieldValueType.Choice)]
    [InlineData("grade12_result", FieldValueType.Choice)]
    [InlineData("marital_status", FieldValueType.Choice)]
    [InlineData("attended_info_session", FieldValueType.YesNo)]
    public void EachFieldHasItsAgreedType(string key, FieldValueType expected)
    {
        Assert.Equal(expected, Catalogue.FindField(key)!.ValueType);
    }

    [Fact]
    public void Age_IsCalculatedFromTheDateOfBirth()
    {
        var age = Catalogue.FindField("age")!;

        Assert.Equal(FieldDerivation.AgeFromBirthDate, age.Derivation);
        Assert.Equal("date_of_birth", age.CandidateAttribute);
        Assert.Equal(0, age.Decimals);
    }

    [Fact]
    public void Province_TakesItsOptionsFromTheCampaign_NotFromTheCatalogue()
    {
        var province = Catalogue.FindField("province")!;

        Assert.Equal(OptionsSource.CampaignProvinces, province.OptionsSource);
        Assert.Empty(province.Options);
    }

    [Fact]
    public void FixedChoiceFields_ListTheirOptionsInOrder()
    {
        Assert.Equal(
            ["grade_9", "grade_10", "grade_11", "grade_12", "diploma_or_higher"],
            Catalogue.FindField("highest_grade")!.Options.OrderBy(o => o.Position).Select(o => o.Key));
        Assert.Equal(["A", "B", "C", "D", "E", "F"], Catalogue.FindField("grade12_result")!.Options.Select(o => o.Key));
    }

    [Fact]
    public void Income_IsInUsdAndAllowsCents()
    {
        var income = Catalogue.FindField("family_income")!;

        Assert.Equal("USD", income.Unit);
        Assert.Equal(2, income.Decimals);
        Assert.Equal(0m, income.MinValue);
    }

    [Theory]
    [InlineData("age", new[] { "equals", "less_than", "at_most", "greater_than", "at_least", "between" })]
    [InlineData("gender", new[] { "is", "is_not", "is_one_of", "is_none_of" })]
    [InlineData("attended_info_session", new[] { "is_yes", "is_no" })]
    public void AFieldOffersExactlyTheOperatorsOfItsType(string key, string[] expected)
    {
        var offered = Catalogue.OperatorsFor(Catalogue.FindField(key)!).Select(o => o.Key);

        Assert.Equal(expected, offered);
    }

    [Fact]
    public void DateFields_OfferBeforeAfterAndBetween()
    {
        var birthday = new FieldDefinition("graduation_date", "Graduation date", FieldValueType.Date, position: 9);
        var catalogue = new FieldCatalogue([.. LaunchCatalogue.Fields, birthday], OperatorDefinition.Defaults);

        Assert.Equal(["before", "after", "date_between"], catalogue.OperatorsFor(birthday).Select(o => o.Key));
    }

    [Fact]
    public void ANewField_IsPickedUpWithoutAnyOtherChange()
    {
        // The point of a data-driven catalogue: add a row, and the field and its operators exist.
        var siblings = new FieldDefinition("siblings", "Number of siblings", FieldValueType.Number, position: 9);
        var catalogue = new FieldCatalogue([.. LaunchCatalogue.Fields, siblings], OperatorDefinition.Defaults);

        Assert.NotNull(catalogue.FindField("siblings"));
        Assert.Equal(6, catalogue.OperatorsFor(siblings).Count());
    }

    [Fact]
    public void IsAllowed_RejectsAnOperatorOfTheWrongType()
    {
        var age = Catalogue.FindField("age")!;

        Assert.True(Catalogue.IsAllowed(age, Catalogue.FindOperator("between")!));
        Assert.False(Catalogue.IsAllowed(age, Catalogue.FindOperator("is_one_of")!));
        Assert.False(Catalogue.IsAllowed(age, Catalogue.FindOperator("is_yes")!));
    }

    [Fact]
    public void Lookups_ReturnNullForUnknownKeys()
    {
        Assert.Null(Catalogue.FindField("shoe_size"));
        Assert.Null(Catalogue.FindField(null));
        Assert.Null(Catalogue.FindOperator("sounds_like"));
    }

    [Fact]
    public void OperatorKeys_AreUnique_AndEveryTypeHasOperators()
    {
        Assert.Equal(OperatorDefinition.Defaults.Count, OperatorDefinition.Defaults.Select(o => o.Key).Distinct().Count());
        foreach (var type in Enum.GetValues<FieldValueType>())
        {
            Assert.Contains(OperatorDefinition.Defaults, o => o.ValueType == type);
        }
    }
}
