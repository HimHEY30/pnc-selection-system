using Eligibility.Domain.Catalogue;

namespace Eligibility.Tests.Catalogue;

public sealed class ExamSubjectsTests
{
    private static readonly Guid Campaign = Guid.NewGuid();

    private static FieldDefinition Subject(string name, int position = ExamSubjects.FirstPosition) =>
        ExamSubjects.CreateField(Guid.NewGuid(), Campaign, name, position);

    [Fact]
    public void ASubject_IsANumberFieldOfPointsFromZeroToOneHundred()
    {
        var math = Subject("Math");

        Assert.Equal("Math score", math.Label);
        Assert.Equal("Math", math.SubjectName);
        Assert.Equal(Campaign, math.CampaignId);
        Assert.Equal(FieldValueType.Number, math.ValueType);
        Assert.Equal(FieldDerivation.ExamScore, math.Derivation);
        Assert.Equal("points", math.Unit);
        Assert.Equal(2, math.Decimals);
        Assert.Equal(0m, math.MinValue);
        Assert.Equal(100m, math.MaxValue);
    }

    [Fact]
    public void ASubjectIsReadFromTheCandidateUnderItsOwnKey()
    {
        var math = Subject("Math");

        Assert.Equal(math.Key, math.CandidateAttribute);
        Assert.True(math.Key.Length <= 50);
    }

    [Fact]
    public void TheKey_HoldsTheIdAndOnlyASubjectKeyGivesOneBack()
    {
        var id = Guid.NewGuid();

        Assert.True(ExamSubjects.TryGetId(ExamSubjects.KeyFor(id), out var found));
        Assert.Equal(id, found);
        Assert.False(ExamSubjects.TryGetId(ExamSubjects.TotalKey, out _));
        Assert.False(ExamSubjects.TryGetId("age", out _));
        Assert.False(ExamSubjects.TryGetId(null, out _));
    }

    [Fact]
    public void Renaming_ChangesTheLabelButNotTheKey()
    {
        var math = Subject("Math");
        var key = math.Key;

        math.RenameSubject("Mathematics");

        Assert.Equal("Mathematics", math.SubjectName);
        Assert.Equal("Mathematics score", math.Label);
        Assert.Equal(key, math.Key);
    }

    [Theory]
    [InlineData("  Math  ", "Math")]
    [InlineData("General   knowledge", "General knowledge")]
    [InlineData("\tLogic\n", "Logic")]
    [InlineData("   ", "")]
    [InlineData(null, "")]
    public void CleanName_TrimsAndCollapsesSpaces(string? raw, string expected)
    {
        Assert.Equal(expected, ExamSubjects.CleanName(raw));
    }

    [Fact]
    public void TheDefaultSubjects_AreMathLogicAndEnglish()
    {
        Assert.Equal(["Math", "Logic", "English"], ExamSubjects.DefaultNames);
    }

    [Fact]
    public void TheTotalsAreHidden_UntilThereAreTwoSubjects()
    {
        var one = LaunchCatalogue.Create(Subject("Math"));
        var two = LaunchCatalogue.Create(Subject("Math"), Subject("Logic", ExamSubjects.FirstPosition + 1));

        Assert.Null(one.FindField(ExamSubjects.TotalKey));
        Assert.Null(one.FindField(ExamSubjects.AverageKey));
        Assert.NotNull(two.FindField(ExamSubjects.TotalKey));
        Assert.NotNull(two.FindField(ExamSubjects.AverageKey));
    }

    [Fact]
    public void ACatalogue_ListsSubjectsInTheOrderTheyWereAdded_AndOffersNumberOperators()
    {
        var math = Subject("Math", ExamSubjects.FirstPosition);
        var logic = Subject("Logic", ExamSubjects.FirstPosition + 1);
        var catalogue = LaunchCatalogue.Create(logic, math);

        Assert.Equal([math.Key, logic.Key], catalogue.Subjects.Select(s => s.Key));
        Assert.Equal(
            ["equals", "less_than", "at_most", "greater_than", "at_least", "between"],
            catalogue.OperatorsFor(math).Select(o => o.Key));
    }

    [Fact]
    public void SubjectsSortBetweenTheSharedFieldsAndTheTotals()
    {
        var catalogue = LaunchCatalogue.Create(Subject("Math"), Subject("Logic", ExamSubjects.FirstPosition + 1));

        var order = catalogue.Fields.OrderBy(f => f.Position).Select(f => f.Derivation).ToList();

        Assert.Equal(FieldDerivation.ExamTotal, order[^2]);
        Assert.Equal(FieldDerivation.ExamAverage, order[^1]);
        Assert.Equal(2, order.Count(d => d == FieldDerivation.ExamScore));
    }
}
