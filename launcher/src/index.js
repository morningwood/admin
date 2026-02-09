export default {
  async fetch(request, env) {
    // Optional: let preflight through (usually harmless)
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    const unauthorized = () =>
      new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Zak Launchpad", charset="UTF-8"',
          "Cache-Control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      });

    const timingSafeEqual = (a, b) => {
      a = String(a ?? "");
      b = String(b ?? "");
      if (a.length !== b.length) return false;
      let out = 0;
      for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return out === 0;
    };

    const h = request.headers.get("Authorization") || "";
    const m = h.match(/^Basic\s+(.+)$/i);
    if (!m) return unauthorized();

    let decoded = "";
    try {
      decoded = atob(m[1]);
    } catch {
      return unauthorized();
    }

    const idx = decoded.indexOf(":");
    if (idx < 0) return unauthorized();

    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);

    // Reuse your existing vars:
    // - INPUT_USER in wrangler.toml
    // - INPUT_PASS in secrets / .dev.vars
    // - (optional) BOSS_PASS acts like a second “master” password for same username
    const userOk = timingSafeEqual(user, env.INPUT_USER);
    const passOk =
      timingSafeEqual(pass, env.INPUT_PASS) ||
      timingSafeEqual(pass, env.BOSS_PASS); // optional second password

    if (!(userOk && passOk)) return unauthorized();

    // Authorized: serve the static site
    const res = await env.ASSETS.fetch(request);

    // Optional: prevent shared caching of private stuff
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "private, no-store");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  },
};
