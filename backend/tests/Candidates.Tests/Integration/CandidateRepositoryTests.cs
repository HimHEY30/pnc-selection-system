using Candidates.Application;
using Candidates.Domain;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel;

namespace Candidates.Tests.Integration;

/// <summary>The repository against the real database: what is stored comes back, and filters, search and paging work.</summary>
[Collection(CandidatesApiCollection.Name)]
public sealed class CandidateRepositoryTests
{
    private static readonly DateTimeOffset Now = new(2027, 3, 10, 5, 0, 0, TimeSpan.Zero);
    private static int _phone = 20_000_000;

    private readonly CandidatesApiFixture _fixture;

    public CandidateRepositoryTests(CandidatesApiFixture fixture)
    {
        _fixture = fixture;
    }

    private static string NextPhone() => "0" + Interlocked.Increment(ref _phone);

    private static CandidateDetails Details(
        string nameEn = "Sok Chenda",
        string nameKm = "សុខ ចិន្តា",
        string? phone = null,
        string province = "Phnom Penh",
        Guid? sessionId = null,
        bool ngo = false) => new(
        nameKm, nameEn, Gender.Female, new DateOnly(2009, 5, 20), phone ?? NextPhone(),
        new CandidateAddress(new Place("12", province), new Place("1201", "Chamkar Mon"), new Place("120101", "Tonle Bassac"), null),
        null, "Bak Touk High School", sessionId, ngo, ngo ? "Hope NGO" : null);

    /// <summary>Runs work in its own scope, like one web request.</summary>
    private async Task<T> InScopeAsync<T>(Func<ICandidateRepository, Task<T>> work)
    {
        await using var scope = _fixture.Services.CreateAsyncScope();
        return await work(scope.ServiceProvider.GetRequiredService<ICandidateRepository>());
    }

    private async Task<Candidate> AddAsync(Guid campaign, CandidateDetails? details = null, DateTimeOffset? at = null)
    {
        var candidate = Candidate.Create(campaign, details ?? Details(), "u1", "Dara", at ?? Now).Value;
        var result = await InScopeAsync(async repository =>
        {
            repository.Add(candidate);
            return await repository.SaveChangesAsync(CancellationToken.None);
        });
        Assert.True(result.IsSuccess);
        return candidate;
    }

    private Task<PagedResult<Candidate>> ListAsync(Guid campaign, CandidateQuery? query = null) =>
        InScopeAsync(r => r.ListAsync(campaign, query ?? new CandidateQuery(null, null, null, null, 1, 50), CancellationToken.None));

    private static CandidateQuery Query(string? search = null, string? province = null, Guid? session = null, bool? ngo = null, int page = 1, int size = 50) =>
        new(search, province, session, ngo, page, size);

    // ---------- Store and read ----------

    [Fact]
    public async Task AStoredCandidate_ComesBackWithEveryField()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var details = Details(ngo: true) with
        {
            Address = new CandidateAddress(new Place("12", "Phnom Penh"), new Place("1201", "Chamkar Mon"), new Place("120101", "Tonle Bassac"), new Place("12010101", "Phum Muoy")),
        };
        var stored = await AddAsync(campaign, details);

        var read = await InScopeAsync(r => r.GetAsync(campaign, stored.Id, CancellationToken.None));

        Assert.NotNull(read);
        Assert.Equal(("សុខ ចិន្តា", "Sok Chenda", Gender.Female), (read.NameKm, read.NameEn, read.Gender));
        Assert.Equal(new DateOnly(2009, 5, 20), read.DateOfBirth);
        Assert.Equal(stored.Phone, read.Phone);
        Assert.Equal(("12010101", "Phum Muoy"), (read.VillageCode, read.VillageName));
        Assert.Equal("Tonle Bassac", read.CommuneName);
        Assert.Equal("Bak Touk High School", read.SchoolName);
        Assert.Null(read.SchoolHostId);
        Assert.True(read.HasNgoSupport);
        Assert.Equal("Hope NGO", read.NgoName);
        Assert.Equal(("u1", "Dara"), (read.CreatedById, read.CreatedByName));
        Assert.NotEqual(0u, read.Version);
    }

    [Fact]
    public async Task ACandidate_IsOnlyFoundThroughItsOwnCampaign()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        Assert.Null(await InScopeAsync(r => r.GetAsync(other, stored.Id, CancellationToken.None)));
        Assert.Null(await InScopeAsync(r => r.GetAsync(campaign, Guid.NewGuid(), CancellationToken.None)));
    }

    [Fact]
    public async Task AChange_IsSavedWithItsAuditLine()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        var result = await InScopeAsync(async r =>
        {
            var candidate = (await r.GetAsync(campaign, stored.Id, CancellationToken.None))!;
            candidate.Change(Details(nameEn: "Sok Dara", phone: stored.Phone), Now.AddDays(1));
            r.AddAudit(CandidateAuditEntry.Record(campaign, candidate.Id, AuditAction.Updated, "{}", "{}", "u1", "Dara", Now.AddDays(1)));
            return await r.SaveChangesAsync(CancellationToken.None);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal("Sok Dara", (await InScopeAsync(r => r.GetAsync(campaign, stored.Id, CancellationToken.None)))!.NameEn);
        Assert.Equal(1L, await _fixture.ScalarAsync<long>("select count(*) from candidates.audit_log where candidate_id = @c", ("c", stored.Id)));
    }

    [Fact]
    public async Task ARemovedCandidate_IsGoneButItsAuditLineStays()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        var result = await InScopeAsync(async r =>
        {
            var candidate = (await r.GetAsync(campaign, stored.Id, CancellationToken.None))!;
            r.Remove(candidate);
            r.AddAudit(CandidateAuditEntry.Record(campaign, candidate.Id, AuditAction.Deleted, "{}", null, "u1", "Dara", Now));
            return await r.SaveChangesAsync(CancellationToken.None);
        });

        Assert.True(result.IsSuccess);
        Assert.Null(await InScopeAsync(r => r.GetAsync(campaign, stored.Id, CancellationToken.None)));
        Assert.Equal(1L, await _fixture.ScalarAsync<long>("select count(*) from candidates.audit_log where candidate_id = @c", ("c", stored.Id)));
    }

    // ---------- Conflicts ----------

    [Fact]
    public async Task TwoPeopleSavingTheSameCandidate_TheSecondGetsAConcurrentEdit()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        await using var first = _fixture.Services.CreateAsyncScope();
        await using var second = _fixture.Services.CreateAsyncScope();
        var repoA = first.ServiceProvider.GetRequiredService<ICandidateRepository>();
        var repoB = second.ServiceProvider.GetRequiredService<ICandidateRepository>();
        var a = (await repoA.GetAsync(campaign, stored.Id, CancellationToken.None))!;
        var b = (await repoB.GetAsync(campaign, stored.Id, CancellationToken.None))!;

        a.Change(Details(nameEn: "Changed By A", phone: stored.Phone), Now.AddDays(1));
        b.Change(Details(nameEn: "Changed By B", phone: stored.Phone), Now.AddDays(1));

        Assert.True((await repoA.SaveChangesAsync(CancellationToken.None)).IsSuccess);
        var lost = await repoB.SaveChangesAsync(CancellationToken.None);

        Assert.Equal(CandidateErrors.ConcurrentEdit, lost.Error);
        Assert.Equal("Changed By A", (await InScopeAsync(r => r.GetAsync(campaign, stored.Id, CancellationToken.None)))!.NameEn);
    }

    [Fact]
    public async Task ThePhoneTakenBetweenTheCheckAndTheSave_IsReportedAsTaken()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        var result = await InScopeAsync(async r =>
        {
            r.Add(Candidate.Create(campaign, Details(phone: stored.Phone), "u2", "Other", Now).Value);
            return await r.SaveChangesAsync(CancellationToken.None);
        });

        Assert.Equal(CandidateErrors.PhoneTaken, result.Error);
    }

    [Fact]
    public async Task FindByPhone_FindsInTheCampaignAndCanSkipOneCandidate()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var stored = await AddAsync(campaign);

        var found = await InScopeAsync(r => r.FindByPhoneAsync(campaign, stored.Phone, null, CancellationToken.None));
        Assert.Equal(stored.Id, found!.Id);
        Assert.Null(await InScopeAsync(r => r.FindByPhoneAsync(campaign, stored.Phone, stored.Id, CancellationToken.None)));
        Assert.Null(await InScopeAsync(r => r.FindByPhoneAsync(other, stored.Phone, null, CancellationToken.None)));
        Assert.Null(await InScopeAsync(r => r.FindByPhoneAsync(campaign, "0999999999", null, CancellationToken.None)));
    }

    // ---------- List, paging, order ----------

    [Fact]
    public async Task TheList_IsNewestFirstAndOnlyThisCampaigns()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        var old = await AddAsync(campaign, Details(nameEn: "Old One"), Now);
        var recent = await AddAsync(campaign, Details(nameEn: "Recent One"), Now.AddDays(2));
        var middle = await AddAsync(campaign, Details(nameEn: "Middle One"), Now.AddDays(1));
        await AddAsync(other, Details(nameEn: "Elsewhere"));

        var list = await ListAsync(campaign);

        Assert.Equal([recent.Id, middle.Id, old.Id], list.Items.Select(c => c.Id));
        Assert.Equal(3, list.TotalCount);
    }

    [Fact]
    public async Task Paging_GivesEachPageItsSliceAndTheWholeCount()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        for (var i = 0; i < 5; i++)
        {
            await AddAsync(campaign, Details(nameEn: $"Person {(char)('A' + i)}"), Now.AddMinutes(i));
        }

        var first = await ListAsync(campaign, Query(page: 1, size: 2));
        var third = await ListAsync(campaign, Query(page: 3, size: 2));

        Assert.Equal(["Person E", "Person D"], first.Items.Select(c => c.NameEn));
        Assert.Equal(["Person A"], third.Items.Select(c => c.NameEn));
        Assert.Equal(5, first.TotalCount);
        Assert.Equal(3, first.TotalPages);
    }

    // ---------- Search ----------

    [Fact]
    public async Task Search_FindsAnEnglishNameInAnyCase()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        await AddAsync(campaign, Details(nameEn: "Sok Chenda"));
        await AddAsync(campaign, Details(nameEn: "Vann Dara"));

        var found = await ListAsync(campaign, Query(search: "  CHEN "));

        Assert.Equal("Sok Chenda", Assert.Single(found.Items).NameEn);
    }

    [Fact]
    public async Task Search_FindsAKhmerName()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        await AddAsync(campaign, Details(nameKm: "សុខ ចិន្តា"));
        await AddAsync(campaign, Details(nameKm: "វ៉ាន់ ដារ៉ា", nameEn: "Vann Dara"));

        var found = await ListAsync(campaign, Query(search: "ដារ៉ា"));

        Assert.Equal("Vann Dara", Assert.Single(found.Items).NameEn);
    }

    [Theory]
    [InlineData("012 345 678")]
    [InlineData("012345")]
    [InlineData("+855 12 345")]
    [InlineData("345678")]
    public async Task Search_FindsAPhoneHoweverItIsTyped(string typed)
    {
        var campaign = await _fixture.CreateCampaignAsync();
        await AddAsync(campaign, Details(phone: "012345678"));
        await AddAsync(campaign, Details(phone: "097111222"));

        var found = await ListAsync(campaign, Query(search: typed));

        Assert.Equal("012345678", Assert.Single(found.Items).Phone);
    }

    [Fact]
    public async Task Search_TreatsPercentAndUnderscoreAsPlainCharacters()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        await AddAsync(campaign, Details(nameEn: "Sok Chenda"));

        Assert.Empty((await ListAsync(campaign, Query(search: "%"))).Items);
        Assert.Empty((await ListAsync(campaign, Query(search: "S_k"))).Items);
        Assert.Single((await ListAsync(campaign, Query(search: "S"))).Items);
    }

    // ---------- Filters ----------

    [Fact]
    public async Task TheFilters_NarrowTheListAndCombine()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var session = await _fixture.ScalarAsync<Guid>(
            """
            insert into sessions.information_sessions
                (id, campaign_id, title, session_date, start_time, end_time, format, venue, assignee_id, assignee_name,
                 host_type, host_user_id, host_user_name, status, created_by_id, created_by_name, created_at, updated_at)
            values (gen_random_uuid(), @c, 'Open day', date '2027-03-20', time '09:00', time '11:00', 1, 'Hall', 'o1', 'S',
                    1, 'o1', 'S', 1, 'u', 'U', now(), now())
            returning id
            """, ("c", campaign));

        var a = await AddAsync(campaign, Details(nameEn: "A", province: "Battambang", sessionId: session, ngo: true));
        var b = await AddAsync(campaign, Details(nameEn: "B", province: "Battambang"));
        var c = await AddAsync(campaign, Details(nameEn: "C", province: "Siem Reap", sessionId: session));

        Assert.Equal(new[] { a.Id, b.Id }.Order(), (await ListAsync(campaign, Query(province: "Battambang"))).Items.Select(x => x.Id).Order());
        Assert.Equal(new[] { a.Id, c.Id }.Order(),(await ListAsync(campaign, Query(session: session))).Items.Select(x => x.Id).Order());
        Assert.Equal(a.Id, Assert.Single((await ListAsync(campaign, Query(ngo: true))).Items).Id);
        Assert.Equal(2, (await ListAsync(campaign, Query(ngo: false))).TotalCount);
        Assert.Equal(a.Id, Assert.Single((await ListAsync(campaign, Query(province: "Battambang", session: session))).Items).Id);
    }

    [Fact]
    public async Task ProvinceNames_AreDistinctAndSortedForTheCampaignOnly()
    {
        var campaign = await _fixture.CreateCampaignAsync();
        var other = await _fixture.CreateCampaignAsync();
        await AddAsync(campaign, Details(province: "Siem Reap"));
        await AddAsync(campaign, Details(province: "Battambang"));
        await AddAsync(campaign, Details(province: "Siem Reap"));
        await AddAsync(other, Details(province: "Kampot"));

        var names = await InScopeAsync(r => r.ListProvinceNamesAsync(campaign, CancellationToken.None));

        Assert.Equal(["Battambang", "Siem Reap"], names);
    }
}
