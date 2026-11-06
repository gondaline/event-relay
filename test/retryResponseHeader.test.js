import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import express from "express";

import pool from "../src/config/database.js";
import { errorHandler, notFoundHandler } from "../src/middlewares/errorHandler.js";
import workerAuth from "../src/middlewares/workerAuth.js";
import deliveriesRoutes from "../src/routes/deliveriesRoutes.js";

const HEADER = "x-eventrelay-retry-handled";
const realFetch = globalThis.fetch;

describe("Cabeçalho que identifica a rota de retry", () => {
    let server;
    let baseUrl;
    let delivery;
    let destinationStatus;

    // Mesma ordem de src/app.js, sem o banco e sem chamar um destino de verdade.
    before(async () => {
        const app = express();
        app.use(workerAuth);
        app.use(express.json());
        app.use("/deliveries", deliveriesRoutes);
        app.use(notFoundHandler);
        app.use(errorHandler);

        await new Promise((resolve) => {
            server = app.listen(0, "127.0.0.1", resolve);
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => {
        server.closeAllConnections();
        server.close();
    });

    beforeEach(() => {
        process.env.WORKER_AUTH_TOKEN = "fake-token";
        process.env.ALLOW_PRIVATE_URLS = "true";
        delete process.env.NODE_ENV;

        delivery = { id: 7, endpoint_id: 2, event_type: "t", payload: {}, status: "FAILED", http_status: 500, attempts: 1 };
        destinationStatus = 500;

        mock.method(pool, "query", async (sql) => {
            if (sql.includes("FROM endpoints")) return { rows: [{ id: 2, url: "http://destino.test/hook" }] };
            if (sql.includes("UPDATE deliveries")) return { rows: [], rowCount: 1 };
            return { rows: delivery ? [delivery] : [] };
        });
        mock.method(globalThis, "fetch", async (url, options) => (
            url.startsWith(baseUrl) ? realFetch(url, options) : new Response(null, { status: destinationStatus })
        ));
        mock.method(console, "error", () => {});
    });

    afterEach(() => {
        mock.restoreAll();
    });

    async function request(method, path, token = "fake-token") {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(`${baseUrl}${path}`, { method, headers });
        return { status: response.status, header: response.headers.get(HEADER) };
    }

    it("está presente quando o webhook é entregue (200)", async () => {
        destinationStatus = 200;
        assert.deepEqual(await request("POST", "/deliveries/7/retry"), { status: 200, header: "true" });
    });

    it("está presente em um erro definitivo do destino (200)", async () => {
        destinationStatus = 404;
        assert.deepEqual(await request("POST", "/deliveries/7/retry"), { status: 200, header: "true" });
    });

    it("está presente em uma falha temporária do destino (502)", async () => {
        assert.deepEqual(await request("POST", "/deliveries/7/retry"), { status: 502, header: "true" });
    });

    it("está presente com um ID inválido (400)", async () => {
        assert.deepEqual(await request("POST", "/deliveries/abc/retry"), { status: 400, header: "true" });
    });

    it("está presente quando a entrega não existe (404)", async () => {
        delivery = null;
        assert.deepEqual(await request("POST", "/deliveries/7/retry"), { status: 404, header: "true" });
    });

    it("está presente em um erro inesperado da rota (500)", async () => {
        pool.query.mock.mockImplementation(async () => {
            throw new Error("Falha no banco");
        });
        assert.deepEqual(await request("POST", "/deliveries/7/retry"), { status: 500, header: "true" });
    });

    it("não está presente em um caminho que não existe (404)", async () => {
        assert.deepEqual(await request("POST", "/api/deliveries/7/retry"), { status: 404, header: null });
    });

    it("não está presente quando o token é recusado (401)", async () => {
        assert.deepEqual(await request("POST", "/deliveries/7/retry", "errado"), { status: 401, header: null });
    });

    it("não está presente na consulta de entregas (GET)", async () => {
        assert.deepEqual(await request("GET", "/deliveries/7"), { status: 200, header: null });
    });
});
