import { findDeliveryById } from "../repository/deliveryRepository.js";
import createHttpError from "../utils/createHttpError.js";
import parseDeliveryId from "../utils/parseDeliveryId.js";

async function getDeliveryByIdService(id) {

    const deliveryId = parseDeliveryId(id);

    const delivery = await findDeliveryById(deliveryId);

    if (!delivery) throw createHttpError(404, "Entrega não encontrada");

    return delivery;
}

export default getDeliveryByIdService;