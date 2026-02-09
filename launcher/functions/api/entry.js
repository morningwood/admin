export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB
      .prepare("SELECT id, value, created_at FROM entries ORDER BY id DESC LIMIT 20")
      .all();
    return Response.json({ ok: true, results });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const text = (body?.text || "").trim();
    if (!text) return Response.json({ ok: false, error: "Missing 'text'" }, { status: 400 });

    await env.DB.prepare("INSERT INTO entries (value) VALUES (?)").bind(text).run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
