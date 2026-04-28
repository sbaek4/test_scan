export async function sendNotification(url: string, payload: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await res.text();
  return { status: res.status, body };
}
