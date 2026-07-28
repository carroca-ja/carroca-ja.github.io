# Schema — Planilha Google Sheets (backend do Carroça Já)

Mesmo padrão do IARA_BCS: Google Sheets como banco de dados, acessado via Google Apps Script Web App, comunicação por JSONP (evita problemas de CORS, funciona em qualquer navegador de celular).

Crie uma planilha nova no Google Sheets com duas abas, exatamente com estes nomes e colunas (linha 1 = cabeçalho):

## Aba `Carroceiros`

Colunas públicas (aparecem no app) e colunas de verificação (ficam só na planilha, nunca são devolvidas pela API — ver `listarCarroceiros()` no `Code.gs`).

**Públicas:**

| Coluna | Tipo | Exemplo | Observação |
|---|---|---|---|
| ID | número | 1 | único, sequencial |
| Nome | texto | Zé Raimundo | nome/apelido exibido no app |
| Servico | texto | Coleta de entulho e mudanças pequenas | |
| Areas | texto | Nova Cidade, Candeias | bairros separados por vírgula |
| Telefone | texto | 5577988013134 | formato internacional, só dígitos (DDI+DDD+número) |
| Online | texto | TRUE ou FALSE | disponibilidade atual — editável manualmente na planilha |
| Tempo | texto | 8 anos de atuação | |
| DataCadastro | data | 27/07/2026 | preenchida automaticamente ao cadastrar |
| FotoUrl | texto (URL) | | link do arquivo no Drive, foto do carroceiro |

**De verificação (cadastro e aprovação manual):**

| Coluna | Tipo | Exemplo | Observação |
|---|---|---|---|
| Status | texto | Pendente / Aprovado / Rejeitado | controla se aparece no app — trocar manualmente na planilha após conferir os documentos |
| NomeCompleto | texto | José Raimundo da Silva | nome legal, para o CPF |
| CPF | texto | 12345678900 | só dígitos |
| Endereco | texto | Rua X, nº, bairro | |
| NumeroCadastroPrefeitura | texto | | número de cadastro do carroceiro na prefeitura |
| NumeroCarrocaLegal | texto | | opcional — nº de registro no programa municipal Carroça Legal, se tiver |
| ComprovanteResidenciaUrl | texto (URL) | | link do arquivo no Drive |
| ComprovantePrefeituraUrl | texto (URL) | | link do arquivo no Drive |
| FotoAnimalUrl | texto (URL) | | opcional |
| ComprovanteVacinacaoUrl | texto (URL) | | opcional |
| TermosAceitos | texto | animais,descarte,veracidade,lgpd em 2026-07-27T... | registro de que os 4 termos foram aceitos, com data/hora |

Se a planilha já existia antes dessas colunas, rode a função `migrarColunas()` uma vez no editor do Apps Script — ela adiciona só o que está faltando, sem apagar nada.

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

- **Leitura (`action=list`)**: o app faz uma chamada JSONP `GET` ao Apps Script, que lê as duas abas, monta a lista de carroceiros já com as avaliações aninhadas (só os com `Status` diferente de `Pendente`/`Rejeitado`), e devolve como JSON envolvido no callback.
- **Avaliar (`action=avaliar`)**: o app faz uma chamada JSONP `GET` com os parâmetros da avaliação (carroceiroId, autor, nota, texto). O Apps Script valida e adiciona uma nova linha na aba `Avaliacoes`.
- **Cadastro (`action=cadastrar`)**: diferente das outras, essa é feita por `POST` com `Content-Type: text/plain` (não GET/JSONP) — as fotos em base64 não cabem numa URL. O Apps Script salva cada foto no Google Drive (pasta `Carroça Já - Cadastros de carroceiros/<id> - <nome>/`, privada, só o dono da planilha acessa) e adiciona uma linha na aba `Carroceiros` com `Status = Pendente`.
- **Aprovação**: manual, direto na planilha. Abra a aba `Carroceiros`, confira os documentos (links do Drive nas colunas de verificação) e troque a coluna `Status` da linha para `Aprovado` (ou `Rejeitado`). Só depois disso o carroceiro passa a aparecer no app.
- O app guarda uma cópia local (`localStorage`) da última lista sincronizada, para funcionar offline / com conexão ruim. Avaliações feitas offline entram numa fila e são reenviadas quando a conexão voltar.
