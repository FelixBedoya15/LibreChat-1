#!/usr/bin/env node

/**
 * ==============================================================================
 * WAPPY IA - Asistente de Conexión para Google NotebookLM / Gemini Notebook (MCP)
 * ==============================================================================
 * Este script facilita la autenticación y vinculación de cuadernos de NotebookLM
 * para que los agentes de LibreChat-WAPPY puedan consultarlos y generar material.
 *
 * Soporta dos modalidades:
 * 1. Automática (vía navegador Chromium si tienes interfaz gráfica local).
 * 2. Manual / Guiada por Cookies (ideal para servidores VPS o entornos headless).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');
const https = require('https');

// Rutas de destino
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config', 'notebooklm');
const PROFILE_DEFAULT_DIR = path.join(CONFIG_DIR, 'profiles', 'default');
const TARGET_STORAGE_FILE = path.join(PROFILE_DEFAULT_DIR, 'storage_state.json');

// Rutas locales de usuario por defecto
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';
const LOCAL_STORAGE_FILE = path.join(HOME_DIR, '.notebooklm', 'profiles', 'default', 'storage_state.json');
const LOCAL_LEGACY_STORAGE_FILE = path.join(HOME_DIR, '.notebooklm', 'storage_state.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function ensureDirectories() {
  if (!fs.existsSync(PROFILE_DEFAULT_DIR)) {
    fs.mkdirSync(PROFILE_DEFAULT_DIR, { recursive: true });
  }
}

function printHeader() {
  console.log('\x1b[36m%s\x1b[0m', '====================================================================');
  console.log('\x1b[1m\x1b[32m%s\x1b[0m', '   🤖 WAPPY IA - Conector de Google NotebookLM / Gemini Notebook');
  console.log('\x1b[36m%s\x1b[0m', '====================================================================');
  console.log('Este asistente configura la sesión para que tus agentes puedan');
  console.log('consultar fuentes, normativas y generar podcasts o quizzes.\n');
}

function checkCurrentStatus() {
  if (fs.existsSync(TARGET_STORAGE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TARGET_STORAGE_FILE, 'utf8'));
      const cookieCount = data.cookies ? data.cookies.length : 0;
      const accountEmail = data.notebooklm?.account?.email || 'Cuenta conectada';
      console.log('\x1b[32m%s\x1b[0m', `✓ Sesión activa encontrada en: ${TARGET_STORAGE_FILE}`);
      console.log(`  Identidad: ${accountEmail} (${cookieCount} cookies registradas)\n`);
      return true;
    } catch (e) {
      console.log('\x1b[33m%s\x1b[0m', `! Archivo de sesión existente pero no válido.`);
    }
  } else {
    console.log('\x1b[90m%s\x1b[0m', '• No hay sesión de NotebookLM configurada actualmente en ./config/notebooklm\n');
  }
  return false;
}

/**
 * Verifica las cookies haciendo un request HTTP a notebooklm.google.com
 */
async function testCookiesWithGoogle(cookies) {
  return new Promise((resolve) => {
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const options = {
      hostname: 'notebooklm.google.com',
      port: 443,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Cookie: cookieHeader,
      },
    };

    const req = https.request(options, (res) => {
      // Si redirige a accounts.google.com/signin o responde 302 hacia login, las cookies están vencidas o incompletas
      const location = res.headers.location || '';
      if (location.includes('accounts.google.com/ServiceLogin') || location.includes('accounts.google.com/signin')) {
        resolve({ success: false, reason: 'Redirección a login de Google (cookies inválidas o incompletas)' });
      } else if (res.statusCode === 200 || (res.statusCode >= 300 && res.statusCode < 400)) {
        resolve({ success: true, statusCode: res.statusCode });
      } else {
        resolve({ success: false, reason: `Código de respuesta HTTP inesperado: ${res.statusCode}` });
      }
    });

    req.on('error', (err) => {
      resolve({ success: false, reason: err.message });
    });

    req.end();
  });
}

/**
 * Modo 1: Autenticación automática vía uvx / notebooklm login
 */
async function runAutoLogin() {
  console.log('\n\x1b[34m%s\x1b[0m', '--- Modo 1: Inicio de sesión automático en navegador ---');
  console.log('Se abrirá una ventana de Chromium. Inicia sesión con tu cuenta de Google.');
  console.log('Una vez veas tu panel de NotebookLM, el proceso guardará la sesión automáticamente.\n');

  try {
    console.log('Lanzando `notebooklm login`...');
    execSync('uvx --from "notebooklm-py[browser]" notebooklm login', { stdio: 'inherit' });

    // Verificar si se creó el archivo en HOME
    let sourceFile = fs.existsSync(LOCAL_STORAGE_FILE)
      ? LOCAL_STORAGE_FILE
      : fs.existsSync(LOCAL_LEGACY_STORAGE_FILE)
      ? LOCAL_LEGACY_STORAGE_FILE
      : null;

    if (sourceFile) {
      ensureDirectories();
      fs.copyFileSync(sourceFile, TARGET_STORAGE_FILE);
      console.log('\n\x1b[32m%s\x1b[0m', `✓ ¡Autenticación exitosa! Credenciales sincronizadas en:`);
      console.log(`  ${TARGET_STORAGE_FILE}\n`);
    } else {
      console.log('\x1b[31m%s\x1b[0m', 'x No se encontró el archivo de sesión generado en ~/.notebooklm.');
    }
  } catch (error) {
    console.log('\x1b[31m%s\x1b[0m', `\nError al ejecutar inicio automático: ${error.message}`);
    console.log('Sugerencia: Si estás en un servidor VPS o no tienes navegador local, usa la Opción 2.\n');
  }
}

/**
 * Modo 2: Importar cookies manual o pegando JSON
 */
async function runManualCookieImport() {
  console.log('\n\x1b[34m%s\x1b[0m', '--- Modo 2: Importación manual de sesión / cookies ---');
  console.log('Instrucciones rápidas:');
  console.log(' 1. Abre https://notebooklm.google.com en tu navegador habitual.');
  console.log(' 2. Presiona F12 (Herramientas de Desarrollador) -> Pestaña "Application" (o "Almacenamiento").');
  console.log(' 3. En la sección "Cookies" -> https://google.com, busca las siguientes cookies:');
  console.log('    - __Secure-1PSIDTS');
  console.log('    - SID\n');
  console.log('    (Tip: Si tienes la extensión "Cookie-Editor", puedes exportar todas las cookies en JSON y pegarlas directo).\n');

  console.log('¿Cómo prefieres ingresar tus credenciales?');
  console.log(' [1] Pegar los valores individuales (__Secure-1PSIDTS y SID)');
  console.log(' [2] Pegar el JSON completo de cookies (exportado con Cookie-Editor)');
  const subOption = (await ask('Selecciona una opción (1 o 2): ')).trim();

  let cookiesList = [];

  if (subOption === '2') {
    console.log('\nPega a continuación el JSON completo de cookies y presiona ENTER dos veces:');
    let rawJson = '';
    const lines = [];
    while (true) {
      const line = await ask('');
      if (line.trim() === '' && lines.length > 0) break;
      lines.push(line);
    }
    rawJson = lines.join('\n').trim();

    try {
      const parsed = JSON.parse(rawJson);
      cookiesList = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
      if (cookiesList.length === 0) throw new Error('El JSON no contiene un arreglo de cookies válido.');
    } catch (err) {
      console.log('\x1b[31m%s\x1b[0m', `Error al interpretar el JSON: ${err.message}`);
      return;
    }
  } else {
    const sidts = (await ask('\n1. Pega el valor de "__Secure-1PSIDTS": ')).trim();
    const sid = (await ask('2. Pega el valor de "SID": ')).trim();
    const email = (await ask('3. Correo de Google asociado (ej. usuario@gmail.com): ')).trim();

    if (!sidts || !sid) {
      console.log('\x1b[31m%s\x1b[0m', 'x Tanto __Secure-1PSIDTS como SID son obligatorios.');
      return;
    }

    cookiesList = [
      {
        name: '__Secure-1PSIDTS',
        value: sidts,
        domain: '.google.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'SID',
        value: sid,
        domain: '.google.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ];

    if (email) {
      accountMetadata = { authuser: 0, email };
    }
  }

  // Validar cookies contra Google
  console.log('\nComprobando validez de la sesión contra Google NotebookLM...');
  const check = await testCookiesWithGoogle(cookiesList);

  if (check.success) {
    console.log('\x1b[32m%s\x1b[0m', '✓ ¡Validación exitosa! Google respondió correctamente con la sesión proporcionada.');
  } else {
    console.log('\x1b[33m%s\x1b[0m', `! Advertencia en la prueba: ${check.reason}`);
    console.log('Se guardará de todas formas para probar en el contenedor MCP.');
  }

  const storageData = {
    cookies: cookiesList,
    origins: [],
    notebooklm: {
      version: 1,
      account: {
        authuser: 0,
        email: 'wappy-user@google.com',
      },
    },
  };

  ensureDirectories();
  fs.writeFileSync(TARGET_STORAGE_FILE, JSON.stringify(storageData, null, 2), { mode: 0o600 });
  console.log('\n\x1b[32m%s\x1b[0m', `✓ Archivo de sesión guardado con éxito en:`);
  console.log(`  ${TARGET_STORAGE_FILE}`);
  console.log('\nAhora puedes reiniciar tus contenedores Docker para activar el MCP:\n  docker compose up -d\n');
}

/**
 * Menú Principal
 */
async function main() {
  printHeader();
  const hasSession = checkCurrentStatus();

  console.log('Opciones disponibles:');
  console.log(' [1] Iniciar sesión automáticamente con Google (Abre Chromium local)');
  console.log(' [2] Conectar manualmente con cookies / JSON (Para VPS o sin navegador)');
  if (hasSession) {
    console.log(' [3] Probar conexión de la sesión actual');
  }
  console.log(' [0] Salir\n');

  const choice = (await ask('Selecciona una opción [1/2/3/0]: ')).trim();

  switch (choice) {
    case '1':
      await runAutoLogin();
      break;
    case '2':
      await runManualCookieImport();
      break;
    case '3':
      if (fs.existsSync(TARGET_STORAGE_FILE)) {
        try {
          const data = JSON.parse(fs.readFileSync(TARGET_STORAGE_FILE, 'utf8'));
          console.log('\nProbando sesión actual contra Google NotebookLM...');
          const res = await testCookiesWithGoogle(data.cookies || []);
          if (res.success) {
            console.log('\x1b[32m%s\x1b[0m', '✓ ¡La sesión actual es VÁLIDA y está activa!\n');
          } else {
            console.log('\x1b[31m%s\x1b[0m', `x La sesión no es válida: ${res.reason}\n`);
          }
        } catch (e) {
          console.log('\x1b[31m%s\x1b[0m', `Error leyendo archivo: ${e.message}\n`);
        }
      }
      break;
    case '0':
      console.log('Operación cancelada.');
      break;
    default:
      console.log('Opción no válida.');
      break;
  }

  rl.close();
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  rl.close();
});
