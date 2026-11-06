import { createDelivery } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js";
import isRetryable from "../utils/isRetryable.js";
import publishRetryMessage from "./queueService.js";
import sendWebhook from "./webhookService.js";

// A entrega já está salva: a falha na publicação é informada ao cliente, não relançada.
async function scheduleRetry(deliveryId) {
    try {
        console.log(`Publicando entrega ${deliveryId} na fila`);

        await publishRetryMessage(deliveryId);
        console.log(`Entrega ${deliveryId} publicada com sucesso`);

        return true;
    } catch (error) {
        console.error(`Falha ao publicar a entrega ${deliveryId} na fila:`, error);

        return false;
    }
}

async function deliverEvent(event) {
    if (!event?.endpointId) throw createHttpError(400, "O campo endpointId é obrigatório e deve ser maior que zero");
    const endpointId = event.endpointId;
    if (!Number.isInteger(endpointId)) throw createHttpError(400, "O campo endpointId deve ser um número inteiro");
    if (endpointId < 1 || endpointId > 2147483647) throw createHttpError(400, "O campo endpointId deve estar entre 1 e 2147483647");

    if (typeof event.type !== "string") throw createHttpError(400, "O campo type deve ser um texto");
    if (event.type.trim() === "") throw createHttpError(400, "O campo type não pode estar vazio");
    if (event.type.length > 200) throw createHttpError(400, "O campo type deve ter no máximo 200 caracteres");

    if (typeof event.data !== "object" || event.data === null || Array.isArray(event.data))
        throw createHttpError(400, "O campo data deve ser um objeto");

    const endpoint = await findEndpointById(endpointId);
    if (!endpoint) throw createHttpError(404, "Endpoint não encontrado. Cadastre um em POST /endpoints");

    const { status, httpStatus, blocked } = await sendWebhook(endpoint.url, event);

    const delivery = await createDelivery({
        endpoint_id: endpointId,
        event_type: event.type,
        payload: event.data,
        status: status,
        http_status: httpStatus
    });

    const retryScheduled = !blocked && isRetryable(httpStatus) && (await scheduleRetry(delivery.id));

    return { deliveryId: delivery.id, status, httpStatus, retryScheduled, blocked };
}

export default deliverEvent;
