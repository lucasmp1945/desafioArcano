function romanoAEntero(romano) {
    const valores = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    let total = 0, anterior = 0;

    for (let i = romano.length - 1; i >= 0; i--) {
        const actual = valores[romano[i]];
        total += (actual < anterior) ? -actual : actual;
        anterior = actual;
    }
    return total;
}

function buscarCodigoAcceso(textoOCR) {
    const regex = /acceso:\s*([A-Z0-9]+)/i;
    const match = textoOCR.match(regex);

    if (!match || !match[1]) {
        console.log("Texto analizado (para depuración):", textoOCR);
        throw new Error('No se encontró el patrón "acceso: <código>"');
    }
    return match[1];
}

async function irAPagina(page, numero) {
    await page.click(`button:has-text("${numero}")`);
    await page.waitForLoadState('networkidle');
}

async function reintentarDescargaConEspera(fnDescarga, intentos = 5, esperaMs = 10000) {
    for (let intento = 1; intento <= intentos; intento++) {
        try {
            const resultado = await fnDescarga();
            if (resultado) return resultado;
        } catch (error) {
            console.warn(`⚠️ Falló intento ${intento}: ${error.message}`);
        }

        if (intento < intentos) {
            console.log(`⏳ Esperando ${esperaMs / 1000} segundos antes de reintentar...`);
            await new Promise(res => setTimeout(res, esperaMs));
        }
    }

    console.error('❌ Se alcanzó el número máximo de reintentos.');
    return null;
}

module.exports = {
    romanoAEntero,
    buscarCodigoAcceso,
    irAPagina,
    reintentarDescargaConEspera
};
