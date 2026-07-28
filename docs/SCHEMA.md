# Schema — Planilha Google Sheets (backend do Carroça Já)

Mesmo padrão do IARA_BCS: Google Sheets como banco de dados, acessado via Google Apps Script Web App, comunicação por JSONP (evita problemas de CORS, funciona em qualquer navegador de celular).

Crie uma planilha nova no Google Sheets com duas abas, exatamente com estes nomes e colunas (linha 1 = cabeçalho):

## Aba `Carroceiros`

| Coluna | Tipo | Exemplo | Observação |
|---|---|---|---|
| ID | número | 1 | único, sequencial |
| Nome | texto | Zé Raimundo | |
| Servico | texto | Coleta de entulho e mudanças pequenas | |
| Areas | texto | Nova Cidade, Candeias | bairros separados por vírgula |
| Telefone | texto | 5577988013134 | formato internacional, só dígitos (DDI+DDD+número) |
| Online | texto | TRUE ou FALSE | disponibilidade atual — editável manualmente na planilha |
| Tempo | texto | 8 anos de atuação | |
| DataCadastro | data | 27/07/2026 | preenchida automaticamente ao cadastrar |

## Aba `Avaliacoes`

| Coluna | Tipo | Exemplo | Observação |
|---|---|---|---|
| ID | número | 1 | único, sequencial |
| CarroceiroID | número | 1 | referencia a coluna ID da aba Carroceiros |
| Autor | texto | Marta S. | |
| Nota | número | 5 | 1 a 5 |
| Texto | texto | Rápido e cuidadoso... | |
| Data | data/hora | 27/07/2026 14:32 | preenchida automaticamente |

## Fluxo de dados

- **Leitura (`action=list`)**: o app faz uma chamada JSONP `GET` ao Apps Script, que lê as duas abas, monta a lista de carroceiros já com as avaliações aninhadas, e devolve como JSON envolvido no callback.
- **Escrita (`action=avaliar`)**: o app faz uma chamada JSONP `GET` com os parâmetros da avaliação (carroceiroId, autor, nota, texto). O Apps Script valida e adiciona uma nova linha na aba `Avaliacoes`.
- Não existe cadastro de carroceiro pelo app nesta fase — carroceiros são adicionados manualmente na planilha (linha nova na aba `Carroceiros`). Ponto de extensão futuro: formulário de auto-cadastro.
- O app guarda uma cópia local (`localStorage`) da última lista sincronizada, para funcionar offline / com conexão ruim. Avaliações feitas offline entram numa fila e são reenviadas quando a conexão voltar.
