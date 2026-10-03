using Microsoft.EntityFrameworkCore;
using Sessions.Domain;

namespace Sessions.Infrastructure.Persistence;

public sealed class SessionsDbContext : DbContext
{
    /// <summary>Every table of this module lives in its own schema (modular monolith).</summary>
    public const string Schema = "sessions";

    public SessionsDbContext(DbContextOptions<SessionsDbContext> options) : base(options) { }

    public DbSet<InformationSession> Sessions => Set<InformationSession>();
    public DbSet<SessionHost> Hosts => Set<SessionHost>();
    public DbSet<SessionAuditEntry> Audit => Set<SessionAuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SessionsDbContext).Assembly);
    }
}
