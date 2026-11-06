import { checkUrl } from "../utils/isSafeUrl.js";

async function sendWebhook(url, event) {
    let status = "FAILED";
    let httpStatus = null;

    try {
        // Repete a checagem do cadastro, porque o DNS do destino pode ter mudado.
        const urlCheck = await checkUrl(url);

        if (urlCheck === "BLOCKED") {
            console.error(`Envio bloqueado para o endpoint ${event.endpointId}: a URL aponta para um endereço não permitido`);
            return { status, httpStatus, blocked: true };
        }

        if (urlCheck === "UNVERIFIED") {
            console.error(`Envio não realizado para o endpoint ${event.endpointId}: não foi possível verificar o DNS do destino`);
            return { status, httpStatus, blocked: false };
        }

        const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            // Um redirecionamento poderia levar o envio para um endereço interno.
            redirect: "manual",
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            // Campos fixos para que a primeira tentativa e os retries enviem o mesmo corpo.
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

    return { status, httpStatus, blocked: false };
}

export default sendWebhook;
