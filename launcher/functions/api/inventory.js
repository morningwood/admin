export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB
      .prepare("SELECT id, name, qty, created_at AS createdAt FROM inventory_items ORDER BY created_at DESC")
      .all();

    return Response.json({ ok: true, items: results });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items) return Response.json({ ok: false, error: "Body must be { items: [...] }" }, { status: 400 });

    // Wipe + rewrite (simple and reliable for a small inventory list)
    await env.DB.prepare("DELETE FROM inventory_items").run();

    const stmts = [];
    for (const it of items) {
      const id = String(it?.id || "").trim();
      const name = String(it?.name || "").trim();
      const qty = Number(it?.qty);
      const createdAt = Number(it?.createdAt);

      if (!id || !name || !Number.isFinite(qty) || qty < 0 || !Number.isFinite(createdAt)) continue;

      stmts.push(
        env.DB.prepare(
          "INSERT INTO inventory_items (id, name, qty, created_at) VALUES (?, ?, ?, ?)"
        ).bind(id, name, qty, createdAt)
      );
    }

    if (stmts.length) await env.DB.batch(stmts);

    return Response.json({ ok: true, written: stmts.length });
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
