import createHttpError from "./createHttpError.js";

function parseDeliveryId(id) {
    // Só dígitos: Number() sozinho aceitaria textos como "1e3" (1000) e "0x10" (16).
    if (!/^-?\d+$/.test(id)) throw createHttpError(400, "O campo ID deve ser um número inteiro");

    const deliveryId = Number(id);

    if (deliveryId <= 0) throw createHttpError(400, "O campo ID deve ser um número positivo");
    if (deliveryId > 2147483647) throw createHttpError(400, "O campo ID deve ser menor ou igual a 2147483647");

    return deliveryId;
}

export default parseDeliveryId;
