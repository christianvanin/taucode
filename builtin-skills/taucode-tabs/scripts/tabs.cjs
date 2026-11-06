#!/usr/bin/env node
/**
 * CLI Helper deterministico per la gestione delle tab e del terminale in TauCode IDE.
 * Comunica direttamente con il server proxy locale di TauCode (porta 8085).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PROXY_PORT = 8085;
const BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;

function httpRequest(method, urlPath, body = null, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ ok: res.statusCode < 400, raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout richiesta a TauCode (${timeoutMs}ms)`));
    });

    req.on('error', (err) => {
      reject(new Error(`Impossibile contattare TauCode su ${BASE_URL}: ${err.message}`));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command) {
    case 'types': {
      console.log(`
Tipi di Tab supportati in TauCode IDE:
  - preview     : Anteprima web o file HTML locale (param: url, title)
  - editor      : Editor Monaco per codice sorgente (param: path, line)
  - terminal    : Terminale integrato (param: cwd, command, title, autoClose, interactive)
  - markdown    : Visualizzatore ed editor Markdown live (param: path, title)
  - svg         : Visualizzatore SVG con zoom e griglia trasparente (param: path)
  - blockbench  : Visualizzatore 3D modelli .bbmodel, .gltf, .obj (param: path, title)
  - settings    : Pannello Impostazioni TauCode (param: section: "general"|"ai"|"lsp"|...)
  - extension   : Tab estensione o plugin custom (param: extensionId, tabContributionId)
`);
      break;
    }

    case 'list': {
      try {
        const res = await httpRequest('GET', '/api/tabs');
        if (!res.ok) {
          console.error('Errore durante la lettura delle tab:', res.error || res);
          process.exit(1);
        }
        const tabs = res.tabs || [];
        console.log(`Tab aperti (${tabs.length}) [Attivo: ID ${res.activeId}]:`);
        console.log('ID\tTIPO\t\tATTIVO\tTITOLO / DETTAGLI');
        console.log('------------------------------------------------------------');
        for (const t of tabs) {
          const star = t.active ? '★ SI' : '  no';
          const extra = t.path || t.url || t.cwd || '';
          console.log(`${t.id}\t${(t.kind || 'workspace').padEnd(12)}\t${star}\t${t.title || 'Senza titolo'} ${extra ? `(${extra})` : ''}`);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'open': {
      const kind = args[1];
      if (!kind) {
        console.error('Specifica il tipo di tab da aprire. Es: open preview "http://localhost:5173" o open editor "src/main.tsx"');
        process.exit(1);
      }
      const target = args[2] || '';
      const payload = { kind };

      // Parsing argomenti opzionali
      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--title' && args[i + 1]) payload.title = args[++i];
        else if (args[i] === '--line' && args[i + 1]) payload.line = parseInt(args[++i], 10);
        else if (args[i] === '--cwd' && args[i + 1]) payload.cwd = args[++i];
        else if (args[i] === '--cmd' && args[i + 1]) payload.command = args[++i];
        else if (args[i] === '--section' && args[i + 1]) payload.section = args[++i];
      }

      if (kind === 'preview') {
        payload.url = target || 'http://localhost:5173';
      } else if (kind === 'editor' || kind === 'markdown' || kind === 'svg' || kind === 'blockbench') {
        payload.path = target;
      } else if (kind === 'terminal') {
        if (target && !payload.command) payload.command = target;
      } else if (kind === 'settings') {
        payload.section = target || payload.section || 'general';
      }

      try {
        const res = await httpRequest('POST', '/api/tabs/open', payload);
        if (res.ok) {
          console.log(`Tab aperto con successo! ID: ${res.tabId}, Tipo: ${res.kind || kind}`);
        } else {
          console.error('Errore apertura tab:', res.error || res);
          process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'focus': {
      const tabId = parseInt(args[1], 10);
      if (isNaN(tabId)) {
        console.error('Specificare un ID tab valido. Es: focus 2');
        process.exit(1);
      }
      try {
        const res = await httpRequest('POST', '/api/tabs/focus', { tabId });
        if (res.ok) {
          console.log(`Focus portato sul tab ${tabId}.`);
        } else {
          console.error('Errore focus tab:', res.error || res);
          process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'close': {
      const target = args[1];
      const payload = {};
      if (target === '--all') payload.all = true;
      else if (target === '--last') payload.last = true;
      else if (target === '--kind' && args[2]) payload.kind = args[2];
      else if (!isNaN(parseInt(target, 10))) payload.tabId = parseInt(target, 10);
      else {
        console.error('Specificare un ID tab, --all, --last o --kind <tipo>.');
        process.exit(1);
      }

      try {
        const res = await httpRequest('POST', '/api/tabs/close', payload);
        if (res.ok) {
          console.log(`Chiusura completata. Tab chiusi: ${res.closedCount || 1}`);
        } else {
          console.error('Errore chiusura tab:', res.error || res);
          process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'screenshot': {
      let tabId = null;
      let savePath = null;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--out' && args[i + 1]) savePath = args[++i];
        else if (!isNaN(parseInt(args[i], 10))) tabId = parseInt(args[i], 10);
      }

      const payload = {};
      if (tabId != null) payload.tabId = tabId;
      if (savePath) payload.savePath = path.resolve(savePath);

      try {
        const res = await httpRequest('POST', '/api/tabs/screenshot', payload, 15000);
        if (res.ok) {
          const imagePath = res.imagePath || savePath || 'screenshot salvato';
          console.log(`Screenshot acquisito con successo!`);
          console.log(`Percorso immagine: ${imagePath}`);
          console.log(`(Usa il tool read_file per visualizzare l'immagine e comprendere il contesto)`);
        } else {
          console.error('Errore screenshot tab:', res.error || res);
          process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'terminal-output': {
      let tabId = null;
      let lines = 200;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--lines' && args[i + 1]) lines = parseInt(args[++i], 10);
        else if (!isNaN(parseInt(args[i], 10))) tabId = parseInt(args[i], 10);
      }

      const payload = { lines };
      if (tabId != null) payload.tabId = tabId;

      try {
        const res = await httpRequest('POST', '/api/terminal/output', payload);
        if (res.ok) {
          console.log(`--- OUTPUT TERMINALE (Tab ${res.tabId}, ${res.linesCount} righe) ---`);
          console.log(res.buffer || '(buffer vuoto)');
          console.log('----------------------------------------------------');
        } else {
          console.error('Errore lettura buffer terminale:', res.error || res);
          process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }

    case 'help':
    default: {
      console.log(`
Uso CLI TauCode Tabs:
  node scripts/tabs.cjs types
  node scripts/tabs.cjs list
  node scripts/tabs.cjs open <preview|editor|terminal|markdown|svg|blockbench|settings> <target> [--title <title>] [--line <N>] [--cwd <dir>] [--cmd <cmd>]
  node scripts/tabs.cjs focus <tabId>
  node scripts/tabs.cjs close <tabId | --all | --kind <tipo> | --last>
  node scripts/tabs.cjs screenshot [tabId] [--out <percorso.png>]
  node scripts/tabs.cjs terminal-output [tabId] [--lines <N>]
`);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Errore non gestito:', err);
  process.exit(1);
});

