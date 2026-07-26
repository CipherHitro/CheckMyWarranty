const clients = new Map();

export function addSseClient(userId, res){
    clients.set(Number(userId), res);
}

export function removeSseClient(userId){
    clients.delete(Number(userId));
}

export function sendSseEventToUser(userId, eventName, data){
    const clientRes = clients.get(Number(userId));

    if (clientRes) {
        clientRes.write(`event: ${eventName}\n`);
        clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}
