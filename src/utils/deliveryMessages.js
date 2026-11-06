// Mensagens usadas tanto em POST /events quanto na rota de retry.
const DELIVERY_MESSAGES = {
    delivered: "Evento entregue com sucesso",
    blocked: "A URL do endpoint aponta para um endereço não permitido, e o evento não foi enviado",
    permanentFailure: "O destino não aceitou o evento, e esse resultado não permite nova tentativa"
};

export default DELIVERY_MESSAGES;
