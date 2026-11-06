import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";

const env = { EVENT_RELAY_API_URL: "https://api.test", WORKER_AUTH_TOKEN: "fake-token" };
const API_HEADERS = { "Content-Type": "application/json", "X-EventRelay-Retry-Handled": "true" };

function apiResponse(status, body = {}) {
	return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}

function unknownResponse(status) {
	return new Response("<html>Página de outro servidor</html>", { status, headers: { "Content-Type": "text/html" } });
}

async function runQueue(messages) {
	const batch = createMessageBatch(
		"event-relay-retries",
		messages.map((message, index) => ({ id: `m${index}`, timestamp: new Date(1000), attempts: 1, ...message }))
	);
	const ctx = createExecutionContext();

	// getQueueResult() não informa o delaySeconds, então a chamada de retry() é observada aqui.
	const retrySpies = batch.messages.map((message) => vi.spyOn(message, "retry"));

	await worker.queue(batch, env, ctx);

	const result = await getQueueResult(batch, ctx);
	return { ...result, retryOptions: retrySpies.flatMap((spy) => spy.mock.calls.map(([options]) => options)) };
}

function retriedIds(result) {
	return result.retryMessages.map((retry) => retry.msgId);
}

describe("retry-worker", () => {
	let fetchMock;
	let logSpy;
	let errorSpy;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	describe("sucesso", () => {
		for (const status of ["SUCCESS", "ALREADY_DELIVERED", "MAX_RETRIES_REACHED", "PERMANENT_FAILURE"]) {
			it(`confirma a mensagem quando a API responde 200 com ${status}`, async () => {
				fetchMock.mockResolvedValue(apiResponse(200, { status }));

				const result = await runQueue([{ body: { deliveryId: 7 } }]);

				expect(result.explicitAcks).toStrictEqual(["m0"]);
				expect(result.retryMessages).toStrictEqual([]);
			});
		}

		it("chama a rota de retry com o token do Worker", async () => {
			fetchMock.mockResolvedValue(apiResponse(200));

			await runQueue([{ body: { deliveryId: 7 } }]);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.test/deliveries/7/retry");
			expect(options.method).toBe("POST");
			expect(options.headers.Authorization).toBe("Bearer fake-token");
		});
	});

	describe("falha temporária", () => {
		for (const status of [500, 502, 503]) {
			it(`pede nova tentativa quando a API responde ${status}`, async () => {
				fetchMock.mockResolvedValue(apiResponse(status));

				const result = await runQueue([{ body: { deliveryId: 7 } }]);

				expect(result.explicitAcks).toStrictEqual([]);
				expect(retriedIds(result)).toStrictEqual(["m0"]);
			});
		}

		it("pede nova tentativa quando o token é recusado", async () => {
			fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Token inválido" }), { status: 401 }));

			const result = await runQueue([{ body: { deliveryId: 7 } }]);

			expect(result.explicitAcks).toStrictEqual([]);
			expect(retriedIds(result)).toStrictEqual(["m0"]);
		});
	});

	describe("erro definitivo da API", () => {
		for (const status of [400, 404]) {
			it(`confirma a mensagem quando a API responde ${status}`, async () => {
				fetchMock.mockResolvedValue(apiResponse(status, { message: "Erro definitivo" }));

				const result = await runQueue([{ body: { deliveryId: 7 } }]);

				expect(result.explicitAcks).toStrictEqual(["m0"]);
				expect(result.retryMessages).toStrictEqual([]);
			});
		}
	});

	describe("resposta de servidor desconhecido", () => {
		for (const status of [200, 400, 404, 502, 530]) {
			it(`não descarta a mensagem com ${status} sem o cabeçalho da API`, async () => {
				fetchMock.mockResolvedValue(unknownResponse(status));

				const result = await runQueue([{ body: { deliveryId: 7 } }]);

				expect(result.explicitAcks).toStrictEqual([]);
				expect(retriedIds(result)).toStrictEqual(["m0"]);
			});
		}

		it("não descarta a mensagem com um 404 em JSON sem o cabeçalho", async () => {
			fetchMock.mockResolvedValue(Response.json({ message: "Rota não encontrada" }, { status: 404 }));

			const result = await runQueue([{ body: { deliveryId: 7 } }]);

			expect(result.explicitAcks).toStrictEqual([]);
			expect(retriedIds(result)).toStrictEqual(["m0"]);
		});

		it("não descarta a mensagem quando o cabeçalho tem outro valor", async () => {
			fetchMock.mockResolvedValue(new Response("{}", { status: 404, headers: { "X-EventRelay-Retry-Handled": "false" } }));

			const result = await runQueue([{ body: { deliveryId: 7 } }]);

			expect(result.explicitAcks).toStrictEqual([]);
			expect(retriedIds(result)).toStrictEqual(["m0"]);
		});
	});

	describe("falha de rede", () => {
		it("pede nova tentativa sem interromper o handler", async () => {
			fetchMock.mockRejectedValue(new TypeError("Network connection lost"));

			const result = await runQueue([{ body: { deliveryId: 7 } }]);

			expect(result.explicitAcks).toStrictEqual([]);
			expect(retriedIds(result)).toStrictEqual(["m0"]);
		});
	});

	describe("mensagem malformada", () => {
		const bodies = [
			["corpo nulo", null],
			["corpo de texto", "texto"],
			["sem deliveryId", {}],
			["deliveryId de texto", { deliveryId: "7" }],
			["deliveryId zero", { deliveryId: 0 }],
			["deliveryId negativo", { deliveryId: -1 }],
			["deliveryId decimal", { deliveryId: 1.5 }]
		];

		for (const [label, body] of bodies) {
			it(`descarta ${label} sem chamar a API`, async () => {
				const result = await runQueue([{ body }]);

				expect(result.explicitAcks).toStrictEqual(["m0"]);
				expect(result.retryMessages).toStrictEqual([]);
				expect(fetchMock).not.toHaveBeenCalled();
			});
		}
	});

	describe("várias mensagens no mesmo lote", () => {
		it("trata cada mensagem de forma independente", async () => {
			fetchMock
				.mockResolvedValueOnce(apiResponse(200))
				.mockResolvedValueOnce(apiResponse(502))
				.mockRejectedValueOnce(new TypeError("Network connection lost"))
				.mockResolvedValueOnce(unknownResponse(404))
				.mockResolvedValueOnce(apiResponse(404));

			const result = await runQueue([
				{ body: { deliveryId: 1 } },
				{ body: null },
				{ body: { deliveryId: 2 } },
				{ body: { deliveryId: 3 } },
				{ body: { deliveryId: 4 } },
				{ body: { deliveryId: 5 } }
			]);

			expect(result.explicitAcks).toStrictEqual(["m0", "m1", "m5"]);
			expect(retriedIds(result)).toStrictEqual(["m2", "m3", "m4"]);
			expect(fetchMock).toHaveBeenCalledTimes(5);
		});
	});

	describe("intervalo entre tentativas", () => {
		const delays = [
			[1, 60],
			[2, 120],
			[3, 240],
			[4, 480],
			[5, 960],
			[6, 1920],
			[7, 3600],
			[8, 3600],
			[11, 3600],
			[50, 3600]
		];

		for (const [attempts, delaySeconds] of delays) {
			it(`na entrega ${attempts}, espera ${delaySeconds} segundos`, async () => {
				fetchMock.mockResolvedValue(apiResponse(502));

				const result = await runQueue([{ body: { deliveryId: 7 }, attempts }]);

				expect(retriedIds(result)).toStrictEqual(["m0"]);
				expect(result.retryOptions).toStrictEqual([{ delaySeconds }]);
			});
		}

		it("usa o mesmo intervalo em falhas de rede", async () => {
			fetchMock.mockRejectedValue(new TypeError("Network connection lost"));

			const result = await runQueue([{ body: { deliveryId: 7 }, attempts: 3 }]);

			expect(retriedIds(result)).toStrictEqual(["m0"]);
			expect(result.retryOptions).toStrictEqual([{ delaySeconds: 240 }]);
		});
	});

	describe("logs", () => {
		it("não registram o token do Worker", async () => {
			fetchMock
				.mockResolvedValueOnce(apiResponse(200))
				.mockResolvedValueOnce(apiResponse(502))
				.mockRejectedValueOnce(new TypeError("Network connection lost"));

			await runQueue([{ body: { deliveryId: 1 } }, { body: { deliveryId: 2 } }, { body: { deliveryId: 3 } }, { body: null }]);

			const logged = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
			expect(logged).toContain("Processamento encerrado");
			expect(logged).toContain("Nova tentativa agendada");
			expect(logged).toContain("Mensagem malformada descartada");
			expect(logged).not.toContain("fake-token");
		});
	});
});
