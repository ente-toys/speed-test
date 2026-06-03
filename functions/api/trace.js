export function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cf = request.cf || {};
  const userAgent = request.headers.get("user-agent") || "";

  return Response.json(
    {
      hostname: url.hostname,
      timestamp: new Date().toISOString(),
      colo: cf.colo || null,
      country: cf.country || null,
      region: cf.region || cf.regionCode || null,
      city: cf.city || null,
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      httpProtocol: cf.httpProtocol || null,
      tlsVersion: cf.tlsVersion || null,
      userAgent: userAgent.slice(0, 240),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    },
  );
}

