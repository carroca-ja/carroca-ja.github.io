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
 */

var TOKEN = ''; // opcional: defina uma senha simples aqui e no app (CONFIG.TOKEN) para dificultar spam

var SHEET_CARROCEIROS = 'Carroceiros';
var SHEET_AVALIACOES = 'Avaliacoes';

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
    carroceiros.appendRow(['ID', 'Nome', 'Servico', 'Areas', 'Telefone', 'Online', 'Tempo', 'DataCadastro']);
    carroceiros.appendRow([1, 'Zé Raimundo', 'Coleta de entulho e mudanças pequenas', 'Nova Cidade, Candeias', '5577988013134', 'TRUE', '8 anos de atuação', new Date()]);
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

function listarCarroceiros() {
  var carroceirosRaw = sheetToObjects(getSheet(SHEET_CARROCEIROS));
  var avaliacoesRaw = sheetToObjects(getSheet(SHEET_AVALIACOES));

  return carroceirosRaw.map(function (c) {
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
