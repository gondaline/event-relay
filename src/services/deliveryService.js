import { findDeliveryById } from "../repository/deliveryRepository.js";
import createHttpError from "../utils/createHttpError.js";

async function getDeliveryByIdService(id) {

    const deliveryId = Number(id);

    if (!Number.isInteger(deliveryId)) throw createHttpError(400, "O campo ID deve ser um número inteiro");
    if (deliveryId <= 0) throw createHttpError(400, "O campo ID deve ser um número positivo");
    if (deliveryId > 2147483647) throw createHttpError(400, "O campo ID deve ser menor ou igual a 2147483647");

    const delivery = await findDeliveryById(deliveryId);

    if (!delivery) throw createHttpError(404, "Entrega não encontrada");

    return delivery;
}

export default getDeliveryByIdService;