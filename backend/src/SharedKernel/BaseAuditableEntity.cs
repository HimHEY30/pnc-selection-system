namespace SharedKernel;

public abstract class BaseAuditableEntity<TId> : BaseEntity<TId>
{
    public DateTimeOffset CreatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public DateTimeOffset? ModifiedAt { get; set; }
    public string? ModifiedBy { get; set; }
}
