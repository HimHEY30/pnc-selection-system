using Sessions.Domain;

namespace Sessions.Application;

/// <summary>Entities to the shapes the API sends. Nothing here decides anything.</summary>
internal static class SessionMapper
{
    public static HostDto ToDto(SessionHost host) => new(
        host.Id,
        host.Type.ToString(),
        host.Name,
        host.PartnerKind?.ToString(),
        host.ContactPerson,
        host.Phone,
        host.Email,
        host.IsActive);

    /// <param name="province">The session's province with its name, when it has one.</param>
    /// <param name="host">The directory record, for an alumnus or a partner host.</param>
    public static SessionDto ToDto(InformationSession s, SessionProvinceDto? province, SessionHost? host)
    {
        var sessionHost = s.HostType switch
        {
            null => null,
            HostType.Officer => new SessionHostDto(nameof(HostType.Officer), s.HostUserName ?? string.Empty, s.HostUserId, null, null, null, null, true),
            var type => new SessionHostDto(
                type.ToString()!,
                host?.Name ?? string.Empty,
                null,
                s.HostId,
                host?.PartnerKind?.ToString(),
                host?.Phone,
                host?.Email,
                host?.IsActive ?? false),
        };

        var attendance = s is { ActualFemale: { } female, ActualMale: { } male, AttendanceRecordedAt: { } at }
            ? new AttendanceDto(female, male, female + male, at, s.AttendanceRecordedByName ?? string.Empty)
            : null;

        return new SessionDto(
            s.Id,
            s.CampaignId,
            s.Title,
            s.Date,
            Names.Time(s.StartTime),
            Names.Time(s.EndTime),
            s.Format.ToString(),
            s.Venue,
            s.MeetingLink,
            province,
            s.Notes,
            s.AssigneeId is { } assigneeId ? new PersonDto(assigneeId, s.AssigneeName ?? string.Empty) : null,
            sessionHost,
            s.Status.ToString(),
            s.CancelReason,
            s.ExpectedCandidates,
            attendance,
            s.CreatedByName,
            s.UpdatedAt);
    }
}
