export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- tiny helpers
    const json = (data, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
      });

    const text = (body, status = 200, extraHeaders = {}) =>
      new Response(body, { status, headers: { ...extraHeaders } });

    const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);

    const bearerToken = () => {
      const h = request.headers.get("Authorization") || "";
      const m = h.match(/^Bearer\s+(.+)$/i);
      return m ? m[1].trim() : null;
    };

    const requireSession = async () => {
      const token = bearerToken();
      if (!token) return null;

      const now = Date.now();
      const row = await env.DB
        .prepare(`SELECT role, expires_at FROM sessions WHERE token = ? LIMIT 1`)
        .bind(token)
        .first();

      if (!row) return null;
      if (row.expires_at <= now) return null;
      return { token, role: row.role };
    };

    const requireRole = async (neededRole) => {
      const sess = await requireSession();
      if (!sess) return { ok: false, res: bad("Unauthorized", 401) };
      if (sess.role !== neededRole) return { ok: false, res: bad("Forbidden", 403) };
      return { ok: true, sess };
    };

// If it isn't /api, serve the website files
if (!path.startsWith("/api")) {
  return env.ASSETS.fetch(request);
}

    // --- ROUTES

    // Login: returns a session token + role
    if (path === "/api/login" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return bad("Invalid JSON"); }

      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      let role = null;
      if (username === env.INPUT_USER && password === env.INPUT_PASS) role = "input";
      if (username === env.BOSS_USER  && password === env.BOSS_PASS)  role = "boss";
      if (!role) return bad("Bad credentials", 401);

      const token = crypto.randomUUID();
      const now = Date.now();
      const expires = now + 1000 * 60 * 60 * 24 * 14; // 14 days

      await env.DB.prepare(
        `INSERT INTO sessions (token, role, created_at, expires_at) VALUES (?, ?, ?, ?)`
      ).bind(token, role, now, expires).run();

      return json({ ok: true, token, role, expiresAt: expires });
    }

    // List items (both roles can read)
    if (path === "/api/items" && request.method === "GET") {
      const sess = await requireSession();
      if (!sess) return bad("Unauthorized", 401);

      const { results } = await env.DB.prepare(
        `SELECT id, name, qty, created_at AS createdAt, updated_at AS updatedAt
         FROM inventory_items
         ORDER BY created_at DESC`
      ).all();

      return json({ ok: true, items: results });
    }

    // Add item (input role only)
    if (path === "/api/items" && request.method === "POST") {
      const gate = await requireRole("input");
      if (!gate.ok) return gate.res;

      let body;
      try { body = await request.json(); } catch { return bad("Invalid JSON"); }

      const name = String(body.name || "").trim();
      const qty = Number(body.qty);
      if (!name) return bad("Name required");
      if (!Number.isFinite(qty) || qty < 0) return bad("Qty must be a number >= 0");

      const now = Date.now();
      const id = crypto.randomUUID();

      await env.DB.prepare(
        `INSERT INTO inventory_items (id, name, qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, name, qty, now, now).run();

      return json({ ok: true, id });
    }

    // Update item (input role only)
    if (path.startsWith("/api/items/") && request.method === "PUT") {
      const gate = await requireRole("input");
      if (!gate.ok) return gate.res;

      const id = path.split("/").pop();
      let body;
      try { body = await request.json(); } catch { return bad("Invalid JSON"); }

      const name = String(body.name || "").trim();
      const qty = Number(body.qty);
      if (!name) return bad("Name required");
      if (!Number.isFinite(qty) || qty < 0) return bad("Qty must be a number >= 0");

      const now = Date.now();

      const res = await env.DB.prepare(
        `UPDATE inventory_items
         SET name = ?, qty = ?, updated_at = ?
         WHERE id = ?`
      ).bind(name, qty, now, id).run();

      return json({ ok: true, changed: res.changes || 0 });
    }

    // Delete item (input role only)
    if (path.startsWith("/api/items/") && request.method === "DELETE") {
      const gate = await requireRole("input");
      if (!gate.ok) return gate.res;

      const id = path.split("/").pop();
      const res = await env.DB.prepare(`DELETE FROM inventory_items WHERE id = ?`).bind(id).run();
      return json({ ok: true, changed: res.changes || 0 });
    }

    // CSV export (both roles can read)
    if (path === "/api/export.csv" && request.method === "GET") {
      const sess = await requireSession();
      if (!sess) return bad("Unauthorized", 401);

      const { results } = await env.DB.prepare(
        `SELECT name, qty, created_at FROM inventory_items ORDER BY created_at DESC`
      ).all();

      const header = "Liquor,Qty,Entered At\n";
      const rows = results.map(r => {
        const liquor = String(r.name).replaceAll('"', '""');
        const qty = Number(r.qty).toFixed(1);
        const entered = new Date(Number(r.created_at)).toISOString();
        return `"${liquor}",${qty},${entered}`;
      }).join("\n");

// If it isn't /api, serve the website files from /public
if (!url.pathname.startsWith("/api")) {
  return env.ASSETS.fetch(request);
}



      return text(header + rows, 200, { "content-type": "text/csv; charset=utf-8" });
    }

    return bad("Not found", 404);
  },
};
