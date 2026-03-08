const PIN_CORRECTO = "4935"; 
const db = new Dexie("ObrantisDB");

db.version(1).stores({
    proveedores: "++id, nombre, cat",
    facturas: "++id, provId, fecha, mes, num"
});

function verificarPIN() {
    const input = document.getElementById('pin-input').value;
    if (input === PIN_CORRECTO) {
        document.getElementById('pin-overlay').style.display = 'none';
        renderProveedores();
        renderFacturas();
    } else {
        alert("PIN Incorrecto");
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    if(tabId === 'facturas') loadProvDropdown();
}

function openModal(id) {
    document.getElementById(id).style.display = 'block';
    document.querySelector(`#${id} form`).reset();
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.getElementById('form-proveedor').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        nombre: document.getElementById('prov-nombre').value,
        cif: document.getElementById('prov-cif').value,
        tel: document.getElementById('prov-tel').value,
        cat: document.getElementById('prov-cat').value
    };
    await db.proveedores.add(data);
    closeModal('modal-proveedor');
    renderProveedores();
};

async function renderProveedores() {
    const query = document.getElementById('search-prov').value.toLowerCase();
    const provs = await db.proveedores.toArray();
    const list = document.getElementById('lista-proveedores');
    list.innerHTML = provs.filter(p => p.nombre.toLowerCase().includes(query))
        .map(p => `<div class="card"><h4>${p.nombre}</h4><p>${p.cat}</p><button class="btn-delete" onclick="deleteProv(${p.id})">Borrar</button></div>`).join('');
}

async function deleteProv(id) {
    if(confirm("¿Borrar proveedor?")) { await db.proveedores.delete(id); renderProveedores(); }
}

async function loadProvDropdown() {
    const provs = await db.proveedores.toArray();
    const select = document.getElementById('fact-prov');
    select.innerHTML = '<option value="">Proveedor...</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}

// Función para calcular el total sin errores
function calcTotal() {
    const b21 = parseFloat(document.getElementById('base-21').value) || 0;
    const b10 = parseFloat(document.getElementById('base-10').value) || 0;
    const b4 = parseFloat(document.getElementById('base-4').value) || 0;

    // Calculamos el total sumando cada base con su IVA
    const total = (b21 * 1.21) + (b10 * 1.10) + (b4 * 1.04);
    
    const elTotal = document.getElementById('fact-total');
    if (elTotal) {
        elTotal.value = total.toFixed(2);
    }
}



// Función para guardar factura blindada

document.getElementById('form-factura').onsubmit = async (e) => {
    e.preventDefault();
    
    // Leemos los campos nuevos de IVA
    const b21 = parseFloat(document.getElementById('base-21').value) || 0;
    const b10 = parseFloat(document.getElementById('base-10').value) || 0;
    const b4 = parseFloat(document.getElementById('base-4').value) || 0;
    
    const total = parseFloat(document.getElementById('fact-total').value) || 0;
    const provId = Number(document.getElementById('fact-prov').value);
    const fecha = document.getElementById('fact-fecha').value;
    const num = document.getElementById('fact-num').value.trim();

    // Verificación de duplicados
    if (num !== "" && num !== "S/N") {
        const duplicada = await db.facturas.where('num').equals(num).and(f => f.provId === provId).first();
        if (duplicada) return alert("¡Factura Duplicada! Este número ya existe para este proveedor.");
    }

    if (!provId || !fecha || total === 0) {
        return alert("Por favor, rellena los datos mínimos y al menos una base de IVA.");
    }

    const data = {
        provId,
        fecha,
        num,
        concepto: document.getElementById('fact-concepto')?.value || "",
        base21: b21,
        base10: b10,
        base4: b4,
        total: total
    };

    try {
        await db.facturas.add(data);
        closeModal('modal-factura');
        renderFacturas();
        // Limpiamos los campos de IVA para la próxima
        document.getElementById('base-21').value = "";
        document.getElementById('base-10').value = "";
        document.getElementById('base-4').value = "";
        alert("¡Factura con IVA desglosado guardada!");
    } catch (err) {
        alert("Error al guardar. Revisa los campos.");
    }
};

async function renderFacturas() {
    const mes = document.getElementById('filter-factura-month').value;
    let facts = await db.facturas.toArray();
    if (mes) facts = facts.filter(f => f.fecha.startsWith(mes));
    const provs = await db.proveedores.toArray();
    const list = document.getElementById('lista-facturas');
    list.innerHTML = facts.map(f => {
        const p = provs.find(x => x.id === f.provId);
        return `<div class="card"><h4>${p ? p.nombre : 'S/N'} - ${f.total}€</h4><p>${f.fecha}</p><button class="btn-delete" onclick="deleteFact(${f.id})">Borrar</button></div>`;
    }).join('');
}

async function deleteFact(id) {
    if(confirm("¿Borrar factura?")) { await db.facturas.delete(id); renderFacturas(); }
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function exportarDatos() {
    const provs = await db.proveedores.toArray();
    const facts = await db.facturas.toArray();
    const blob = new Blob([JSON.stringify({provs, facts})], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup_obrantis.json`;
    a.click();
}

function importarDatos(input) {
    const reader = new FileReader();
    reader.onload = async function() {
        const data = JSON.parse(reader.result);
        await db.proveedores.bulkPut(data.provs);
        await db.facturas.bulkPut(data.facts);
        location.reload();
    };
    reader.readAsText(input.files[0]);
}

async function generarInforme() {
    // 1. Buscamos el calendario naranja. En tu HTML se llama 'filtro-mes'
    const input = document.getElementById('filtro-mes');
    
    // Si no lo encuentra por ese nombre, buscamos cualquier input de tipo fecha
    const fechaValor = input ? input.value : document.querySelector('input[type="date"]')?.value;

    if (!fechaValor) {
        return alert("Por favor, selecciona un día del mes en el calendario naranja.");
    }

    // Extraemos el año y el mes (ejemplo: de "2026-02-11" sacamos "2026-02")
    const mesSel = fechaValor.substring(0, 7);

    try {
        const facts = await db.facturas.where('fecha').startsWith(mesSel).toArray();
        
        if (facts.length === 0) {
            return alert("No hay facturas guardadas para el mes: " + mesSel);
        }

        const provs = await db.proveedores.toArray();
        const doc = new jspdf.jsPDF();
        
        doc.text(`RESTAURANTE BARQUILLA - GASTOS`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Mes: ${mesSel} | Generado: ${new Date().toLocaleDateString()}`, 14, 28);

        const filas = facts.map(f => {
            const b21 = parseFloat(f.base21) || 0;
            const b10 = parseFloat(f.base10) || 0;
            const b4 = parseFloat(f.base4) || 0;
            const total = parseFloat(f.total) || 0;
            
            let bTot = b21 + b10 + b4;
            if (bTot === 0) bTot = total; // Para facturas antiguas sin desglose
            const ivaTot = total - bTot;

            return [
                f.fecha,
                provs.find(p => p.id === f.provId)?.nombre || 'S/N',
                f.num || '-',
                `${bTot.toFixed(2)}€`,
                `${ivaTot.toFixed(2)}€`,
                `${total.toFixed(2)}€`
            ];
        });

        doc.autoTable({
            startY: 35,
            head: [['Fecha', 'Proveedor', 'Nº Factura', 'Base', 'IVA', 'Total']],
            body: filas,
            headStyles: { fillColor: [44, 62, 80] },
            foot: [[
                '', '', 'TOTALES:', 
                `${facts.reduce((acc, f) => acc + (parseFloat(f.base21||0)+parseFloat(f.base10||0)+parseFloat(f.base4||0) || f.total), 0).toFixed(2)}€`,
                `${facts.reduce((acc, f) => acc + (f.total - (parseFloat(f.base21||0)+parseFloat(f.base10||0)+parseFloat(f.base4||0) || f.total)), 0).toFixed(2)}€`,
                `${facts.reduce((acc, f) => acc + (f.total || 0), 0).toFixed(2)}€`
            ]],
            footStyles: { fillColor: [211, 84, 0] }
        });

        doc.save(`Informe_Barquilla_${mesSel}.pdf`);
    } catch (err) {
        alert("Hubo un error al generar el PDF. Revisa que el calendario tenga una fecha.");
    }
}
async function generarInformeTrimestral() {
    const facts = await db.facturas.toArray();
    const provs = await db.proveedores.toArray();
    const fechaActual = new Date();
    const mesActual = fechaActual.getMonth(); 
    
    let inicio, fin, nombreTri;
    if (mesActual < 3) { inicio = 0; fin = 2; nombreTri = "1er Trimestre"; }
    else if (mesActual < 6) { inicio = 3; fin = 5; nombreTri = "2º Trimestre"; }
    else if (mesActual < 9) { inicio = 6; fin = 8; nombreTri = "3er Trimestre"; }
    else { inicio = 9; fin = 11; nombreTri = "4º Trimestre"; }

    const filtradas = facts.filter(f => {
        const m = new Date(f.fecha).getMonth();
        return m >= inicio && m <= fin;
    });

    if (filtradas.length === 0) return alert("No hay facturas en este trimestre");

    const doc = new jspdf.jsPDF();
    doc.text(`INFORME TRIMESTRAL - ${nombreTri}`, 14, 20);
    doc.text(`Restaurante Barquilla`, 14, 28);

    // --- FILAS CON DESGLOSE DE IVA ---
    const filas = filtradas.map(f => {
        const baseTotal = (f.base21 || 0) + (f.base10 || 0) + (f.base4 || 0);
        const ivaTotal = (f.total || 0) - baseTotal;
        return [
            f.fecha,
            provs.find(p => p.id === f.provId)?.nombre || 'S/N',
            `${baseTotal.toFixed(2)}€`,
            `${ivaTotal.toFixed(2)}€`,
            `${f.total.toFixed(2)}€`
        ];
    });

    doc.autoTable({
        startY: 35,
        head: [['Fecha', 'Proveedor', 'Base', 'IVA', 'Total']],
        body: filas,
        headStyles: { fillColor: [44, 62, 80] },
        foot: [[
            '', 'TOTALES:', 
            `${filtradas.reduce((acc, f) => acc + ((f.base21||0)+(f.base10||0)+(f.base4||0)), 0).toFixed(2)}€`,
            `${filtradas.reduce((acc, f) => acc + (f.total - ((f.base21||0)+(f.base10||0)+(f.base4||0))), 0).toFixed(2)}€`,
            `${filtradas.reduce((acc, f) => acc + f.total, 0).toFixed(2)}€`
        ]],
        footStyles: { fillColor: [211, 84, 0] }
    });

    doc.save(`Trimestral_Barquilla_${nombreTri}.pdf`);
}
