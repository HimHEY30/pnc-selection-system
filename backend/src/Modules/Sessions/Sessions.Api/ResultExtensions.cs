using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SharedKernel;

namespace Sessions.Api;

internal static class ResultExtensions
{
    /// <summary>
    /// Maps a failed result to an RFC 7807 problem response. Validation failures carry
    /// the per-field messages in "errors" so the UI can show them under each field.
    /// </summary>
    public static ActionResult ToProblem(this Error error)
    {
        switch (error.Type)
        {
            case ErrorType.Validation:
                return new BadRequestObjectResult(new ValidationProblemDetails(
                    error.FieldErrors?.ToDictionary(e => e.Key, e => e.Value) ?? [])
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = error.Message,
                    Extensions = { ["code"] = error.Code },
                });

            case ErrorType.NotFound:
                return Problem(StatusCodes.Status404NotFound, error);

            case ErrorType.Conflict:
                return Problem(StatusCodes.Status409Conflict, error);

            case ErrorType.Forbidden:
                return Problem(StatusCodes.Status403Forbidden, error);

            case ErrorType.Unavailable:
                return Problem(StatusCodes.Status503ServiceUnavailable, error);

            default:
                return Problem(StatusCodes.Status400BadRequest, error);
        }
    }

    private static ObjectResult Problem(int status, Error error) =>
        new(new ProblemDetails
        {
            Status = status,
            Title = error.Message,
            Extensions = { ["code"] = error.Code },
        })
        {
            StatusCode = status,
        };
}
