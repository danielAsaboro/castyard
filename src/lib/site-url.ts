const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|localhost)(?::\d{1,5})?$/i;

export function resolveSiteOrigin(requestHeaders: Headers): string {
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim();
  const directHost = requestHeaders.get("host")?.trim();
  const host = forwardedHost || directHost;
  if (!host || !SAFE_HOST.test(host)) return "http://localhost:3000";

  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
