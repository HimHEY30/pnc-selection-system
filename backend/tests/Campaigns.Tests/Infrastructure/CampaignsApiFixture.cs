namespace Campaigns.Tests.Infrastructure;

/// <summary>The shared database and running API for this project's integration tests.</summary>
public sealed class CampaignsApiFixture : ApiFixture
{
}

[CollectionDefinition(Name)]
public sealed class CampaignsApiCollection : ICollectionFixture<CampaignsApiFixture>
{
    public const string Name = "Campaigns API";
}
