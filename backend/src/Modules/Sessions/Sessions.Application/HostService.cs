using System.Text.Json;
using Identity.Application;
using Sessions.Domain;
using SharedKernel;

namespace Sessions.Application;

public interface IHostService
{
    /// <summary>The directory of alumni and partners, by name. Switched-off hosts are left out unless asked for.</summary>
    Task<Result<IReadOnlyList<HostDto>>> ListAsync(string? type, bool includeInactive, CancellationToken ct);

    Task<Result<HostDto>> CreateAsync(HostRequest request, CancellationToken ct);

    Task<Result<HostDto>> UpdateAsync(Guid id, HostRequest request, CancellationToken ct);

    /// <summary>Switches a host off (so it cannot be chosen for new sessions) or back on. Its past sessions keep it.</summary>
    Task<Result<HostDto>> SetActiveAsync(Guid id, bool active, CancellationToken ct);
}

/// <summary>The alumni and partner directory: add, change, switch off. Each change is audited.</summary>
public sealed class HostService : IHostService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ISessionRepository _repository;
    private readonly ICurrentUserService _currentUser;
    private readonly IClock _clock;

    public HostService(ISessionRepository repository, ICurrentUserService currentUser, IClock clock)
    {
        _repository = repository;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<Result<IReadOnlyList<HostDto>>> ListAsync(string? type, bool includeInactive, CancellationToken ct)
    {
        HostType? filter = null;
        if (!string.IsNullOrWhiteSpace(type))
        {
            filter = Names.ParseEnum<HostType>(type);
            if (filter is not (HostType.Alumni or HostType.Partner))
            {
                return Result.Failure<IReadOnlyList<HostDto>>(SessionErrors.Invalid("type", "Use Alumni or Partner."));
            }
        }

        var hosts = await _repository.ListHostsAsync(filter, includeInactive, ct);
        return Result.Success<IReadOnlyList<HostDto>>(hosts.Select(SessionMapper.ToDto).ToList());
    }

    public async Task<Result<HostDto>> CreateAsync(HostRequest request, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<HostDto>(SessionErrors.NoUser);
        }

        var details = ToDetails(request);
        if (details.IsFailure)
        {
            return Result.Failure<HostDto>(details.Error);
        }

        var created = SessionHost.Create(details.Value, user.Subject, user.DisplayName, _clock.UtcNow);
        if (created.IsFailure)
        {
            return Result.Failure<HostDto>(created.Error);
        }

        var host = created.Value;
        _repository.AddHost(host);
        AddAudit(host, AuditAction.Created, null, Snapshot(host), user);

        var saved = await SaveAsync(host.Type, ct);
        return saved.IsFailure ? Result.Failure<HostDto>(saved.Error) : SessionMapper.ToDto(host);
    }

    public async Task<Result<HostDto>> UpdateAsync(Guid id, HostRequest request, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<HostDto>(SessionErrors.NoUser);
        }

        var host = await _repository.GetHostAsync(id, ct);
        if (host is null)
        {
            return Result.Failure<HostDto>(SessionErrors.HostNotFound);
        }

        var details = ToDetails(request);
        if (details.IsFailure)
        {
            return Result.Failure<HostDto>(details.Error);
        }

        var before = Snapshot(host);
        var updated = host.Update(details.Value, _clock.UtcNow);
        if (updated.IsFailure)
        {
            return Result.Failure<HostDto>(updated.Error);
        }

        var after = Snapshot(host);
        if (before == after)
        {
            return SessionMapper.ToDto(host);
        }

        AddAudit(host, AuditAction.Updated, before, after, user);

        var saved = await SaveAsync(host.Type, ct);
        return saved.IsFailure ? Result.Failure<HostDto>(saved.Error) : SessionMapper.ToDto(host);
    }

    public async Task<Result<HostDto>> SetActiveAsync(Guid id, bool active, CancellationToken ct)
    {
        if (_currentUser.User is not { } user)
        {
            return Result.Failure<HostDto>(SessionErrors.NoUser);
        }

        var host = await _repository.GetHostAsync(id, ct);
        if (host is null)
        {
            return Result.Failure<HostDto>(SessionErrors.HostNotFound);
        }

        if (host.IsActive == active)
        {
            return SessionMapper.ToDto(host);
        }

        var before = Snapshot(host);
        host.SetActive(active, _clock.UtcNow);
        AddAudit(host, active ? AuditAction.Activated : AuditAction.Deactivated, before, Snapshot(host), user);

        var saved = await SaveAsync(host.Type, ct);
        return saved.IsFailure ? Result.Failure<HostDto>(saved.Error) : SessionMapper.ToDto(host);
    }

    // ---------- Helpers ----------

    /// <summary>Reads the names the form sent. Problems are reported per field, together with the domain's own checks.</summary>
    private static Result<HostDetails> ToDetails(HostRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var type = Names.ParseEnum<HostType>(request.Type);
        if (type is not (HostType.Alumni or HostType.Partner))
        {
            errors["type"] = ["Choose alumnus or partner."];
        }

        PartnerKind? kind = null;
        if (!string.IsNullOrWhiteSpace(request.PartnerKind))
        {
            kind = Names.ParseEnum<PartnerKind>(request.PartnerKind);
            if (kind is null)
            {
                errors["partnerKind"] = ["Choose NGO, high school, university or other."];
            }
        }

        if (errors.Count > 0)
        {
            return Result.Failure<HostDetails>(SessionErrors.Invalid(errors));
        }

        return new HostDetails(type!.Value, request.Name ?? string.Empty, kind, request.ContactPerson, request.Phone, request.Email);
    }

    private async Task<Result> SaveAsync(HostType type, CancellationToken ct)
    {
        var saved = await _repository.SaveChangesAsync(ct);
        return saved.IsFailure && saved.Error == SessionErrors.DuplicateHost
            ? Result.Failure(SessionErrors.HostNameTaken(type))
            : saved;
    }

    private void AddAudit(SessionHost host, AuditAction action, string? before, string? after, Identity.Domain.AuthenticatedUser user) =>
        _repository.AddAudit(SessionAuditEntry.Record(
            null, AuditEntity.Host, host.Id, action, before, after, user.Subject, user.DisplayName, _clock.UtcNow));

    private static string Snapshot(SessionHost host) => JsonSerializer.Serialize(
        new
        {
            type = host.Type.ToString(),
            name = host.Name,
            partnerKind = host.PartnerKind?.ToString(),
            contactPerson = host.ContactPerson,
            phone = host.Phone,
            email = host.Email,
            isActive = host.IsActive,
        },
        Json);
}
