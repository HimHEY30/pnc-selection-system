using Candidates.Domain;
using Microsoft.EntityFrameworkCore;

namespace Candidates.Infrastructure.Persistence;

public sealed class CandidatesDbContext : DbContext
{
    /// <summary>Every table of this module lives in its own schema (modular monolith).</summary>
    public const string Schema = "candidates";

    public CandidatesDbContext(DbContextOptions<CandidatesDbContext> options) : base(options) { }

    public DbSet<Candidate> Candidates => Set<Candidate>();
    public DbSet<CandidateAuditEntry> Audit => Set<CandidateAuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CandidatesDbContext).Assembly);
    }
}
