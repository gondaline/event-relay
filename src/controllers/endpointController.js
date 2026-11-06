import registerEndpoint from "../services/endpointService.js";

async function createEndpoint(req, res) {

    try {
        const { name, url } = req.body ?? {};
        const endpoint = await registerEndpoint(name, url);

        return res.status(201).json(endpoint);
    } catch (error) {
        if (!error.status) console.error("Erro ao cadastrar endpoint:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default createEndpoint;