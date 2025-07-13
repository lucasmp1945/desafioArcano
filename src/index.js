require('dotenv').config();
const axios = require('axios');
const { chromium } = require('playwright');
const { romanoAEntero, irAPagina, reintentarDescargaConEspera } = require('./utils/helpers.js');
const { extraerCodigo, descargarPDFDeManuscrito, desbloquearYDescargarPDF, desbloquearYDescargarEnPagina2 } = require('./utils/pdfUtils.js');

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

async function procesarManuscritos(page, manuscritos) {
    for (let i = 0; i < manuscritos.length; i++) {
        const actual = manuscritos[i];
        const anterior = manuscritos[i - 1];

        await irAPagina(page, actual.pagina);

        let rutaPdf;

        if (i === 0) {
            rutaPdf = await reintentarDescargaConEspera(
                () => descargarPDFDeManuscrito(page, actual.titulo)
            );
        } else if (actual.pagina === 1) {
            rutaPdf = await reintentarDescargaConEspera(
                () => desbloquearYDescargarPDF(page, actual.titulo, anterior.clave)
            );
        } else if (actual.pagina === 2) {
            const claveAPI = await realizarDesafioFinal(actual.titulo, anterior.clave);

            rutaPdf = await reintentarDescargaConEspera(
                () => desbloquearYDescargarEnPagina2(page, actual.titulo, claveAPI)
            );
        }

        if (!rutaPdf) {
            console.warn(`⚠️ No se pudo procesar o descargar el PDF de ${actual.titulo}`);
            continue;
        }

        if (i < manuscritos.length - 1) {
            const clave = await extraerCodigo(rutaPdf);
            actual.clave = clave;
        }

    }

    return manuscritos;
}

async function realizarDesafioFinal(bookTitle, unlockCode) {
    const endpoint = process.env.API_DESAFIO;
    if (!endpoint) {
      throw new Error('⚠️ Variable API_DESAFIO no está definida en .env');
    }
  
    try {
      const url = new URL(endpoint);
      url.searchParams.append('bookTitle', bookTitle);
      url.searchParams.append('unlockCode', unlockCode);
  
      const { status, data } = await axios.get(url.href, { timeout: 8000 });
  
      console.log(`✅ Petición exitosa (${status})`);
  
      if (!data.success || !data.challenge) {
        console.warn('La respuesta del desafío no es válida.');
        return null;
      }
  
      const { vault, targets } = data.challenge;
      const password = targets.map(i => vault[i]).join('');
      return password;
    } catch (err) {
      if (err.response) {
        console.error(`❌ Error HTTP ${err.response.status}: ${err.response.statusText}`);
      } else {
        console.error('❌ Error durante el desafío final:', err.message);
      }
      return null;
    }
  }
  


(async () => {

    const browser = await chromium.launch({ headless: false });
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
        await page.waitForSelector('text=Manuscritos Sagrados', { timeout: 5000 });
        console.log('----Login exitoso----');

        /* busco los manuscritos en ambas paginas */
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

        /* ordeno cronologicamente */
        allManuscritos.sort((a, b) => {
            const sigloA = romanoAEntero(a.siglo.replace('Siglo ', '').trim());
            const sigloB = romanoAEntero(b.siglo.replace('Siglo ', '').trim());
            return sigloA - sigloB;
        });


        const res = await procesarManuscritos(page, allManuscritos);
        console.log('------------- RESULTADO ---------------');
        console.table(res)

    } catch (error) {
        console.error('Error durante la ejecución:', error.message);
    } finally {
        await browser.close();
        console.log('Navegador cerrado');
    }
})();
