import express from "express";
const app = express();
const PORT = 4000;

app.use(express.json());

app.post("/webhook", (req, res) => {

    try {
        console.log("Webhook recebido")
        const { type, data } = req.body

        console.log(`Tipo: ${type}`)

        console.log(`Dados: {
        transactionId: ${data.transactionId},
        amount: ${data.amount}
        }`)

        res.status(200).json({ message: "Webhook recebido com sucesso" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao processar o webhook" });
    }
})

app.listen(PORT, () => {
    console.log(`Servidor de teste rodando na porta ${PORT}`);
});