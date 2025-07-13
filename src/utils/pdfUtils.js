const { buscarCodigoAcceso } = require('./helpers.js');
const poppler = require('pdf-poppler');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

async function descargarPDFDeManuscrito(page, tituloBuscado) {
    const tarjetas = await page.$$('div.group');

    for (const tarjeta of tarjetas) {
        const tituloHandle = await tarjeta.$('h3');
        const titulo = await tituloHandle?.textContent();

        if (titulo?.trim() === tituloBuscado) {
            return await manejarDescarga(page, tarjeta, tituloBuscado);
        }
    }

    console.warn(`❌ No se encontró tarjeta con el título: "${tituloBuscado}"`);
    return null;
}

async function extraerCodigo(pdfPath) {
    const tmpDir = path.join(__dirname, 'tmp_ocr');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    try {
        const outputImage = path.join(tmpDir, 'page-1.png');
        await poppler.convert(pdfPath, {
            format: 'png',
            out_dir: tmpDir,
            out_prefix: 'page',
            page: 1,
            quality: 100,
            scale: 3000
        });

        if (!fs.existsSync(outputImage)) {
            throw new Error('La imagen no se generó.');
        }

        const { data: { text } } = await Tesseract.recognize(outputImage, 'spa', {
            preserve_interword_spaces: 1,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:óÓ* '
        });

        const codigo = buscarCodigoAcceso(text);
        return codigo;

    } finally {
        const outputImage = path.join(tmpDir, 'page-1.png');
        if (fs.existsSync(outputImage)) fs.unlinkSync(outputImage);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    }
}

async function desbloquearYDescargarPDF(page, tituloBuscado, codigo) {
    const tarjetas = await page.$$('div.group');

    for (const tarjeta of tarjetas) {
        const tituloHandle = await tarjeta.$('h3');
        const tituloTexto = await tituloHandle?.textContent();

        if (tituloTexto?.trim() === tituloBuscado.trim()) {
            console.log(`🔓 Desbloqueando manuscrito: ${tituloBuscado}`);

            const inputCodigo = await tarjeta.$('input[placeholder="Ingresá el código"]');
            if (!inputCodigo) {
                console.warn('⚠️ Input de código no encontrado.');
                return null;
            }

            await inputCodigo.fill(codigo);
            await page.waitForTimeout(300);

            const btnDesbloquear = await tarjeta.$('button:has-text("Desbloquear")');
            if (!btnDesbloquear) {
                console.warn('⚠️ Botón "Desbloquear" no encontrado.');
                return null;
            }

            await btnDesbloquear.click();
            await page.waitForTimeout(500); 

            await tarjeta.waitForSelector('button:has-text("Descargar PDF")', { timeout: 5000 });

            const botonDescarga = await tarjeta.$('button:has-text("Descargar PDF")');
            if (!botonDescarga) {
                console.warn('❌ Botón de descarga no apareció luego del desbloqueo.');
                return null;
            }

            const downloadsDir = path.resolve(process.cwd(), 'descargas');
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir);
            }

            const [download] = await Promise.all([
                page.waitForEvent('download'),
                botonDescarga.click()
            ]);

            const safeFileName = tituloBuscado.replace(/\s+/g, '_') + '.pdf';
            const savePath = path.join(downloadsDir, safeFileName);

            await download.saveAs(savePath);
            console.log(`📥 Descargado: ${tituloBuscado}`);

            return savePath;
        }
    }

    console.warn(`❌ No se encontró la tarjeta de: ${tituloBuscado}`);
    return null;
}

async function desbloquearYDescargarEnPagina2(page, tituloBuscado, codigoAnterior) {
    const tarjetas = await page.$$('div.group');

    for (const tarjeta of tarjetas) {
        const tituloHandle = await tarjeta.$('h3');
        const titulo = await tituloHandle?.textContent();

        if (titulo?.trim() === tituloBuscado) {
            console.log(`🔓 Desbloqueando manuscrito: ${tituloBuscado}`);

            const btnVerDoc = await tarjeta.$('button:has-text("Ver documentación")');
            if (btnVerDoc) {
                await btnVerDoc.click();
                const btnCerrarDoc = await page.waitForSelector('button[aria-label="Cerrar modal"]', { timeout: 5000 });
                await btnCerrarDoc.click();
            }

            const inputCodigo = await tarjeta.waitForSelector('input[placeholder*="Ingresá el código"]', { timeout: 5000 });
            await inputCodigo.fill(codigoAnterior);

            const btnDesbloquear = await tarjeta.$('button:has-text("Desbloquear")');
            if (!btnDesbloquear) {
                console.warn(`⚠️ Botón "Desbloquear" no encontrado en ${tituloBuscado}`);
                return null;
            }

            await Promise.all([
                page.waitForSelector('text=Manuscrito', { timeout: 5000 }),
                btnDesbloquear.click()
            ]);

            const btnCerrarPopup = await Promise.race([
                page.waitForSelector('button:has-text("Cerrar")', { timeout: 5000 }),
                page.waitForSelector('button[aria-label="Cerrar modal"]', { timeout: 5000 }),
            ]);
            await btnCerrarPopup.click();

            await page.waitForSelector(`h3:text("${tituloBuscado}") >> xpath=.. >> xpath=.. >> button:has-text("Descargar PDF")`, { timeout: 5000 });

            const botonDescarga = await tarjeta.$('button:has-text("Descargar PDF")');
            if (!botonDescarga) {
                console.warn(`❌ Botón de descarga no apareció luego del desbloqueo para ${tituloBuscado}.`);
                return null;
            }

            const downloadsDir = path.resolve(process.cwd(), 'descargas');
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir);
            }

            const [download] = await Promise.all([
                page.waitForEvent('download'),
                botonDescarga.click()
            ]);

            const safeFileName = tituloBuscado.replace(/\s+/g, '_') + '.pdf';
            const savePath = path.join(downloadsDir, safeFileName);
            await download.saveAs(savePath);
            console.log(`📥 Descargado: ${tituloBuscado}`);
            return savePath;
        }
    }

    console.warn(`❌ No se encontró manuscrito con título: ${tituloBuscado}`);
    return null;
}

async function manejarDescarga(page, tarjeta, titulo) {
    const botonDescarga = await tarjeta.$('button:has-text("Descargar PDF")');
    if (!botonDescarga) {
        console.warn(`❌ Botón de descarga no encontrado para "${titulo}".`);
        return null;
    }

    const downloadsDir = path.resolve(process.cwd(), 'descargas');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        botonDescarga.click()
    ]);

    const safeTitle = titulo.replace(/\s+/g, '_');
    const filePath = path.join(downloadsDir, `${safeTitle}.pdf`);
    await download.saveAs(filePath);

    console.log(`📥 Descargado: ${titulo}`);

    return filePath;
}

module.exports = {
    extraerCodigo,
    descargarPDFDeManuscrito,
    desbloquearYDescargarPDF,
    desbloquearYDescargarEnPagina2
};