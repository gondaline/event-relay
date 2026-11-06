const BODY_ERROR_MESSAGES = {
    "entity.parse.failed": "O corpo da requisição contém um JSON inválido",
    "entity.too.large": "O corpo da requisição excede o tamanho permitido"
};

function notFoundHandler(req, res) {
    return res.status(404).json({
        message: "Rota não encontrada"
    });
}

// O Express só reconhece um middleware de erro quando ele declara os 4 parâmetros,
// por isso "next" precisa continuar na assinatura.
function errorHandler(error, req, res, next) {

    if (res.headersSent) {
        return next(error);
    }

    if (error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({
            message: BODY_ERROR_MESSAGES[error.type] ?? "Requisição inválida"
        });
    }

    console.error("Erro não tratado:", error);

    return res.status(500).json({
        message: "Erro interno do servidor"
    });
}

export { notFoundHandler, errorHandler };
