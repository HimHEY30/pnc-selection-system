import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Calls the ASP.NET backend from the Next.js server as the signed-in user. The access
// token never reaches the browser's own requests: pages and server actions call this,
// and the browser only ever talks to Next.js.

// Inside Docker the compose file sets this to the backend service; for a plain
// `npm run dev` it defaults to the backend's published port.
const BACKEND_URL = process.env.BACKEND_API_URL ?? "http://localhost:5000";

const SIGN_IN_URL = "/login?callbackUrl=/admin";

/** A failure the backend reported, in the shape of its RFC 7807 problem responses. */
export type ApiProblem = {
  status: number;
  code?: string;
  title: string;
  /** Messages per request field (camelCase), for validation failures. */
  fieldErrors?: Record<string, string[]>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ApiProblem };

/** The backend could not be reached at all (down, network, timeout). */
export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The backend API could not be reached.", { cause });
    this.name = "ApiUnavailableError";
  }
}

/** The backend answered with a failure this page cannot handle (it is shown by error.tsx). */
export class ApiError extends Error {
  readonly problem: ApiProblem;

  constructor(problem: ApiProblem) {
    super(`The backend API returned ${problem.status}: ${problem.title}`);
    this.name = "ApiError";
    this.problem = problem;
  }
}

type RequestOptions = { method?: "GET" | "POST" | "PUT"; body?: unknown };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const session = await auth();
  // No token, or a token we could not renew: the user must sign in again.
  if (!session?.accessToken || session.error) {
    redirect(SIGN_IN_URL);
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
        ...(options.body !== undefined && { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Campaign data changes constantly; never serve a stale copy.
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (response.status === 401) {
    redirect(SIGN_IN_URL);
  }

  if (response.ok) {
    return { ok: true, data: (await response.json()) as T };
  }

  return { ok: false, problem: await readProblem(response) };
}

async function readProblem(response: Response): Promise<ApiProblem> {
  const fallback: ApiProblem = { status: response.status, title: response.statusText || "Request failed" };
  try {
    const body = (await response.json()) as {
      title?: string;
      code?: string;
      errors?: Record<string, string[]>;
    };
    return {
      status: response.status,
      title: body.title ?? fallback.title,
      code: body.code,
      fieldErrors: body.errors,
    };
  } catch {
    return fallback;
  }
}
