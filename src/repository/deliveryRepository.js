import pool from "../config/database.js";

async function createDelivery(delivery) {
    const response = await pool.query(
        `INSERT INTO deliveries (endpoint_id, event_type, payload, status, http_status) 
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [delivery.endpoint_id, delivery.event_type, delivery.payload, delivery.status, delivery.http_status])

    return response.rows[0];
}

export default createDelivery;