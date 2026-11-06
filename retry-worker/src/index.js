// Enviado pela rota de retry: confirma que a resposta não veio de um túnel ou servidor intermediário.
// Por isso, no deploy, a API deve ser atualizada antes do Worker (veja docs/deploy.md).
const API_HEADER = "X-EventRelay-Retry-Handled";

const BASE_DELAY_SECONDS = 60;
const MAX_DELAY_SECONDS = 3600;

function getRetryDelay(attempts) {
	return Math.min(BASE_DELAY_SECONDS * 2 ** (attempts - 1), MAX_DELAY_SECONDS);
}

function scheduleRetry(message) {
	message.retry({ delaySeconds: getRetryDelay(message.attempts) });
}

async function processMessage(message, env) {
	const deliveryId = message.body?.deliveryId;

	// Sem um ID válido, nenhuma nova tentativa teria como funcionar.
	if (!Number.isInteger(deliveryId) || deliveryId <= 0) {
		console.error({ messageId: message.id, message: "Mensagem malformada descartada" });
		message.ack();
		return;
	}

	console.log({ deliveryId, queueAttempts: message.attempts, messageId: message.id });

	const response = await fetch(`${env.EVENT_RELAY_API_URL}/deliveries/${deliveryId}/retry`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.WORKER_AUTH_TOKEN}`
		}
	});

	const fromApi = response.headers.get(API_HEADER) === "true";

	// 2xx: entregue, limite atingido ou erro definitivo do destino.
	// 400 e 404: ID inválido ou entrega inexistente, e uma nova tentativa não mudaria isso.
	const isFinished = response.ok || response.status === 400 || response.status === 404;

	if (fromApi && isFinished) {
		console.log({ deliveryId, status: response.status, message: "Processamento encerrado" });
		message.ack();
		return;
	}

	console.error({ deliveryId, status: response.status, fromApi, message: "Nova tentativa agendada" });
	scheduleRetry(message);
}

export default {
	async queue(batch, env, ctx) {
		for (const message of batch.messages) {
			// Um erro nesta mensagem não pode interromper o processamento das demais.
			try {
				await processMessage(message, env);
			} catch (error) {
				console.error("Erro ao processar mensagem:", error);
				scheduleRetry(message);
			}
		}
	}
};
