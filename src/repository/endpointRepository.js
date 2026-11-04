import pool from "../config/database.js"

async function insertEndpoint(name, url) {
    try {
        const result = await pool.query(
            "INSERT INTO endpoints (name, url) VALUES ($1, $2) RETURNING *",
            [name, url])
        return result.rows[0];

    } catch (error) {
        console.log("Erro ao inserir endpoint no banco");
        throw error;
    }
}

async function findEndpointByUrl(url) {
    const result = await pool.query("SELECT * FROM endpoints WHERE url = $1", [url])
    return result.rows[0]
}

async function findEndpointById(id) {
    const result = await pool.query("SELECT * FROM endpoints WHERE id = $1", [id])
    return result.rows[0]
}

export { insertEndpoint, findEndpointByUrl, findEndpointById };