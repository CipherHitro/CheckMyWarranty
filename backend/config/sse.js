const clients = new Map();

export function addSseClient(userId, res) {
  const uid = Number(userId);
  if (!clients.has(uid)) {
    clients.set(uid, new Set());
  }
  clients.get(uid).add(res);
}

export function removeSseClient(userId, res) {
  const uid = Number(userId);
  if (clients.has(uid)) {
    const userClients = clients.get(uid);
    if (res) {
      userClients.delete(res);
    }
    if (!res || userClients.size === 0) {
      clients.delete(uid);
    }
  }
}

export function sendSseEventToUser(userId, eventName, data) {
  const uid = Number(userId);
  const userClients = clients.get(uid);

  if (userClients && userClients.size > 0) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    userClients.forEach((res) => {
      try {
        res.write(payload);
      } catch (_) {
        userClients.delete(res);
      }
    });
  }
}

