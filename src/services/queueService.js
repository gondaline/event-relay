import createHttpError from "../utils/createHttpError.js";

async function publishRetryMessage(deliveryId) {

    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/queues/${process.env.CLOUDFLARE_QUEUE_ID}/messages`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
        },
        body: JSON.stringify({
            body: {
                deliveryId: deliveryId
            },
            content_type: "json"
        })
    });

    const data = await response.json();

    if (!response.ok || data.success !== true) {
        throw createHttpError(500, "Falha ao publicar mensagem na fila")
    }

    return;
}

export default publishRetryMessage;