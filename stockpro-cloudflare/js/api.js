const API_URL = "https://stockpro.YOURNAME.workers.dev/api";

async function getMaterials() {
  const res = await fetch(`${API_URL}/materials`);
  return await res.json();
}

async function addMaterial(name, qty) {
  await fetch(`${API_URL}/add-material`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name, quantity: qty })
  });
}

async function getMovements() {
  const res = await fetch(`${API_URL}/movements`);
  return await res.json();
}

async function addMovement(material_id, type, qty) {
  await fetch(`${API_URL}/add-movement`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ material_id, type, qty })
  });
}
