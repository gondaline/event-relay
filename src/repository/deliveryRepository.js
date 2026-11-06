import pool from "../config/database.js";

async function createDelivery(delivery) {
    const result = await pool.query(`
        INSERT INTO deliveries (endpoint_id, event_type, payload, status, http_status) 
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [delivery.endpoint_id, delivery.event_type, delivery.payload, delivery.status, delivery.http_status])

    return result.rows[0];
}

async function updateDeliveryAfterRetry(id, status, httpStatus) {
    const result = await pool.query("UPDATE deliveries SET attempts = attempts + 1, status = $1, http_status = $2 WHERE id = $3 RETURNING *", [status, httpStatus, id]);
    return result.rowCount;
}

async function findDeliveryById(id) {
    const result = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id])
    return result.rows[0];
}

export { createDelivery, updateDeliveryAfterRetry, findDeliveryById };