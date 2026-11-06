async function sendWebhook(url, event) {
    let status = "FAILED";
    let httpStatus = null;

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            // Os campos são escolhidos aqui para que a primeira tentativa
            // e os retries enviem sempre o mesmo formato.
            body: JSON.stringify({
                endpointId: event.endpointId,
                type: event.type,
                data: event.data
            })
        });

        if (response.ok) status = "SUCCESS";

        httpStatus = response.status;

    } catch (error) {
        console.error("Erro ao enviar webhook:", error);
    }

    return { status, httpStatus };
}

export default sendWebhook;
