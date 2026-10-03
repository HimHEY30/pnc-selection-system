using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;

namespace Eligibility.Tests.Rules;

public sealed class RuleValueParserTests
{
    private static readonly FieldCatalogue Catalogue = LaunchCatalogue.Create();

    private static ParseOutcome Parse(string field, string op, params string[] values) =>
        RuleValueParser.Parse(Catalogue.FindField(field)!, Catalogue.FindOperator(op)!, values);

    // ---------- Count per operator ----------

    [Theory]
    [InlineData("age", "equals")]
    [InlineData("age", "at_least")]
    [InlineData("gender", "is")]
    public void OneValueOperators_NeedExactlyOneValue(string field, string op)
    {
        Assert.Equal(ValueProblem.WrongCount, Parse(field, op).Problem);
        Assert.Equal(ValueProblem.WrongCount, Parse(field, op, "1", "2").Problem);
    }

    [Fact]
    public void Between_NeedsExactlyTwoValues()
    {
        Assert.Equal(ValueProblem.WrongCount, Parse("age", "between", "17").Problem);
        Assert.Equal(ValueProblem.WrongCount, Parse("age", "between", "17", "20", "23").Problem);
    }

    [Fact]
    public void ListOperators_NeedAtLeastOneValue()
    {
        Assert.Equal(ValueProblem.WrongCount, Parse("gender", "is_one_of").Problem);
        Assert.True(Parse("gender", "is_one_of", "female").IsValid);
        Assert.True(Parse("gender", "is_one_of", "female", "male").IsValid);
    }

    [Theory]
    [InlineData("is_yes")]
    [InlineData("is_no")]
    public void YesNoOperators_TakeNoValue(string op)
    {
        Assert.True(Parse("attended_info_session", op).IsValid);
        Assert.Equal(ValueProblem.WrongCount, Parse("attended_info_session", op, "true").Problem);
    }

    [Fact]
    public void BlankValues_AreRejected()
    {
        Assert.Equal(ValueProblem.Blank, Parse("age", "equals", " ").Problem);
        Assert.Equal(ValueProblem.Blank, Parse("gender", "is_one_of", "female", "").Problem);
    }

    // ---------- Numbers ----------

    [Fact]
    public void Numbers_AreParsedWithTheInvariantCulture()
    {
        var outcome = Parse("family_income", "between", "100.50", "400");

        Assert.True(outcome.IsValid);
        Assert.Equal([100.50m, 400m], outcome.Value!.Numbers);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("1e3")]
    [InlineData("1,5")]
    [InlineData("17 years")]
    public void Numbers_RejectAnythingThatIsNotANumber(string text)
    {
        Assert.Equal(ValueProblem.NotANumber, Parse("family_income", "equals", text).Problem);
    }

    [Fact]
    public void Age_MustBeAWholeNumber_ButIncomeMayHaveCents()
    {
        Assert.Equal(ValueProblem.TooManyDecimals, Parse("age", "equals", "17.5").Problem);
        Assert.True(Parse("age", "equals", "17.0").IsValid);
        Assert.True(Parse("family_income", "equals", "250.75").IsValid);
        Assert.Equal(ValueProblem.TooManyDecimals, Parse("family_income", "equals", "250.755").Problem);
    }

    [Fact]
    public void Numbers_RespectTheFieldLimits()
    {
        Assert.Equal(ValueProblem.BelowMinimum, Parse("age", "at_least", "-1").Problem);
        Assert.Equal(ValueProblem.AboveMaximum, Parse("age", "at_most", "121").Problem);
        Assert.True(Parse("age", "at_most", "120").IsValid);
        Assert.Equal(ValueProblem.BelowMinimum, Parse("family_income", "at_most", "-5").Problem);
    }

    [Fact]
    public void Between_NeedsTheFirstValueLowerThanTheSecond()
    {
        Assert.True(Parse("age", "between", "17", "23").IsValid);
        Assert.Equal(ValueProblem.FirstNotLower, Parse("age", "between", "23", "17").Problem);
        Assert.Equal(ValueProblem.FirstNotLower, Parse("age", "between", "20", "20").Problem);
    }

    // ---------- Dates ----------

    [Fact]
    public void Dates_MustBeYearMonthDay()
    {
        var outcome = Parse2("before", "2027-01-31");

        Assert.True(outcome.IsValid);
        Assert.Equal([new DateOnly(2027, 1, 31)], outcome.Value!.Dates);
        Assert.Equal(ValueProblem.NotADate, Parse2("before", "31/01/2027").Problem);
        Assert.Equal(ValueProblem.NotADate, Parse2("before", "2027-02-30").Problem);
    }

    [Fact]
    public void DateBetween_NeedsTheFirstDateBeforeTheSecond()
    {
        Assert.True(Parse2("date_between", "2026-01-01", "2026-12-31").IsValid);
        Assert.Equal(ValueProblem.FirstNotLower, Parse2("date_between", "2026-12-31", "2026-01-01").Problem);
    }

    private static ParseOutcome Parse2(string op, params string[] values)
    {
        var dateField = new FieldDefinition("graduation_date", "Graduation date", FieldValueType.Date, 9);
        return RuleValueParser.Parse(dateField, Catalogue.FindOperator(op)!, values);
    }

    // ---------- Choices ----------

    [Fact]
    public void Choices_AreCheckedAgainstTheAllowedList()
    {
        var field = Catalogue.FindField("highest_grade")!;
        var op = Catalogue.FindOperator("is_one_of")!;
        var allowed = field.Options.Select(o => o.Key).ToList();

        Assert.True(RuleValueParser.Parse(field, op, ["grade_12", "diploma_or_higher"], allowed).IsValid);
        Assert.Equal(ValueProblem.NotInList, RuleValueParser.Parse(field, op, ["grade_12", "grade_13"], allowed).Problem);
    }

    [Fact]
    public void Choices_AreNotCheckedWhenNoListIsGiven()
    {
        Assert.True(Parse("gender", "is", "anything").IsValid);
    }

    [Fact]
    public void ProvinceChoices_UseTheCampaignsTargetProvinces()
    {
        var field = Catalogue.FindField("province")!;
        var op = Catalogue.FindOperator("is_one_of")!;

        Assert.True(RuleValueParser.Parse(field, op, ["2", "17"], ["2", "17", "21"]).IsValid);
        Assert.Equal(ValueProblem.NotInList, RuleValueParser.Parse(field, op, ["2", "12"], ["2", "17", "21"]).Problem);
    }

    [Fact]
    public void ChoiceValues_AreTrimmed()
    {
        Assert.Equal(["female"], Parse("gender", "is", " female ").Value!.Texts);
    }
}
