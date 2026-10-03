namespace SharedKernel;

public enum ErrorType
{
    Failure,
    Validation,
    NotFound,
    Conflict,
    Forbidden,

    /// <summary>Something this system depends on (such as the identity provider) did not answer.</summary>
    Unavailable,
}

/// <summary>
/// A failure description. <see cref="FieldErrors"/> is only set for validation
/// failures and maps a request field name (camelCase, as in the JSON body) to the
/// messages to show under that field.
/// </summary>
public sealed record Error(
    string Code,
    string Message,
    ErrorType Type = ErrorType.Failure,
    IReadOnlyDictionary<string, string[]>? FieldErrors = null)
{
    public static readonly Error None = new(string.Empty, string.Empty);

    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);
    public static Error Validation(string code, string message) => new(code, message, ErrorType.Validation);
    public static Error Validation(string code, string message, IReadOnlyDictionary<string, string[]> fieldErrors) =>
        new(code, message, ErrorType.Validation, fieldErrors);
    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);
    public static Error Forbidden(string code, string message) => new(code, message, ErrorType.Forbidden);
    public static Error Unavailable(string code, string message) => new(code, message, ErrorType.Unavailable);
}
