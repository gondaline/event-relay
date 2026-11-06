import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Sem este listener, a queda de uma conexão ociosa (ex.: reinício do PostgreSQL)
// vira um evento "error" não tratado e encerra o processo do Node.
pool.on("error", (error) => {
    console.error("Erro em conexão ociosa do PostgreSQL:", error.message);
});

export default pool;