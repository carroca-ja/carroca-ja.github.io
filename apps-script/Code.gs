/**
 * Carroça Já — backend em Google Apps Script.
 * Lê/escreve na planilha do Google Sheets (ver docs/SCHEMA.md).
 *
 * Como publicar:
 * 1. No Google Sheets, abra Extensões > Apps Script.
 * 2. Apague o conteúdo padrão e cole este arquivo inteiro.
 * 3. Ajuste TOKEN abaixo (opcional, mas recomendado).
 * 4. Implantar > Nova implantação > tipo "Aplicativo da web".
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL gerada (termina em /exec) e cole em CONFIG.SHEETS_URL no index.html.
 *
 * Atualização (cadastro de carroceiro):
 * 6. Se a planilha já existia antes desta versão, rode a função "migrarColunas"
 *    uma vez (menu ao lado do botão Executar) para adicionar as novas colunas
 *    na aba Carroceiros sem apagar nada que já existe.
 * 7. Depois de colar este código, é preciso REIMPLANTAR: Implantar > Gerenciar
 *    implantações > editar (ícone de lápis) > Nova versão > Implantar. A URL
 *    /exec continua a mesma, só o código por trás dela muda.
 *
 * Área do administrador (aprovar/rejeitar cadastros):
 * 8. Como o Apps Script não deixa passar parâmetro pela interface "Executar",
 *    defina a senha assim: na função "definirSenhaAdmin" lá embaixo, troque
 *    temporariamente a primeira linha por senha = "SUA_SENHA_AQUI"; (com sua
 *    senha de verdade), salve, selecione "definirSenhaAdmin" no menu ao lado
 *    do botão Executar, clique em Executar (autorize se pedir), confira no
 *    Logger que apareceu "Senha de administrador definida com sucesso" —
 *    depois DESFAÇA essa troca (Ctrl+Z ou apague a linha) e salve nesse
 *    estado original, já que a senha fica guardada nas Propriedades do
 *    Script, não precisa mais ficar no código. Repita esse passo só se quiser
 *    trocar a senha no futuro.
 */

var TOKEN = ''; // opcional: defina uma senha simples aqui e no app (CONFIG.TOKEN) para dificultar spam

// Sessão do administrador (aprovar/rejeitar cadastros). 21600s = 6h, o máximo
// permitido pelo CacheService — depois disso a área do administrador pede
// senha de novo. A senha em si NUNCA fica no código: rode definirSenhaAdmin()
// uma vez no editor do Apps Script (ver função abaixo).
var ADMIN_SESSION_SECONDS = 21600;

var SHEET_CARROCEIROS = 'Carroceiros';
var SHEET_AVALIACOES = 'Avaliacoes';

// Ordem "canônica" de colunas da aba Carroceiros. appendRowByHeaders() sempre
// escreve respeitando a ordem REAL das colunas na planilha (não esta lista),
// então é seguro adicionar itens aqui no futuro e rodar migrarColunas() de novo.
var CARROCEIRO_HEADERS = [
  'ID', 'Nome', 'Servico', 'Areas', 'Telefone', 'Online', 'Tempo', 'DataCadastro',
  'Status', 'FotoUrl', 'NomeCompleto', 'CPF', 'Endereco',
  'NumeroCadastroPrefeitura', 'NumeroCarrocaLegal',
  'ComprovanteResidenciaUrl', 'ComprovantePrefeituraUrl',
  'FotoAnimalUrl', 'ComprovanteVacinacaoUrl', 'TermosAceitos'
];

/**
 * Execute esta função uma vez, manualmente, para criar as abas e cabeçalhos
 * na planilha (se ainda não existirem). No editor do Apps Script: escolha
 * "setup" no menu ao lado do botão Executar, clique em Executar, autorize
 * o script quando pedir. Pode rodar de novo sem problema — não apaga dados
 * já existentes.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var carroceiros = ss.getSheetByName(SHEET_CARROCEIROS);
  if (!carroceiros) {
    carroceiros = ss.insertSheet(SHEET_CARROCEIROS);
    carroceiros.appendRow(CARROCEIRO_HEADERS);
    carroceiros.appendRow([
      1, 'Zé Raimundo', 'Coleta de entulho e mudanças pequenas', 'Nova Cidade, Candeias',
      '5577988013134', 'TRUE', '8 anos de atuação', new Date(),
      'Aprovado', '', '', '', '', '', '', '', '', '', '', ''
    ]);
    carroceiros.setFrozenRows(1);
  }

  var avaliacoes = ss.getSheetByName(SHEET_AVALIACOES);
  if (!avaliacoes) {
    avaliacoes = ss.insertSheet(SHEET_AVALIACOES);
    avaliacoes.appendRow(['ID', 'CarroceiroID', 'Autor', 'Nota', 'Texto', 'Data']);
    avaliacoes.appendRow([1, 1, 'Marta S.', 5, 'Rápido e cuidadoso com os móveis. Recomendo.', new Date()]);
    avaliacoes.setFrozenRows(1);
  }

  // remove a aba padrão "Página1"/"Sheet1" se ela ainda existir vazia
  ['Página1', 'Sheet1'].forEach(function (nome) {
    var s = ss.getSheetByName(nome);
    if (s && s.getLastRow() === 0) ss.deleteSheet(s);
  });

  Logger.log('Setup concluído: abas Carroceiros e Avaliacoes prontas.');
}

/**
 * Rode esta função uma vez (menu ao lado do botão Executar > migrarColunas)
 * se a sua planilha Carroceiros já existia antes das colunas de cadastro
 * (Status, CPF, comprovantes, etc.). Só adiciona o que estiver faltando,
 * no final da linha de cabeçalho — não mexe em nada que já existe.
 */
function migrarColunas() {
  var sheet = getSheet(SHEET_CARROCEIROS);
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var faltando = CARROCEIRO_HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
  if (!faltando.length) {
    Logger.log('Nenhuma coluna faltando — planilha já está atualizada.');
    return;
  }
  sheet.getRange(1, lastCol + 1, 1, faltando.length).setValues([faltando]);
  Logger.log('Colunas adicionadas: ' + faltando.join(', '));
}

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || 'list';
  var result;

  try {
    if (TOKEN && params.token !== TOKEN) {
      result = { success: false, error: 'token inválido' };
    } else if (action === 'list') {
      result = { success: true, carroceiros: listarCarroceiros() };
    } else if (action === 'avaliar') {
      result = avaliar(params);
    } else {
      result = { success: false, error: 'ação desconhecida: ' + action };
    }
  } catch (err) {
    result = { success: false, error: String(err) };
  }

  return respond(result, params.callback);
}

/**
 * POST é usado só pelo cadastro de carroceiro (payload grande demais pra
 * caber numa URL de GET/JSONP, por causa das fotos em base64).
 * O front-end manda Content-Type: text/plain de propósito — isso faz o
 * navegador tratar como "requisição simples" e evita o preflight CORS
 * (OPTIONS) que o Apps Script não sabe responder.
 */
function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    // Ações de administrador têm autenticação própria (senha + token de
    // sessão), separada do TOKEN opcional de anti-spam usado pelo cadastro.
    if (body.action === 'adminLogin') {
      result = verificarSenhaAdmin(body.senha);
    } else if (body.action === 'adminListar') {
      result = tokenAdminValido(body.token)
        ? { success: true, carroceiros: listarCarroceirosAdmin() }
        : { success: false, error: 'sessão expirada, faça login novamente' };
    } else if (body.action === 'adminAtualizarStatus') {
      result = tokenAdminValido(body.token)
        ? atualizarStatusCarroceiro(body.id, body.status)
        : { success: false, error: 'sessão expirada, faça login novamente' };
    } else if (TOKEN && body.token !== TOKEN) {
      result = { success: false, error: 'token inválido' };
    } else if (body.action === 'cadastrar') {
      result = cadastrarCarroceiro(body);
    } else {
      result = { success: false, error: 'ação desconhecida: ' + body.action };
    }
  } catch (err) {
    result = { success: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Rode esta função UMA VEZ, manualmente, no editor do Apps Script (escolha
 * "definirSenhaAdmin" no menu ao lado do botão Executar — vai pedir pra você
 * editar o código temporariamente pra passar a senha, ou rode direto no
 * console de execução com definirSenhaAdmin("suaSenhaAqui")). A senha fica
 * guardada nas Propriedades do Script — nunca aparece no código do site nem
 * no git. Pra trocar a senha depois, é só rodar de novo com o valor novo.
 */
function definirSenhaAdmin(senha) {
  if (!senha) {
    Logger.log('Chame com uma senha, ex: definirSenhaAdmin("minhaSenhaSegura123")');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', senha);
  Logger.log('Senha de administrador definida com sucesso.');
}

function verificarSenhaAdmin(senha) {
  var senhaSalva = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!senhaSalva) {
    return { success: false, error: 'senha de administrador ainda não configurada — rode definirSenhaAdmin("suaSenha") uma vez no editor do Apps Script' };
  }
  if (String(senha || '') !== senhaSalva) {
    return { success: false, error: 'senha incorreta' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('admin_' + token, '1', ADMIN_SESSION_SECONDS);
  return { success: true, token: token };
}

function tokenAdminValido(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('admin_' + token) === '1';
}

// Todos os campos, inclusive CPF/endereço/documentos que a API pública nunca
// devolve — só chega aqui depois de passar por tokenAdminValido().
function listarCarroceirosAdmin() {
  return sheetToObjects(getSheet(SHEET_CARROCEIROS)).map(function (c) {
    return {
      id: c.ID,
      nome: c.Nome,
      servico: c.Servico,
      areas: c.Areas,
      telefone: c.Telefone,
      status: c.Status || 'Aprovado',
      dataCadastro: c.DataCadastro,
      tempo: c.Tempo,
      nomeCompleto: c.NomeCompleto,
      cpf: c.CPF,
      endereco: c.Endereco,
      numeroCadastroPrefeitura: c.NumeroCadastroPrefeitura,
      numeroCarrocaLegal: c.NumeroCarrocaLegal,
      fotoUrl: c.FotoUrl,
      comprovanteResidenciaUrl: c.ComprovanteResidenciaUrl,
      comprovantePrefeituraUrl: c.ComprovantePrefeituraUrl,
      fotoAnimalUrl: c.FotoAnimalUrl,
      comprovanteVacinacaoUrl: c.ComprovanteVacinacaoUrl
    };
  }).sort(function (a, b) { return new Date(b.dataCadastro) - new Date(a.dataCadastro); });
}

function atualizarStatusCarroceiro(id, status) {
  var statusValidos = ['Pendente', 'Aprovado', 'Rejeitado'];
  if (!id) return { success: false, error: 'id obrigatório' };
  if (statusValidos.indexOf(status) === -1) return { success: false, error: 'status inválido' };

  var sheet = getSheet(SHEET_CARROCEIROS);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var colId = headers.indexOf('ID');
  var colStatus = headers.indexOf('Status');
  if (colId === -1 || colStatus === -1) return { success: false, error: 'colunas ID/Status não encontradas' };

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][colId]) === String(id)) {
      sheet.getRange(r + 1, colStatus + 1).setValue(status);
      return { success: true };
    }
  }
  return { success: false, error: 'carroceiro não encontrado' };
}

function respond(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('aba não encontrada: ' + name);
  return sheet;
}

function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = values.slice(1);
  return rows
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

/**
 * Escreve uma linha respeitando a ordem REAL das colunas da planilha
 * (não a ordem de CARROCEIRO_HEADERS) — funciona mesmo se migrarColunas()
 * tiver adicionado colunas novas no final em planilhas antigas.
 */
function appendRowByHeaders(sheet, dataObj) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var row = headers.map(function (h) {
    var v = dataObj[h];
    return (v === undefined || v === null) ? '' : v;
  });
  sheet.appendRow(row);
}

// Só as abas/campos usados publicamente pelo app saem daqui. CPF, endereço,
// comprovantes etc. ficam só na planilha, para revisão manual — nunca são
// devolvidos pela API.
function listarCarroceiros() {
  var carroceirosRaw = sheetToObjects(getSheet(SHEET_CARROCEIROS));
  var avaliacoesRaw = sheetToObjects(getSheet(SHEET_AVALIACOES));

  return carroceirosRaw
    .filter(function (c) { return c.Status !== 'Pendente' && c.Status !== 'Rejeitado'; })
    .map(function (c) {
      var reviews = avaliacoesRaw
        .filter(function (a) { return String(a.CarroceiroID) === String(c.ID); })
        .sort(function (a, b) { return new Date(b.Data) - new Date(a.Data); })
        .map(function (a) {
          return { autor: a.Autor, nota: Number(a.Nota), texto: a.Texto };
        });

      return {
        id: c.ID,
        nome: c.Nome,
        servico: c.Servico,
        areas: String(c.Areas || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        telefone: String(c.Telefone),
        online: String(c.Online).toUpperCase() === 'TRUE',
        tempo: c.Tempo,
        foto: c.FotoUrl || '',
        reviews: reviews
      };
    });
}

function avaliar(params) {
  var carroceiroId = params.carroceiroId;
  var autor = (params.autor || 'Anônimo').toString().slice(0, 60);
  var nota = Number(params.nota);
  var texto = (params.texto || '').toString().slice(0, 500);

  if (!carroceiroId) return { success: false, error: 'carroceiroId obrigatório' };
  if (!(nota >= 1 && nota <= 5)) return { success: false, error: 'nota deve ser de 1 a 5' };

  var sheet = getSheet(SHEET_AVALIACOES);
  var lastRow = sheet.getLastRow();
  var novoId = lastRow; // linha 1 é cabeçalho, então lastRow já é o próximo ID sequencial válido

  sheet.appendRow([novoId, carroceiroId, autor, nota, texto, new Date()]);

  return { success: true, id: novoId };
}

/**
 * Cadastro de novo carroceiro, feito pelo próprio app. Entra sempre como
 * "Pendente" — só aparece pra quem busca no app depois que alguém abrir a
 * planilha, conferir os documentos na pasta do Drive e trocar a coluna
 * Status pra "Aprovado" (ou "Rejeitado", se não bater).
 */
function cadastrarCarroceiro(data) {
  data = data || {};

  var obrigatorios = ['nome', 'nomeCompleto', 'cpf', 'telefone', 'endereco', 'servico', 'areas', 'numeroCadastroPrefeitura'];
  for (var i = 0; i < obrigatorios.length; i++) {
    var campo = obrigatorios[i];
    var valor = data[campo];
    var vazio = valor === undefined || valor === null || String(valor).trim() === '' ||
      (Array.isArray(valor) && valor.length === 0);
    if (vazio) return { success: false, error: 'campo obrigatório faltando: ' + campo };
  }

  var cpfDigits = String(data.cpf).replace(/\D/g, '');
  if (cpfDigits.length !== 11) return { success: false, error: 'CPF inválido' };

  if (!data.termoAnimais || !data.termoDescarte || !data.termoVeracidade || !data.termoLgpd) {
    return { success: false, error: 'é preciso aceitar todos os termos' };
  }

  var sheet = getSheet(SHEET_CARROCEIROS);
  var novoId = sheet.getLastRow(); // ver comentário equivalente em avaliar()
  var pasta = pastaCadastro(novoId, data.nome);

  var fotoUrl = salvarFotoBase64(data.fotoCarroceiro, pasta, 'foto-carroceiro');
  var comprovanteResidenciaUrl = salvarFotoBase64(data.comprovanteResidencia, pasta, 'comprovante-residencia');
  var comprovantePrefeituraUrl = salvarFotoBase64(data.comprovantePrefeitura, pasta, 'comprovante-prefeitura');
  var fotoAnimalUrl = salvarFotoBase64(data.fotoAnimal, pasta, 'foto-animal');
  var comprovanteVacinacaoUrl = salvarFotoBase64(data.comprovanteVacinacao, pasta, 'comprovante-vacinacao');

  if (!comprovanteResidenciaUrl || !comprovantePrefeituraUrl) {
    return { success: false, error: 'comprovante de residência e comprovante de cadastro na prefeitura são obrigatórios' };
  }

  appendRowByHeaders(sheet, {
    ID: novoId,
    Nome: String(data.nome).trim().slice(0, 80),
    Servico: String(data.servico).trim().slice(0, 200),
    Areas: Array.isArray(data.areas) ? data.areas.join(', ') : String(data.areas || ''),
    Telefone: String(data.telefone).replace(/\D/g, ''),
    Online: 'TRUE',
    Tempo: String(data.tempo || '').trim().slice(0, 100),
    DataCadastro: new Date(),
    Status: 'Pendente',
    FotoUrl: fotoUrl || '',
    NomeCompleto: String(data.nomeCompleto).trim().slice(0, 120),
    CPF: cpfDigits,
    Endereco: String(data.endereco).trim().slice(0, 300),
    NumeroCadastroPrefeitura: String(data.numeroCadastroPrefeitura).trim().slice(0, 60),
    NumeroCarrocaLegal: String(data.numeroCarrocaLegal || '').trim().slice(0, 60),
    ComprovanteResidenciaUrl: comprovanteResidenciaUrl,
    ComprovantePrefeituraUrl: comprovantePrefeituraUrl,
    FotoAnimalUrl: fotoAnimalUrl || '',
    ComprovanteVacinacaoUrl: comprovanteVacinacaoUrl || '',
    TermosAceitos: 'animais,descarte,veracidade,lgpd em ' + new Date().toISOString()
  });

  return { success: true, id: novoId, message: 'Cadastro recebido! Vamos analisar seus documentos.' };
}

function pastaCadastro(id, nome) {
  var raizNome = 'Carroça Já - Cadastros de carroceiros';
  var raizIt = DriveApp.getFoldersByName(raizNome);
  var raiz = raizIt.hasNext() ? raizIt.next() : DriveApp.createFolder(raizNome);
  var nomePasta = id + ' - ' + String(nome || 'sem-nome').trim();
  var existentesIt = raiz.getFoldersByName(nomePasta);
  return existentesIt.hasNext() ? existentesIt.next() : raiz.createFolder(nomePasta);
}

function salvarFotoBase64(dataUrl, pasta, nomeArquivo) {
  if (!dataUrl) return '';
  try {
    var match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) return '';
    var mime = match[1];
    var base64 = match[2];
    var ext = mime.indexOf('png') !== -1 ? '.png' : '.jpg';
    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mime, nomeArquivo + ext);
    var file = pasta.createFile(blob);
    return file.getUrl();
  } catch (err) {
    Logger.log('Falha ao salvar imagem ' + nomeArquivo + ': ' + err);
    return '';
  }
}
