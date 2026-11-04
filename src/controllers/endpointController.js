import registerEndpoint from "../services/endpointService.js";

async function createEndpoint(req, res) {

    try {
        const { name, url } = req.body ?? {};
        const response = await registerEndpoint(name, url)

        res.status(201).json(response)
    } catch (error) {
        console.error("Erro ao cadastrar endpoint:", error);

        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Erro interno do servidor"
        });
    }
}

export default createEndpoint;