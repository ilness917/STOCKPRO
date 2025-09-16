export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /api/materials
    if (url.pathname === "/api/materials" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM Materials").all();
      return Response.json(results);
    }

    // POST /api/add-material
    if (url.pathname === "/api/add-material" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare("INSERT INTO Materials (name, quantity) VALUES (?, ?)")
        .bind(body.name, body.quantity)
        .run();
      return Response.json({ success: true });
    }

    // GET /api/movements
    if (url.pathname === "/api/movements" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM Movements ORDER BY created_at DESC"
      ).all();
      return Response.json(results);
    }

    // POST /api/add-movement
    if (url.pathname === "/api/add-movement" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare(
        "INSERT INTO Movements (material_id, type, qty) VALUES (?, ?, ?)"
      )
        .bind(body.material_id, body.type, body.qty)
        .run();

      // Atualizar stock automaticamente
      if (body.type === "entrada") {
        await env.DB.prepare(
          "UPDATE Materials SET quantity = quantity + ? WHERE id = ?"
        )
          .bind(body.qty, body.material_id)
          .run();
      } else if (body.type === "saida") {
        await env.DB.prepare(
          "UPDATE Materials SET quantity = quantity - ? WHERE id = ?"
        )
          .bind(body.qty, body.material_id)
          .run();
      }

      return Response.json({ success: true });
    }

    return new Response("Not Found", { status: 404 });
  }
};
