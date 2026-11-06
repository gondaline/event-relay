import express from "express";
const app = express();
const PORT = 4000;

app.use(express.json());

app.post("/webhook", (req, res) => {
    try {
        console.log("Webhook recebido");
        const { type, data } = req.body;

        console.log(`Tipo: ${type}`);

        console.log("Dados:", data);

        res.status(200).json({ message: "Webhook recebido com sucesso" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao processar o webhook" });
    }
});

app.listen(PORT, (error) => {
    if (error) {
        console.error(`Não foi possível iniciar o servidor de teste na porta ${PORT}:`, error.message);
        process.exit(1);
    }

    console.log(`Servidor de teste rodando na porta ${PORT}`);
});
