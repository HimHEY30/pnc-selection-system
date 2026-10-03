using Eligibility.Domain.Catalogue;

namespace Eligibility.Domain.Rules;

/// <summary>
/// The starter set offered by "Use suggested rules". It is only a starting point: nothing
/// is saved until the user saves, and every rule can be edited or deleted. The province rule
/// uses the campaign's own target provinces, which is why this is built per campaign.
/// </summary>
public static class SuggestedRules
{
    public const string GroupName = "Basic requirements";

    public static RuleSetContent Create(
        IReadOnlyCollection<string> targetProvinceIds,
        DateOnly? campaignStartDate,
        Func<Guid>? newId = null)
    {
        var id = newId ?? Guid.NewGuid;

        var rules = new List<RuleContent>
        {
            new(id(), LaunchCatalogue.Age, OperatorKeys.Between, ["17", "23"], RuleType.Mandatory,
                "Applicants must be between 17 and 23 years old.", true),

            new(id(), LaunchCatalogue.HighestGrade, OperatorKeys.IsOneOf, ["diploma_or_higher", "grade_12"], RuleType.Mandatory,
                "Applicants must have completed Grade 12 or higher.", true),
        };

        if (targetProvinceIds.Count > 0)
        {
            rules.Add(new RuleContent(
                id(), LaunchCatalogue.Province, OperatorKeys.IsOneOf,
                [.. targetProvinceIds.Distinct().Order(StringComparer.Ordinal)], RuleType.Mandatory,
                "Applicants must come from one of the campaign's target provinces.", true));
        }

        rules.Add(new RuleContent(
            id(), LaunchCatalogue.AttendedInfoSession, OperatorKeys.IsYes, [], RuleType.Optional,
            "Applicants should have attended an information session.", true));

        return new RuleSetContent(campaignStartDate, [new GroupContent(id(), GroupName, GroupLogic.All, rules)]);
    }
}
