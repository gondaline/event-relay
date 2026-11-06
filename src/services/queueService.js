async function publishRetryMessage(deliveryId) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/queues/${process.env.CLOUDFLARE_QUEUE_ID}/messages`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
        },
        body: JSON.stringify({
            body: {
                deliveryId
            },
            content_type: "json"
        })
    });

    // O corpo pode não ser JSON, como em uma página de erro em HTML.
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success !== true) {
        throw new Error(`Falha ao publicar mensagem na fila (HTTP ${response.status})`);
    }
}

export default publishRetryMessage;
