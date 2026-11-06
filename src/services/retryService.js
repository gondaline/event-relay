import { findDeliveryById, updateDeliveryAfterRetry } from "../repository/deliveryRepository.js";
import { findEndpointById } from "../repository/endpointRepository.js";
import createHttpError from "../utils/createHttpError.js";
import DELIVERY_MESSAGES from "../utils/deliveryMessages.js";
import isRetryable from "../utils/isRetryable.js";
import parseDeliveryId from "../utils/parseDeliveryId.js";
import sendWebhook from "./webhookService.js";

const MAX_ATTEMPTS = 8;

async function retryOneDelivery(delivery) {
    const deliveryId = delivery.id;
    const endpoint = await findEndpointById(delivery.endpoint_id);

    const event = {
        endpointId: delivery.endpoint_id,
        type: delivery.event_type,
        data: delivery.payload
    };

    const { status, httpStatus, blocked } = await sendWebhook(endpoint.url, event);

    await updateDeliveryAfterRetry(deliveryId, status, httpStatus);

    if (status === "SUCCESS") {
        return { deliveryId, status, httpStatus, message: DELIVERY_MESSAGES.delivered };
    }

    // No banco, a entrega continua FAILED. PERMANENT_FAILURE só avisa o Worker de que acabou.
    if (blocked) {
        return { deliveryId, status: "PERMANENT_FAILURE", httpStatus, message: DELIVERY_MESSAGES.blocked };
    }

    if (!isRetryable(httpStatus)) {
        return { deliveryId, status: "PERMANENT_FAILURE", httpStatus, message: DELIVERY_MESSAGES.permanentFailure };
    }

    return { deliveryId, status, httpStatus, message: "A entrega falhou e pode ser tentada novamente" };
}

async function retryDeliveryById(id) {
    const deliveryId = parseDeliveryId(id);
    const delivery = await findDeliveryById(deliveryId);

    if (!delivery) throw createHttpError(404, "Entrega não encontrada");

    const httpStatus = delivery.http_status;

    if (delivery.status === "SUCCESS") {
        return { deliveryId, status: "ALREADY_DELIVERED", httpStatus, message: "Evento já entregue anteriormente" };
    }

    if (delivery.attempts >= MAX_ATTEMPTS) {
        return { deliveryId, status: "MAX_RETRIES_REACHED", httpStatus, message: "Limite de tentativas atingido" };
    }

    // A fila pode repetir mensagens: um erro definitivo já registrado não gera novo envio.
    if (!isRetryable(httpStatus)) {
        return { deliveryId, status: "PERMANENT_FAILURE", httpStatus, message: DELIVERY_MESSAGES.permanentFailure };
    }

    return retryOneDelivery(delivery);
}

export default retryDeliveryById;
