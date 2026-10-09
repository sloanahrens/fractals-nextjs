import { REQUEST_TIMEOUT_MS } from "@/lib/integrationTarget";

/** How many times one check's request is sent: the attempt and its retry. */
const ATTEMPTS = 2;

/** One GET at the tier's deadline. A 5xx is a failure like any other here. */
async function getOnce(url: string): Promise<Response> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 500) {
    // The body of a server error is not what any check here reads, and
    // abandoning it lets the connection go before the retry opens another.
    await response.body?.cancel();
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response;
}

/**
 * GET `url`, with one retry.
 *
 * The app being tested has just been rolled onto, and a connection reset or a
 * 503 while that rollout settles is not the finding the tier is looking for;
 * one more attempt costs a second and says which of the two it was. It is
 * exactly one: a response that fails twice is a failure, and the message says
 * so rather than leaving a bare "fetch failed". Waiting for a new revision to
 * come up at all is the workflow's retry, not this one's.
 *
 * @param url - The absolute URL to call
 * @returns The response, for a status under 500
 * @throws When both attempts fail, with the second failure's reason
 */
export async function get(url: string): Promise<Response> {
  let failure: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await getOnce(url);
    } catch (error) {
      failure = error;
    }
  }

  const reason = failure instanceof Error ? failure.message : String(failure);
  throw new Error(
    `GET ${url} failed twice, ${REQUEST_TIMEOUT_MS / 1000} s each: ${reason}`,
  );
}
