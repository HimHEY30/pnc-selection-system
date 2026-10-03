using Eligibility.Domain.Catalogue;
using Eligibility.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace Eligibility.Infrastructure.Persistence;

public sealed class EligibilityDbContext : DbContext
{
    /// <summary>Every table of this module lives in its own schema (modular monolith).</summary>
    public const string Schema = "eligibility";

    public EligibilityDbContext(DbContextOptions<EligibilityDbContext> options) : base(options) { }

    public DbSet<FieldDefinition> Fields => Set<FieldDefinition>();
    public DbSet<FieldOption> FieldOptions => Set<FieldOption>();
    public DbSet<OperatorDefinition> Operators => Set<OperatorDefinition>();
    public DbSet<ExamSetup> ExamSetups => Set<ExamSetup>();
    public DbSet<RuleSet> RuleSets => Set<RuleSet>();
    public DbSet<RuleGroup> Groups => Set<RuleGroup>();
    public DbSet<Rule> Rules => Set<Rule>();
    public DbSet<EligibilityAuditEntry> Audit => Set<EligibilityAuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(EligibilityDbContext).Assembly);
    }
}
