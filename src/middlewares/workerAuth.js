function workerAuth(req, res, next) {

    if (!process.env.WORKER_AUTH_TOKEN) {
        console.error("WORKER_AUTH_TOKEN não configurado");

        return res.status(500).json({
            message: "Erro interno do servidor"
        });
    }

    const authorization = req.get("Authorization");
    
    if (!authorization) {
        return res.status(401).json({
            message: "Token de autenticação não informado"
        });
    }

    const auth = authorization.split(" ");

    if (auth[0] !== "Bearer") {
        return res.status(401).json({
            message: "Formato de autenticação inválido"
        });
    }

    if (!auth[1]) {
        return res.status(401).json({
            message: "Token não informado"
        });
    }

    if (auth[1] !== process.env.WORKER_AUTH_TOKEN) {
        return res.status(401).json({
            message: "Token inválido"
        });
    }

    next();
}

export default workerAuth;