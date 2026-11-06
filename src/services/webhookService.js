import isSafeUrl from "../utils/isSafeUrl.js";

async function sendWebhook(url, event) {
    let status = "FAILED";
    let httpStatus = null;

    try {
        // Repete a checagem do cadastro, porque o DNS do destino pode ter mudado.
        if (!await isSafeUrl(url)) {
            console.error(`Envio bloqueado para o endpoint ${event.endpointId}: destino não permitido ou que não pôde ser verificado`);
            return { status, httpStatus };
        }

        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            // Um redirecionamento poderia levar o envio para um endereço interno.
            redirect: "manual",
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
