namespace Campaigns.Domain;

/// <summary>
/// One of Cambodia's 25 provinces and municipalities. Reference data, seeded by
/// the initial migration. <see cref="NameKm"/> is reserved for the Khmer translation.
/// </summary>
public sealed class Province
{
    public short Id { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string NameEn { get; private set; } = string.Empty;
    public string? NameKm { get; private set; }

    private Province() { }

    public Province(short id, string code, string nameEn)
    {
        Id = id;
        Code = code;
        NameEn = nameEn;
    }
}
