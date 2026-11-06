import { findDeliveryById } from "../repository/deliveryRepository.js";
import createHttpError from "../utils/createHttpError.js";
import parseDeliveryId from "../utils/parseDeliveryId.js";

async function getDeliveryByIdService(id) {

    const deliveryId = parseDeliveryId(id);

    const delivery = await findDeliveryById(deliveryId);

    if (!delivery) throw createHttpError(404, "Entrega não encontrada");

    // Os nomes do banco ficam aqui: a API usa os mesmos campos das outras rotas.
    return {
        deliveryId: delivery.id,
        endpointId: delivery.endpoint_id,
        type: delivery.event_type,
        data: delivery.payload,
        status: delivery.status,
        httpStatus: delivery.http_status,
        attempts: delivery.attempts,
        createdAt: delivery.created_at
    };
}

export default getDeliveryByIdService;