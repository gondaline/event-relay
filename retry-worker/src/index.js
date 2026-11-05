export default {
	async queue(batch, env, ctx) {

		for (const message of batch.messages) {

			const deliveryId = message.body.deliveryId;
			console.log("Worker recebeu deliveryId:", deliveryId);

			try {
				const response = await fetch(`${env.EVENT_RELAY_API_URL}/deliveries/${deliveryId}/retry`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${env.WORKER_AUTH_TOKEN}`
					}
				});
				console.log("Resposta da API:", response.status);

				switch (response.status) {
					case 400:
						console.error({
							deliveryId, status: response.status, message: "Requisição inválida"
						});
						message.ack();
						continue;
					case 401:
						console.error({
							deliveryId, status: response.status, message: "Falha de autenticação com a API"
						});
						message.retry();
						continue;
					case 404:
						console.error({
							deliveryId, status: response.status, message: "Entrega não encontrada no PostgreSQL"
						});
						message.ack();
						continue;
					case 502:
						console.error({
							deliveryId, status: response.status, message: "Falha na entrega do webhook"
						});
						message.retry();
						continue;
				}

				if (!response.ok) {
					message.retry();
					continue;
				}

			} catch (error) {
				console.error("Erro ao enviar eventos", error);
				message.retry();
				continue;
			}
		}
	}
};
