require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');
const { romanoAEntero, irAPagina, reintentarDescargaConEspera } = require('./utils/helpers.js');
const { extraerCodigo, descargarPDFDeManuscrito, desbloquearYDescargarPDF, desbloquearYDescargarEnPagina2 } = require('./utils/pdfUtils.js');

const app = express();        
const cors = require('cors');

// Configuración específica para Fly.io
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const IS_FLY_IO = process.env.FLY_APP_NAME !== undefined;

async function launchBrowser() {
    return await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      timeout: 60000
    });
  }

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});


async function extraerManuscritos(page, pagina) {
    await page.waitForSelector('h3');
    return await page.$$eval('h3', (hs, pagina) =>
        hs.map(h => {
            const card = h.closest('div');
            const span = [...card.querySelectorAll('span')].find(s => s.textContent.includes('Siglo'));
            return {
                titulo: h.textContent.trim(),
                siglo: span?.textContent.trim(),
                pagina
            };
        }), pagina);
}

async function realizarDesafioFinal(bookTitle, unlockCode, log) {
    const endpoint = process.env.API_DESAFIO;
    if (!endpoint) {
        log('⚠️ Variable API_DESAFIO no está definida en .env');
        return null;
    }

    try {
        const url = new URL(endpoint);
        url.searchParams.append('bookTitle', bookTitle);
        url.searchParams.append('unlockCode', unlockCode);

        const { status, data } = await axios.get(url.href, { timeout: 8000 });

        log(`✅ Petición desafío final OK (${status})`);

        if (!data.success || !data.challenge) {
            log('⚠️ La respuesta del desafío no es válida.');
            return null;
        }

        const { vault, targets } = data.challenge;
        const password = targets.map(i => vault[i]).join('');
        return password;
    } catch (err) {
        log(`❌ Error desafío final: ${err.message}`);
        return null;
    }
}

async function procesarManuscritos(page, manuscritos, log) {
    for (let i = 0; i < manuscritos.length; i++) {
        const actual = manuscritos[i];
        const anterior = manuscritos[i - 1];

        log(`🔍 Procesando: ${actual.titulo} (${actual.siglo})`);

        await irAPagina(page, actual.pagina);

        let rutaPdf;

        if (i === 0) {
            rutaPdf = await reintentarDescargaConEspera(() => descargarPDFDeManuscrito(page, actual.titulo));
        } else if (actual.pagina === 1) {
            rutaPdf = await reintentarDescargaConEspera(() => desbloquearYDescargarPDF(page, actual.titulo, anterior.clave));
        } else if (actual.pagina === 2) {
            const claveAPI = await realizarDesafioFinal(actual.titulo, anterior.clave, log);

            rutaPdf = await reintentarDescargaConEspera(() => desbloquearYDescargarEnPagina2(page, actual.titulo, claveAPI));
        }

        if (!rutaPdf) {
            log(`⚠️ No se pudo descargar PDF de ${actual.titulo}`);
            continue;
        }

        if (i < manuscritos.length - 1) {
            const clave = await extraerCodigo(rutaPdf);
            actual.clave = clave;
            log(`🔑 Clave extraída: ${clave}`);
        }
    }

    return manuscritos;
}

app.get('/scrapear', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const log = (msg) => {
        res.write(msg + '\n');
        console.log(msg);
    };
    browser = await launchBrowser();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const allManuscritos = [];

    try {
        await page.goto('https://pruebatecnica-sherpa-production.up.railway.app/login');
        await page.fill('input[type="email"]', process.env.USER);
        await page.fill('input[type="password"]', process.env.PASS);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            page.click('button[type="submit"]')
        ]);
        log('✅ Login exitoso');

        const manuscritosPagina1 = await extraerManuscritos(page, 1);
        allManuscritos.push(...manuscritosPagina1);

        const nextBtn = await page.$('button:has-text("2")');
        if (nextBtn) {
            await Promise.all([
                page.waitForLoadState('networkidle'),
                nextBtn.click()
            ]);
            const manuscritosPagina2 = await extraerManuscritos(page, 2);
            allManuscritos.push(...manuscritosPagina2);
        }

        allManuscritos.sort((a, b) => {
            const sigloA = romanoAEntero(a.siglo.replace('Siglo ', '').trim());
            const sigloB = romanoAEntero(b.siglo.replace('Siglo ', '').trim());
            return sigloA - sigloB;
        });

        await procesarManuscritos(page, allManuscritos, log);

        log('🎉 Proceso terminado.');
    } catch (err) {
        log(`❌ Error general: ${err.message}`);
    } finally {
        await browser.close();
        log('🛑 Navegador cerrado');
        res.end();
    }
});

app.listen(PORT, () => console.log(`🚀 Backend scraping escuchando en puerto ${PORT}`));
