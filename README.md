# Carroça Já

App (PWA) para conectar quem precisa de um carroceiro a quem presta esse serviço em Vitória da Conquista — por bairro, com contato direto no WhatsApp/telefone e avaliações.

## Estrutura

```
index.html          app completo (frontend), abre direto no navegador
manifest.json        manifest da PWA (nome, ícones, cores)
sw.js                 service worker (funciona offline, cache dos arquivos)
icons/                ícones da PWA (192px e 512px)
apps-script/Code.gs   backend — cole no Google Apps Script
docs/SCHEMA.md        estrutura da planilha Google Sheets (colunas, abas)
_versoes/             versões antigas, mantidas como histórico
```

Sem build, sem npm. É só abrir `index.html`.

## Git

Tentei inicializar o git direto por aqui, mas a pasta `Desktop/IARA` no seu computador está montada nesta sessão em modo "não pode apagar/renomear depois de escrito" — e o git precisa apagar arquivos de lock o tempo todo pra funcionar (trava em `.git/index.lock`). Isso é uma restrição desta sessão do Cowork, não do seu Windows: no seu terminal normal (fora daqui) você tem controle total da pasta.

Pra finalizar o git, abra um terminal (PowerShell) na pasta `Carroça Já` no seu computador e rode:

```powershell
cd "$env:USERPROFILE\Desktop\IARA\Carroça Já"
Remove-Item .git -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .testhidden, testvisible -Recurse -Force -ErrorAction SilentlyContinue
git init
git branch -m main
git add -A
git commit -m "Estrutura inicial: PWA + backend Google Sheets/Apps Script"
```

Todos os arquivos já estão prontos e no lugar certo — falta só esses comandos pra ligar o controle de versão de verdade.

## Rodar localmente

```
python3 -m http.server 8080
# depois abra http://localhost:8080 no navegador do celular (mesma rede Wi-Fi)
```

Ou publique num host estático (GitHub Pages, Netlify, etc.) — funciona igual, sem servidor.

## Como configurar o backend (Google Sheets)

Hoje o app funciona com dados de exemplo (`SEED_CARROCEIROS` dentro do `index.html`), sem precisar de nada configurado. Para ligar na planilha de verdade:

1. **Crie a planilha.** No Google Sheets, crie uma planilha nova com as abas `Carroceiros` e `Avaliacoes`, exatamente como descrito em `docs/SCHEMA.md`. Cadastre alguns carroceiros na aba `Carroceiros`.

2. **Publique o backend.** Na planilha, vá em *Extensões > Apps Script*, apague o conteúdo padrão e cole o conteúdo de `apps-script/Code.gs`. Depois: *Implantar > Nova implantação*, tipo **Aplicativo da web**, executar como **Eu**, acesso **Qualquer pessoa**. Copie a URL gerada (termina em `/exec`).

3. **Ligue o app na planilha.** Abra `index.html`, encontre o bloco `CONFIG` no `<script>` e cole a URL em `SHEETS_URL`:
   ```js
   const CONFIG = {
     SHEETS_URL: 'https://script.google.com/macros/s/SEU_ID_AQUI/exec',
     TOKEN: ''
   };
   ```

4. Pronto — o app passa a carregar os carroceiros direto da planilha, com fallback automático para os dados salvos localmente (`localStorage`) se a conexão cair. Avaliações feitas offline entram numa fila e são reenviadas quando a internet voltar.

## Instalar no celular (PWA)

Com o app aberto no Chrome (Android) ou Safari (iPhone), use a opção "Adicionar à tela inicial" / "Instalar app". Isso cria um ícone que abre em tela cheia, como um app nativo.

## Próximos passos possíveis

- Formulário de auto-cadastro de carroceiro (hoje é manual, direto na planilha).
- Geolocalização para sugerir o bairro automaticamente.
- Publicar como app de loja (iOS/Android) mais adiante, empacotando esta mesma PWA com Capacitor — sem precisar reescrever nada.
