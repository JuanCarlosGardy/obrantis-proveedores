// app.js (ESM)
import { auth, db, storage } from "./firebase.js";
// ===============================
// CABECERA IMPRESIÓN (PDF)
// ===============================
function setPrintHeader({ tipo, periodo }) {
  const elPeriodo = document.getElementById('printPeriodo');
  const elGen = document.getElementById('printGenerado');

  if (elPeriodo) {
    elPeriodo.textContent = `${tipo} · ${periodo}`;
  }

  if (elGen) {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    elGen.textContent = fmt.format(now);
  }
}
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref as sRef, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/* ---------------------------
   Helpers (UI)
----------------------------*/
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  return d;
};

function toast(msg, type="ok"){
  const box = $("#toasts");
  const t = el("div", `toast toast--${type}`);
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=> t.remove(), 3200);
}

function money(n){
  const v = Number(n || 0);
  return v.toLocaleString("es-ES", { style:"currency", currency:"EUR" });
}

function ymdToday(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthToday(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${yyyy}-${mm}`;
}

function quarterRange(year, q){
  const startMonth = (q-1)*3 + 1;
  const endMonth = startMonth + 2;
  const s = `${year}-${String(startMonth).padStart(2,"0")}-01`;
  // fin: último día del mes endMonth
  const endDate = new Date(year, endMonth, 0); // 0 -> último día del mes anterior
  const e = `${year}-${String(endMonth).padStart(2,"0")}-${String(endDate.getDate()).padStart(2,"0")}`;
  return { s, e };
}

function safeNum(v){
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------
   PIN local (bloqueo UI)
----------------------------*/
const PIN_KEY = "OBRANTIS_pin_hash_v1";
const PIN_UNLOCK = "OBRANTIS_pin_unlocked_v1";

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function setPin(pin){
  const h = await sha256(pin);
  localStorage.setItem(PIN_KEY, h);
  toast("PIN guardado en este dispositivo.", "ok");
}

async function checkPin(pin){
  const h = localStorage.getItem(PIN_KEY);
  if(!h) return true; // si no hay PIN, no bloquea
  const inH = await sha256(pin);
  return inH === h;
}

function isPinUnlocked(){
  const h = localStorage.getItem(PIN_KEY);
  if(!h) return true;
  return localStorage.getItem(PIN_UNLOCK) === "1";
}

function lockPin(){
  localStorage.removeItem(PIN_UNLOCK);
}

/* ---------------------------
   Modal reutilizable
----------------------------*/
const modal = {
  root: $("#modal"),
  title: $("#modalTitle"),
  body: $("#modalBody"),
  save: $("#modalSave"),
  footLeft: $("#modalFootLeft"),
  onSave: null,
  open({ title, bodyNode, onSave, footLeftNode=null }){
    this.title.textContent = title;
    this.body.innerHTML = "";
    this.body.appendChild(bodyNode);
    this.onSave = onSave;
    this.footLeft.innerHTML = "";
    if(footLeftNode) this.footLeft.appendChild(footLeftNode);
    this.root.classList.remove("hidden");
  },
  close(){
    this.root.classList.add("hidden");
    this.body.innerHTML = "";
    this.onSave = null;
    this.footLeft.innerHTML = "";
  }
};

$("#modal").addEventListener("click", (e)=>{
  const close = e.target?.dataset?.close;
  if(close) modal.close();
});
$("#modalSave").addEventListener("click", async ()=>{
  if(modal.onSave) await modal.onSave();
});

/* ---------------------------
   Firestore refs
----------------------------*/
const providersCol = collection(db, "providers");
const invoicesCol = collection(db, "invoices");

/* ---------------------------
   Auth + boot
----------------------------*/
const ui = {
  login: $("#login"),
  app: $("#app"),
  pinGate: $("#pinGate")
};

$("#btnLogin").addEventListener("click", async ()=>{
  const email = $("#email").value.trim();
  const pass = $("#pass").value.trim();
  $("#loginMsg").textContent = "";
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Sesión iniciada.", "ok");
  }catch(err){
    $("#loginMsg").textContent = "Error: revisa email/contraseña.";
  }
});

$("#btnLogout").addEventListener("click", async ()=>{
  lockPin();
  await signOut(auth);
});

$("#btnSetPin").addEventListener("click", async ()=>{
  const p1 = $("#pinNew").value.trim();
  const p2 = $("#pinNew2").value.trim();
  if(!p1 || p1.length < 4) return toast("El PIN debe tener al menos 4 dígitos.", "err");
  if(p1 !== p2) return toast("Los PIN no coinciden.", "err");
  await setPin(p1);
  $("#pinNew").value = "";
  $("#pinNew2").value = "";
});

$("#btnPinUnlock").addEventListener("click", async ()=>{
  const pin = $("#pinInput").value.trim();
  const ok = await checkPin(pin);
  if(!ok) return toast("PIN incorrecto.", "err");
  localStorage.setItem(PIN_UNLOCK, "1");
  $("#pinInput").value = "";
  ui.pinGate.classList.add("hidden");
  ui.app.classList.remove("hidden");
  await refreshAll();
});

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    ui.app.classList.add("hidden");
    ui.pinGate.classList.add("hidden");
    ui.login.classList.remove("hidden");
    return;
  }
  ui.login.classList.add("hidden");

  if(!isPinUnlocked()){
    ui.app.classList.add("hidden");
    ui.pinGate.classList.remove("hidden");
    return;
  }
  ui.pinGate.classList.add("hidden");
  ui.app.classList.remove("hidden");
  await refreshAll();
});

/* ---------------------------
   Tabs
----------------------------*/
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const tab = btn.dataset.tab;
    ["providers","invoices","reports"].forEach(t=>{
      $(`#tab-${t}`).classList.toggle("hidden", t !== tab);
    });
  });
});

/* ---------------------------
   PROVEEDORES
----------------------------*/
$("#btnAddProvider").addEventListener("click", ()=> openProviderForm());

$("#provSearch").addEventListener("input", ()=> renderProviders());
$("#provCategory").addEventListener("change", ()=> renderProviders());
$("#provStatus").addEventListener("change", ()=> renderProviders());

let providersCache = [];
let invoicesCache = [];

async function fetchProviders(){
  // Nota: para filtros complejos sin índices, traemos “los últimos 1000” y filtramos en cliente (uso personal).
  const snap = await getDocs(query(providersCol, orderBy("createdAt","desc"), limit(1000)));
  providersCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

async function fetchInvoices(){
  const snap = await getDocs(query(invoicesCol, orderBy("invoiceDate","desc"), limit(2000)));
  invoicesCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

function providerMatches(p){
  const q = $("#provSearch").value.trim().toLowerCase();
  const cat = $("#provCategory").value;
  const st = $("#provStatus").value;

  if(st !== "all" && p.status !== st) return false;
  if(cat && (p.category || "") !== cat) return false;
  if(!q) return true;

  const hay = [
    p.nameCommercial, p.legalName, p.vatId, p.email, p.phone, p.address, p.notes
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function renderProviders(){
  const box = $("#providersList");
  box.innerHTML = "";

  const list = providersCache.filter(providerMatches);

  if(!list.length){
    const d = el("div","muted");
    d.textContent = "No hay proveedores con esos filtros.";
    box.appendChild(d);
    return;
  }

  for(const p of list){
    const row = el("div","item");
    const left = el("div");
    const title = el("div","item__title");
    title.textContent = p.nameCommercial || "(Sin nombre)";
    const meta = el("div","item__meta");
    meta.textContent = `${p.category || "Sin categoría"} · ${p.vatId || "Sin CIF"} · ${p.email || "Sin email"}`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = el("div","item__actions");
    if(p.status === "inactive"){
      const pill = el("span","pill pill--inactive");
      pill.textContent = "Inactivo";
      right.appendChild(pill);
    }

    const btnView = el("button","btn btn--secondary");
    btnView.textContent = "Ver";
    btnView.addEventListener("click", ()=> openProviderView(p.id));

    const btnEdit = el("button","btn btn--secondary");
    btnEdit.textContent = "Editar";
    btnEdit.addEventListener("click", ()=> openProviderForm(p));

    const btnDel = el("button","btn");
    btnDel.textContent = "Borrar";
    btnDel.style.borderColor = "rgba(255,90,106,.45)";
    btnDel.style.background = "rgba(255,90,106,.14)";
    btnDel.addEventListener("click", ()=> deleteProviderFlow(p));

    right.appendChild(btnView);
    right.appendChild(btnEdit);
    right.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(right);
    box.appendChild(row);
  }
}

function openProviderView(id){
  const p = providersCache.find(x=>x.id===id);
  if(!p) return;

  const body = el("div");
  const grid = el("div","form");
  const add = (label, val)=>{
    const w = el("div","full");
    const l = el("div","muted small"); l.textContent = label;
    const v = el("div"); v.textContent = val || "—";
    w.appendChild(l); w.appendChild(v);
    grid.appendChild(w);
  };

  add("Nombre comercial", p.nameCommercial);
  add("Razón social", p.legalName);
  add("CIF/NIF", p.vatId);
  add("Email", p.email);
  add("Teléfono", p.phone);
  add("Dirección", p.address);
  add("Categoría", p.category);
  add("Forma de pago", p.paymentMethod);
  add("Notas", p.notes);
  add("Estado", p.status);

  body.appendChild(grid);

  modal.open({
    title: "Ficha de proveedor",
    bodyNode: body,
    onSave: async ()=> modal.close(),
  });
  $("#modalSave").textContent = "Cerrar";
}

function openProviderForm(p=null){
  const isEdit = !!p?.id;
  const body = el("div");
  const form = el("div","form");

  const field = (label, value="", type="text", cls="")=>{
    const w = el("div", cls);
    const l = el("div","muted small");
    l.textContent = label;
    const i = el("input","input");
    i.type = type;
    i.value = value || "";
    w.appendChild(l); w.appendChild(i);
    return { w, i };
  };

  const fName = field("Nombre comercial", p?.nameCommercial);
  const fLegal = field("Razón social", p?.legalName);
  const fVat = field("CIF/NIF", p?.vatId);
  const fEmail = field("Email", p?.email, "email");
  const fPhone = field("Teléfono", p?.phone, "tel");
  const fAddr = field("Dirección", p?.address, "text", "full");

  const catWrap = el("div");
  const catLab = el("div","muted small"); catLab.textContent = "Categoría";
  const catSel = el("select","input");
  ["","Alimentación","Bebidas","Limpieza","Mantenimiento","Servicios","Alquileres","Tabaco","Otros"].forEach(v=>{
    const o = el("option");
    o.value = v;
    o.textContent = v || "Selecciona…";
    catSel.appendChild(o);
  });
  catSel.value = p?.category || "";
  catWrap.appendChild(catLab); catWrap.appendChild(catSel);

  const pay = field("Forma de pago", p?.paymentMethod);
  const notesWrap = el("div","full");
  const notesLab = el("div","muted small"); notesLab.textContent = "Notas";
  const notes = document.createElement("textarea");
  notes.className = "input";
  notes.rows = 4;
  notes.value = p?.notes || "";
  notesWrap.appendChild(notesLab); notesWrap.appendChild(notes);

  const statusWrap = el("div");
  const statusLab = el("div","muted small"); statusLab.textContent = "Estado";
  const statusSel = el("select","input");
  ["active","inactive"].forEach(v=>{
    const o = el("option");
    o.value = v;
    o.textContent = v === "active" ? "Activo" : "Inactivo";
    statusSel.appendChild(o);
  });
  statusSel.value = p?.status || "active";
  statusWrap.appendChild(statusLab); statusWrap.appendChild(statusSel);

  [
    fName.w, fLegal.w, fVat.w, fEmail.w, fPhone.w, fAddr.w,
    catWrap, pay.w, statusWrap, notesWrap
  ].forEach(n=> form.appendChild(n));

  body.appendChild(form);

  modal.open({
    title: isEdit ? "Editar proveedor" : "Nuevo proveedor",
    bodyNode: body,
    onSave: async ()=>{
      const data = {
        nameCommercial: fName.i.value.trim(),
        legalName: fLegal.i.value.trim(),
        vatId: fVat.i.value.trim(),
        email: fEmail.i.value.trim(),
        phone: fPhone.i.value.trim(),
        address: fAddr.i.value.trim(),
        category: catSel.value,
        paymentMethod: pay.i.value.trim(),
        notes: notes.value.trim(),
        status: statusSel.value,
        updatedAt: serverTimestamp()
      };

      if(!data.nameCommercial) return toast("Falta nombre comercial.", "err");

      try{
        if(isEdit){
          await updateDoc(doc(db,"providers",p.id), data);
          toast("Proveedor actualizado.", "ok");
        }else{
          data.createdAt = serverTimestamp();
          await addDoc(providersCol, data);
          toast("Proveedor creado.", "ok");
        }
        modal.close();
        $("#modalSave").textContent = "Guardar";
        await fetchProviders();
        renderProviders();
        // refresca selects de facturas
        renderInvoiceProviderOptions();
      }catch(e){
        toast("Error guardando proveedor.", "err");
      }
    }
  });
  $("#modalSave").textContent = "Guardar";
}

async function deleteProviderFlow(p){
  // ¿tiene facturas?
  const has = invoicesCache.some(inv => inv.providerId === p.id);
  if(has){
    const body = el("div");
    const msg = el("div");
    msg.innerHTML = `
      <div style="font-weight:800;margin-bottom:6px;">Este proveedor tiene facturas asociadas.</div>
      <div class="muted">Enfoque seguro: no se borra. Puedes desactivarlo para que no aparezca como activo, manteniendo el histórico.</div>
    `;
    body.appendChild(msg);

    modal.open({
      title: "No se puede borrar (histórico)",
      bodyNode: body,
      footLeftNode: (()=> {
        const b = el("button","btn btn--secondary");
        b.textContent = "Desactivar proveedor";
        b.addEventListener("click", async ()=>{
          try{
            await updateDoc(doc(db,"providers",p.id), { status:"inactive", updatedAt: serverTimestamp() });
            toast("Proveedor desactivado.", "ok");
            modal.close();
            await fetchProviders();
            renderProviders();
            renderInvoiceProviderOptions();
          }catch(e){
            toast("No se pudo desactivar.", "err");
          }
        });
        return b;
      })(),
      onSave: async ()=> modal.close()
    });
    $("#modalSave").textContent = "Cerrar";
    return;
  }

  const body = el("div");
  body.innerHTML = `<div>¿Seguro que quieres borrar <b>${p.nameCommercial}</b>?</div><div class="muted small">No tiene facturas asociadas.</div>`;
  modal.open({
    title: "Confirmar borrado",
    bodyNode: body,
    onSave: async ()=>{
      try{
        await deleteDoc(doc(db,"providers",p.id));
        toast("Proveedor borrado.", "ok");
        modal.close();
        $("#modalSave").textContent = "Guardar";
        await fetchProviders();
        renderProviders();
        renderInvoiceProviderOptions();
      }catch(e){
        toast("Error borrando proveedor.", "err");
      }
    }
  });
  $("#modalSave").textContent = "Borrar";
}

/* ---------------------------
   FACTURAS
----------------------------*/
$("#btnAddInvoice").addEventListener("click", ()=> openInvoiceForm());

$("#invSearch").addEventListener("input", ()=> renderInvoices());
$("#invMonth").addEventListener("change", ()=> renderInvoices());
$("#invVatRate").addEventListener("change", ()=> renderInvoices());
$("#invProvider").addEventListener("change", ()=> renderInvoices());

function renderInvoiceProviderOptions(selectEl, selectedId=""){
  // Si se pasa selectEl, lo rellena. Si no, no hace nada (usado en modal).
  if(!selectEl) return;
  selectEl.innerHTML = "";
  const opt0 = el("option"); opt0.value=""; opt0.textContent="Selecciona proveedor…";
  selectEl.appendChild(opt0);

  const list = [...providersCache]
    .filter(p=>p.status !== "inactive")
    .sort((a,b)=>(a.nameCommercial||"").localeCompare(b.nameCommercial||""));

  for(const p of list){
    const o = el("option");
    o.value = p.id;
    o.textContent = p.nameCommercial || p.legalName || p.id;
    selectEl.appendChild(o);
  }
  selectEl.value = selectedId || "";
}

function invoiceMatches(i){
  const qTxt = $("#invSearch").value.trim().toLowerCase();
  const m = $("#invMonth").value; // YYYY-MM
  const vat = $("#invVatRate").value;
    const pid = $("#invProvider")?.value || "";
  
  if(pid && String(i.providerId) !== String(pid)) return false;
  if(m && !(i.invoiceDate || "").startsWith(m)) return false;
  if(vat && String(i.vatRate) !== String(vat)) return false;

  if(!qTxt) return true;
  const hay = [
    i.providerName, i.invoiceNo, i.concept
  ].join(" ").toLowerCase();
  return hay.includes(qTxt);
}

function renderInvoices(){
  const box = $("#invoicesList");
  box.innerHTML = "";

  const list = invoicesCache.filter(invoiceMatches);

  if(!list.length){
    const d = el("div","muted");
    d.textContent = "No hay facturas con esos filtros.";
    box.appendChild(d);
    return;
  }

  for(const i of list){
    const row = el("div","item");
    const left = el("div");
    const title = el("div","item__title");
    title.textContent = `${i.providerName || "Proveedor"} · ${i.invoiceNo || "Sin nº"}`;
    const meta = el("div","item__meta");
    meta.textContent = `${i.invoiceDate || "—"} · IVA ${i.vatRate || 0}% · Base ${money(i.base)} · Total ${money(i.total)}`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = el("div","item__actions");
    const btnView = el("button","btn btn--secondary"); btnView.textContent="Ver";
    btnView.addEventListener("click", ()=> openInvoiceView(i.id));

    const btnEdit = el("button","btn btn--secondary"); btnEdit.textContent="Editar";
    btnEdit.addEventListener("click", ()=> openInvoiceForm(i));

    const btnDel = el("button","btn");
    btnDel.textContent="Borrar";
    btnDel.style.borderColor="rgba(255,90,106,.45)";
    btnDel.style.background="rgba(255,90,106,.14)";
    btnDel.addEventListener("click", ()=> deleteInvoiceFlow(i));

    right.appendChild(btnView);
    right.appendChild(btnEdit);
    right.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(right);
    box.appendChild(row);
  }
}

function openInvoiceView(id){
  const i = invoicesCache.find(x=>x.id===id);
  if(!i) return;

  const body = el("div");
  const grid = el("div","form");
  const add = (label, val)=>{
    const w = el("div","full");
    const l = el("div","muted small"); l.textContent = label;
    const v = el("div"); v.textContent = val || "—";
    w.appendChild(l); w.appendChild(v);
    grid.appendChild(w);
  };

  add("Proveedor", i.providerName);
  add("Fecha factura", i.invoiceDate);
  add("Nº factura", i.invoiceNo);
  add("Concepto", i.concept);
  add("Base imponible", money(i.base));
  add("IVA", `${i.vatRate || 0}% · ${money(i.vatAmount)}`);
  add("Total", money(i.total));
  add("Fecha pago", i.paidDate);

  if(i.attachment?.url){
    const w = el("div","full");
    const l = el("div","muted small"); l.textContent = "Adjunto";
    const a = el("a");
    a.href = i.attachment.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = i.attachment.name || "Abrir adjunto";
    w.appendChild(l); w.appendChild(a);
    grid.appendChild(w);
  }

  body.appendChild(grid);

  modal.open({ title:"Ver factura", bodyNode: body, onSave: async ()=> modal.close() });
  $("#modalSave").textContent = "Cerrar";
}

function openInvoiceForm(inv=null){
  const isEdit = !!inv?.id;

  const body = el("div");
  const form = el("div","form");

  // Proveedor select
  const pWrap = el("div");
  const pLab = el("div","muted small"); pLab.textContent = "Proveedor";
  const pSel = el("select","input");
  pWrap.appendChild(pLab); pWrap.appendChild(pSel);
  renderInvoiceProviderOptions(pSel, inv?.providerId || "");

  const fDateWrap = el("div");
  const fDateLab = el("div","muted small"); fDateLab.textContent = "Fecha factura";
  const fDate = el("input","input"); fDate.type="date";
  fDate.value = inv?.invoiceDate || ymdToday();
  fDateWrap.appendChild(fDateLab); fDateWrap.appendChild(fDate);

  const fNoWrap = el("div");
  const fNoLab = el("div","muted small"); fNoLab.textContent = "Nº factura";
  const fNo = el("input","input"); fNo.value = inv?.invoiceNo || "";
  fNoWrap.appendChild(fNoLab); fNoWrap.appendChild(fNo);

  const radar = el("div","muted small full");
  radar.textContent = "Radar duplicados: —";

  const conceptWrap = el("div","full");
  const conceptLab = el("div","muted small"); conceptLab.textContent = "Concepto";
  const concept = el("input","input"); concept.value = inv?.concept || "";
  conceptWrap.appendChild(conceptLab); conceptWrap.appendChild(concept);
    // IVA mixto (varias líneas)
  const mixedWrap = el("div","full");
  const mixedLabel = el("label");
  mixedLabel.style.display = "flex";
  mixedLabel.style.gap = "10px";
  mixedLabel.style.alignItems = "center";

  const mixedChk = el("input");
  mixedChk.type = "checkbox";

  const mixedTxt = el("div");
  mixedTxt.innerHTML = `<b>IVA mixto</b> <span class="muted small">(varias líneas)</span>`;

  mixedLabel.appendChild(mixedChk);
  mixedLabel.appendChild(mixedTxt);
  mixedWrap.appendChild(mixedLabel);
  const baseWrap = el("div");
  const baseLab = el("div","muted small"); baseLab.textContent = "Base imponible (€)";
  const base = el("input","input"); base.inputMode="decimal";
  base.value = (inv?.base ?? "").toString();
  baseWrap.appendChild(baseLab); baseWrap.appendChild(base);

  const vatWrap = el("div");
  const vatLab = el("div","muted small"); vatLab.textContent = "IVA %";
  const vatSel = el("select","input");
  [0,4,10,21].forEach(v=>{
    const o = el("option"); o.value = String(v); o.textContent = `${v}%`;
    vatSel.appendChild(o);
  });
  vatSel.value = String(inv?.vatRate ?? 10);
  vatWrap.appendChild(vatLab); vatWrap.appendChild(vatSel);

  const calcWrap = el("div","full");
    // Caja IVA mixto (oculta por defecto)
  const mixedBox = el("div","full");
  mixedBox.style.display = "none";

  const mixedInfo = el("div","muted small");
  mixedInfo.textContent = "Líneas de IVA (una por tipo)";
  mixedInfo.style.marginBottom = "6px";

  const linesHost = el("div");
  linesHost.style.display = "grid";
  linesHost.style.gap = "8px";

  const btnAddLine = el("button","btn");
  btnAddLine.type = "button";
  btnAddLine.textContent = "+ Añadir línea";
  btnAddLine.style.marginTop = "8px";

  mixedBox.appendChild(mixedInfo);
  mixedBox.appendChild(linesHost);
  mixedBox.appendChild(btnAddLine);
    function makeRateSelect(selected="10"){
    const s = el("select","input");
    [0,4,10,21].forEach(v=>{
      const o = el("option"); o.value = String(v); o.textContent = `${v}%`;
      if(String(v)===String(selected)) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  function addLineRow(line={concept:"", base:"", vatRate:"10"}){
    const row = el("div","row");
    row.style.gap = "8px";
    row.style.alignItems = "center";

    const c = el("input","input");
    c.placeholder = "Concepto (opcional)";
    c.value = line.concept || "";

    const b = el("input","input");
    b.inputMode = "decimal";
    b.placeholder = "Base";
    b.style.textAlign = "right";
    b.value = (line.base ?? "").toString();

    const r = makeRateSelect(line.vatRate ?? "10");

    const del = el("button","btn danger");
    del.type = "button";
    del.textContent = "X";

    del.addEventListener("click", ()=>{
      row.remove();
      recalcMixed();
    });

    [c,b,r].forEach(x=>{
      x.addEventListener("input", recalcMixed);
      x.addEventListener("change", recalcMixed);
    });

    row.appendChild(c);
    row.appendChild(b);
    row.appendChild(r);
    row.appendChild(del);

    row._c = c; row._b = b; row._r = r;
    linesHost.appendChild(row);
  }

  function getLines(){
    const rows = Array.from(linesHost.children);
    return rows.map(row=>{
      const concept = row._c?.value?.trim() || "";
      const base = +safeNum(row._b?.value || 0);
      const vatRate = String(row._r?.value || "0");
      return { concept, base: +base.toFixed(2), vatRate };
    }).filter(l => l.base > 0);
  }

  function recalcMixed(){
    const lines = getLines();
    let baseSum = 0, vatSum = 0, totalSum = 0;

    for(const l of lines){
      const rate = +safeNum(l.vatRate);
      const v = +(l.base * (rate/100)).toFixed(2);
      baseSum += l.base;
      vatSum += v;
      totalSum += (l.base + v);
    }

    baseSum = +baseSum.toFixed(2);
    vatSum = +vatSum.toFixed(2);
    totalSum = +totalSum.toFixed(2);

    // Reutilizamos el texto del mixedInfo para mostrar totales sin tocar tu calcWrap actual
    mixedInfo.textContent = `Líneas de IVA (una por tipo) — Totales: Base ${money(baseSum)} · IVA ${money(vatSum)} · Total ${money(totalSum)}`;
  }
    btnAddLine.addEventListener("click", ()=>{
    addLineRow({concept:"", base:"", vatRate:"10"});
    recalcMixed();
  });

  mixedChk.addEventListener("change", ()=>{
    const on = mixedChk.checked;

    // ocultar modo simple
    baseWrap.style.display = on ? "none" : "";
    vatWrap.style.display = on ? "none" : "";
    calcWrap.style.display = on ? "none" : "";

    // mostrar modo mixto
    mixedBox.style.display = on ? "" : "none";

    if(on && linesHost.children.length === 0){
      addLineRow({concept:"", base:"", vatRate:"10"});
    }
    recalcMixed();
  });

  // Si editamos una factura que ya tenga líneas, activar y cargar
  if(inv?.lines?.length){
    mixedChk.checked = true;
    baseWrap.style.display = "none";
    vatWrap.style.display = "none";
    calcWrap.style.display = "none";
    mixedBox.style.display = "";

    linesHost.innerHTML = "";
    inv.lines.forEach(l => addLineRow(l));
    recalcMixed();
  }
  const calc = el("div","pill");
  calcWrap.appendChild(calc);

  const paidWrap = el("div");
  const paidLab = el("div","muted small"); paidLab.textContent = "Fecha de pago";
  const paid = el("input","input"); paid.type="date";
  paid.value = inv?.paidDate || fDate.value;
  paidWrap.appendChild(paidLab); paidWrap.appendChild(paid);

  const attachWrap = el("div","full");
  const attachLab = el("div","muted small");
  attachLab.textContent = "Adjunto (opcional) - PDF/imagen";
  const attach = el("input","input");
  attach.type="file";
  attach.accept=".pdf,image/*";
  attachWrap.appendChild(attachLab); attachWrap.appendChild(attach);

  const attachInfo = el("div","muted small full");
  attachInfo.textContent = inv?.attachment?.name ? `Adjunto actual: ${inv.attachment.name}` : "Adjunto actual: —";

  // Calcular total
  function recalc(){
    const b = safeNum(base.value);
    const r = safeNum(vatSel.value);
    const vatAmount = +(b * (r/100)).toFixed(2);
    const total = +(b + vatAmount).toFixed(2);
    calc.textContent = `Calculado → IVA: ${money(vatAmount)} · Total: ${money(total)}`;
  }

  function checkDuplicates(){
    const pid = pSel.value;
    const no = fNo.value.trim();
    if(!pid || !no){
      radar.textContent = "Radar duplicados: —";
      return;
    }
    const dup = invoicesCache.some(x =>
      x.providerId === pid &&
      String(x.invoiceNo || "").trim().toLowerCase() === no.toLowerCase() &&
      (!isEdit || x.id !== inv.id)
    );
    radar.textContent = dup
      ? "Radar duplicados: ATENCIÓN, hay otra factura con el mismo nº para este proveedor."
      : "Radar duplicados: OK, no se detectan duplicados.";
  }

  base.addEventListener("input", recalc);
  vatSel.addEventListener("change", recalc);
  fDate.addEventListener("change", ()=> { if(!isEdit) paid.value = fDate.value; });
  pSel.addEventListener("change", checkDuplicates);
  fNo.addEventListener("input", checkDuplicates);

  recalc();
  checkDuplicates();

  [
  pWrap, fDateWrap, fNoWrap, radar,
  conceptWrap, mixedWrap,
  baseWrap, vatWrap, calcWrap, mixedBox,
  paidWrap, attachWrap, attachInfo
].forEach(n=> form.appendChild(n));

  body.appendChild(form);

  modal.open({
    title: isEdit ? "Editar factura" : "Nueva factura (PAGADA)",
    bodyNode: body,
    onSave: async ()=>{
      const providerId = pSel.value;
      if(!providerId) return toast("Selecciona proveedor.", "err");

      const prov = providersCache.find(p=>p.id===providerId);
      if(!prov) return toast("Proveedor no válido.", "err");

      // --- Cálculo importes: simple o mixto ---
let baseVal = 0;
let vatRate = +safeNum(vatSel.value);
let vatAmount = 0;
let total = 0;

let lines = null;

if (typeof mixedChk !== "undefined" && mixedChk.checked) {
  lines = getLines(); // usa las líneas del IVA mixto
  if (!lines.length) return toast("Añade al menos una línea con base.", "err");

  for (const l of lines) {
    const b = +safeNum(l.base);
    const r = +safeNum(l.vatRate);
    const v = +(b * (r / 100)).toFixed(2);

    baseVal += b;
    vatAmount += v;
    total += (b + v);
  }

  baseVal = +baseVal.toFixed(2);
  vatAmount = +vatAmount.toFixed(2);
  total = +total.toFixed(2);

  // En mixto, vatRate no representa nada único
  vatRate = null;
} else {
  baseVal = +safeNum(base.value).toFixed(2);
  vatRate = +safeNum(vatSel.value);
  vatAmount = +(baseVal * (vatRate / 100)).toFixed(2);
  total = +(baseVal + vatAmount).toFixed(2);
}

      const data = {
        providerId,
        providerName: prov.nameCommercial || prov.legalName || "Proveedor",
        invoiceDate: fDate.value || ymdToday(),
        invoiceNo: fNo.value.trim(),
        concept: concept.value.trim(),
        base: baseVal,
        vatRate,
        vatAmount,
        total,
        ...(lines ? { lines } : {}),
        paidDate: paid.value || (fDate.value || ymdToday()),
        updatedAt: serverTimestamp()
      };

      // Adjuntos: si hay archivo nuevo, subimos y si había anterior lo borramos (reemplazo)
      const file = attach.files?.[0] || null;

      try{
        let attachment = inv?.attachment || null;

        if(file){
          // borrado anterior
          if(attachment?.path){
            try{
              await deleteObject(sRef(storage, attachment.path));
            }catch(_){} // si no existe, no pasa nada
          }
          const path = `invoices/${providerId}/${Date.now()}_${file.name}`;
          const r = sRef(storage, path);
          await uploadBytes(r, file);
          const url = await getDownloadURL(r);
          attachment = { url, path, name: file.name };
        }

        if(attachment) data.attachment = attachment;

        if(isEdit){
          await updateDoc(doc(db,"invoices",inv.id), data);
          toast("Factura actualizada.", "ok");
        }else{
          data.createdAt = serverTimestamp();
          await addDoc(invoicesCol, data);
          toast("Factura creada.", "ok");
        }

        modal.close();
        $("#modalSave").textContent = "Guardar";
        await fetchInvoices();
        renderInvoices();
      }catch(e){
        toast("Error guardando factura.", "err");
      }
    }
  });

  $("#modalSave").textContent = "Guardar";
}

async function deleteInvoiceFlow(inv){
  const body = el("div");
  body.innerHTML = `<div>¿Seguro que quieres borrar la factura <b>${inv.invoiceNo || "(sin nº)"}</b> de <b>${inv.providerName}</b>?</div><div class="muted small">Si tiene adjunto, también se borrará.</div>`;

  modal.open({
    title: "Confirmar borrado de factura",
    bodyNode: body,
    onSave: async ()=>{
      try{
        if(inv.attachment?.path){
          try{ await deleteObject(sRef(storage, inv.attachment.path)); }catch(_){}
        }
        await deleteDoc(doc(db,"invoices",inv.id));
        toast("Factura borrada.", "ok");
        modal.close();
        $("#modalSave").textContent = "Guardar";
        await fetchInvoices();
        renderInvoices();
      }catch(e){
        toast("Error borrando factura.", "err");
      }
    }
  });
  $("#modalSave").textContent = "Borrar";
}

/* ---------------------------
   INFORMES
----------------------------*/
$("#repMonth").value = monthToday();
$("#invMonth").value = monthToday();

$("#btnRunMonthly").addEventListener("click", ()=> {
  const month = $("#repMonth").value;
  setPrintHeader({ tipo: "Informe mensual", periodo: month || "—" });
  runMonthlyReport(month);
});
$("#btnRunQuarter").addEventListener("click", ()=>{
  const year = Number($("#repYear").value || new Date().getFullYear());
  const q = Number($("#repQuarter").value);
  setPrintHeader({ tipo: "Informe trimestral", periodo: `${year} Q${q}` });
  runQuarterReport(year, q);
});
$("#repYear").value = String(new Date().getFullYear());

function invoicesInRange(startYmd, endYmd){
  return invoicesCache.filter(i => (i.invoiceDate >= startYmd && i.invoiceDate <= endYmd));
}

function summarizeInvoices(list){
  const sum = {
    count: list.length,
    base: 0, vat: 0, total: 0,
    vatByRate: { "0":0, "4":0, "10":0, "21":0 },
    baseByRate: { "0":0, "4":0, "10":0, "21":0 },
    topProviders: []
  };

  const byProv = new Map();

  for(const i of list){
    sum.base += safeNum(i.base);
    sum.vat += safeNum(i.vatAmount);
    sum.total += safeNum(i.total);

    const r = String(i.vatRate ?? 0);
    sum.vatByRate[r] = (sum.vatByRate[r] || 0) + safeNum(i.vatAmount);
    sum.baseByRate[r] = (sum.baseByRate[r] || 0) + safeNum(i.base);

    const key = i.providerName || "Proveedor";
    byProv.set(key, (byProv.get(key) || 0) + safeNum(i.total));
  }

  sum.base = +sum.base.toFixed(2);
  sum.vat = +sum.vat.toFixed(2);
  sum.total = +sum.total.toFixed(2);
  Object.keys(sum.vatByRate).forEach(k=> sum.vatByRate[k] = +sum.vatByRate[k].toFixed(2));
  Object.keys(sum.baseByRate).forEach(k=> sum.baseByRate[k] = +sum.baseByRate[k].toFixed(2));

  sum.topProviders = [...byProv.entries()]
    .sort((a,b)=> b[1]-a[1])
    .slice(0,5)
    .map(([name,total])=> ({ name, total:+total.toFixed(2) }));

  return sum;
}
function summarizeByCategory(invoiceList){
  const map = new Map(); // category -> { base, vat, total }

  for(const inv of invoiceList){
    const prov = providersCache.find(p => p.id === inv.providerId);
    const cat = (prov?.category || "Sin categoría").trim() || "Sin categoría";

    const cur = map.get(cat) || { base: 0, vat: 0, total: 0 };
    cur.base += safeNum(inv.base);
    cur.vat += safeNum(inv.vatAmount);
    cur.total += safeNum(inv.total);
    map.set(cat, cur);
  }

  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      base: +v.base.toFixed(2),
      vat: +v.vat.toFixed(2),
      total: +v.total.toFixed(2)
    }))
    .sort((a,b) => b.total - a.total);
}
function renderReport(title, periodLabel, list, summary){
  const out = $("#reportOut");
  out.innerHTML = "";

    const head = el("div");

  const avgPerInvoice = summary.count > 0 ? (summary.total / summary.count) : 0;
  const vatRatio = summary.base > 0 ? ((summary.vat / summary.base) * 100) : 0;

  head.innerHTML = `
    <div style="font-weight:900;font-size:18px;">${title}</div>
    <div class="muted">${periodLabel}</div>
    <div class="muted small" style="margin-top:6px;">
      Gasto medio por factura: <b>${money(avgPerInvoice)}</b> ·
      Ratio IVA/Base: <b>${vatRatio.toFixed(2)}%</b>
    </div>
  `;
  out.appendChild(head);
  out.appendChild(head);

  const totals = el("div","mt");
  totals.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div>
        <div class="item__title">Totales</div>
        <div class="item__meta">Facturas: ${summary.count}</div>
      </div>
      <div style="text-align:right">
        <div><b>Base:</b> ${money(summary.base)}</div>
        <div><b>IVA:</b> ${money(summary.vat)}</div>
        <div><b>Total:</b> ${money(summary.total)}</div>
      </div>
    </div>
  `;
  out.appendChild(totals);

    // --- Desglose IVA: mostrar solo tipos usados ---
  const vatBox = el("div","mt");

  const rates = ["0","4","10","21"];
  const usedRates = rates.filter(r => {
    const b = Number(summary.baseByRate?.[r] || 0);
    const v = Number(summary.vatByRate?.[r] || 0);
    return b > 0 || v > 0;
  });
function summarizeByProvider(invoiceList){
  const map = new Map(); // providerName -> { base, vat, total }

  for(const inv of invoiceList){
    const name = (inv.providerName || "Proveedor").trim() || "Proveedor";

    const cur = map.get(name) || { base: 0, vat: 0, total: 0 };
    cur.base += safeNum(inv.base);
    cur.vat += safeNum(inv.vatAmount);
    cur.total += safeNum(inv.total);
    map.set(name, cur);
  }

  return [...map.entries()]
    .map(([provider, v]) => ({
      provider,
      base: +v.base.toFixed(2),
      vat: +v.vat.toFixed(2),
      total: +v.total.toFixed(2)
    }))
    .sort((a,b) => b.total - a.total);
}
   const showRates = (usedRates.length ? usedRates : ["0"]);

  const vatRows = showRates.map(r => {
    const base = Number(summary.baseByRate?.[r] || 0);
    const vat = Number(summary.vatByRate?.[r] || 0);
    const tot = base + vat;

    return `
      <tr>
        <td style="padding:6px 8px; border-top:1px solid rgba(185,196,226,.25);">${r}%</td>
        <td style="padding:6px 8px; border-top:1px solid rgba(185,196,226,.25); text-align:right;">${money(base)}</td>
        <td style="padding:6px 8px; border-top:1px solid rgba(185,196,226,.25); text-align:right;">${money(vat)}</td>
        <td style="padding:6px 8px; border-top:1px solid rgba(185,196,226,.25); text-align:right;"><b>${money(tot)}</b></td>
      </tr>
    `;
  }).join("");

    vatBox.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div style="min-width:220px;">
        <div class="item__title">Desglose IVA</div>
        <div class="item__meta">Base, IVA y total por tipo</div>
      </div>
      <div style="flex:1;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(185,196,226,.35);">Tipo</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid rgba(185,196,226,.35);">Base</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid rgba(185,196,226,.35);">IVA</th>
              <th style="text-align:right; padding:6px 8px; border-bottom:1px solid rgba(185,196,226,.35);">Total</th>
            </tr>
          </thead>
          <tbody>
            ${vatRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
  out.appendChild(vatBox);

  const top = el("div","mt");
  const topList = summary.topProviders.map(t=> `<div>${t.name}: <b>${money(t.total)}</b></div>`).join("");
  top.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div>
        <div class="item__title">Top proveedores</div>
        <div class="item__meta">Top 5 por total</div>
      </div>
      <div style="text-align:right">${topList || "—"}</div>
    </div>
  `;
  out.appendChild(top);
  // --- Totales por categoría de proveedor ---
  const catSum = summarizeByCategory(list);

  const catBox = el("div","mt");
    const catLines = catSum.length
    ? catSum.map(c =>
        `<div>${c.category}: <b>${money(c.total)}</b><div class="muted small">Base ${money(c.base)} · IVA ${money(c.vat)}</div></div>`
      ).join("")
    : "—";

    // Si hay muchas categorías, por defecto lo dejamos plegado en pantalla
  const catDefaultOpen = catSum.length <= 6 ? "open" : "";

  catBox.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div>
        <div class="item__title">Totales por categoría</div>
        <div class="item__meta">Base e IVA por tipo de proveedor</div>
      </div>

      <div style="text-align:right">
        <details class="repDetails" ${catDefaultOpen}>
          <summary class="repSummary">Ver/ocultar desglose</summary>
          <div class="repContent" style="margin-top:8px;">
            ${catLines}
          </div>
        </details>
      </div>
    </div>
  `;
  out.appendChild(catBox);
    // --- Listado completo por proveedor ---
  const provSum = summarizeByProvider(list);

  const provBox = el("div","mt");
    const provLines = provSum.length
    ? provSum.map(p =>
        `<div>${p.provider}: <b>${money(p.total)}</b><div class="muted small">Base ${money(p.base)} · IVA ${money(p.vat)}</div></div>`
      ).join("")
    : "—";

   // Si hay muchos proveedores, por defecto lo dejamos plegado en pantalla
  const defaultOpen = provSum.length <= 8 ? "open" : "";

  provBox.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div>
        <div class="item__title">Listado por proveedor</div>
        <div class="item__meta">Total por proveedor (ordenado de mayor a menor)</div>
      </div>

      <div style="text-align:right">
        <details class="repDetails" ${defaultOpen}>
          <summary class="repSummary">Ver/ocultar listado completo</summary>
          <div class="repContent" style="margin-top:8px;">
            ${provLines}
          </div>
        </details>
      </div>
    </div>
  `;
  out.appendChild(provBox);
  const actions = el("div","row mt");
  const btnCsv = el("button","btn btn--secondary");
  btnCsv.textContent = "Exportar CSV";
  btnCsv.addEventListener("click", ()=> exportCsv(title, periodLabel, list, summary));

  const btnPdf = el("button","btn");
  btnPdf.textContent = "Generar PDF (Imprimir)";
    btnPdf.addEventListener("click", ()=>{
    const details = out.querySelectorAll("details.repDetails");
    const prev = [];

    details.forEach((d, idx) => {
      prev[idx] = d.open;
      d.open = true; // abrir todo para el PDF
    });

    const restore = () => {
      details.forEach((d, idx) => d.open = prev[idx]);
      window.removeEventListener("afterprint", restore);
    };

    window.addEventListener("afterprint", restore);
    window.print();
  });

  actions.appendChild(btnCsv);
  actions.appendChild(btnPdf);
  out.appendChild(actions);

  const detail = el("div","mt");
  detail.innerHTML = `<div class="muted small">Detalle de facturas incluidas: ${list.length}</div>`;
  out.appendChild(detail);
}

function exportCsv(title, periodLabel, list, summary){
  const rows = [];
  rows.push(["Informe", title].join(";"));
  rows.push(["Periodo", periodLabel].join(";"));
  rows.push(["Facturas", summary.count].join(";"));
  rows.push(["Base", summary.base].join(";"));
  rows.push(["IVA", summary.vat].join(";"));
  rows.push(["Total", summary.total].join(";"));
  rows.push([""].join(";"));
  rows.push(["Desglose IVA","Base","IVA"].join(";"));
  ["0","4","10","21"].forEach(r=>{
    rows.push([`${r}%`, summary.baseByRate[r]||0, summary.vatByRate[r]||0].join(";"));
      // Bloque “contable” en una sola fila (fácil de importar/copiar)
  const r0b = summary.baseByRate["0"] || 0,  r0v = summary.vatByRate["0"] || 0;
  const r4b = summary.baseByRate["4"] || 0,  r4v = summary.vatByRate["4"] || 0;
  const r10b = summary.baseByRate["10"] || 0, r10v = summary.vatByRate["10"] || 0;
  const r21b = summary.baseByRate["21"] || 0, r21v = summary.vatByRate["21"] || 0;

  rows.push(["Resumen por tipos (base/iva/total)"].join(";"));
  rows.push([
    "Base_0","IVA_0","Total_0",
    "Base_4","IVA_4","Total_4",
    "Base_10","IVA_10","Total_10",
    "Base_21","IVA_21","Total_21"
  ].join(";"));

  rows.push([
    r0b, r0v, (r0b + r0v),
    r4b, r4v, (r4b + r4v),
    r10b, r10v, (r10b + r10v),
    r21b, r21v, (r21b + r21v)
  ].join(";"));

  rows.push([""].join(";"));
  });
  rows.push([""].join(";"));
  rows.push(["Facturas incluidas"].join(";"));
  rows.push(["Fecha","Proveedor","Nº","Concepto","Base","IVA%","IVA","Total","Pago"].join(";"));

  for(const i of list){
    rows.push([
      i.invoiceDate||"",
      (i.providerName||"").replaceAll(";"," "),
      (i.invoiceNo||"").replaceAll(";"," "),
      (i.concept||"").replaceAll(";"," "),
      i.base ?? 0,
      i.vatRate ?? 0,
      i.vatAmount ?? 0,
      i.total ?? 0,
      i.paidDate ?? ""
    ].join(";"));
  }

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replaceAll(" ","_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function runMonthlyReport(yyyyMm){
  if(!yyyyMm) return toast("Elige un mes.", "err");
  const start = `${yyyyMm}-01`;
  const endDate = new Date(Number(yyyyMm.slice(0,4)), Number(yyyyMm.slice(5,7)), 0);
  const end = `${yyyyMm}-${String(endDate.getDate()).padStart(2,"0")}`;

  const list = invoicesInRange(start, end);
  const sum = summarizeInvoices(list);
  renderReport("Informe mensual OBRANTIS", `Mes: ${yyyyMm}`, list, sum);
}

function runQuarterReport(year, q){
  const { s, e } = quarterRange(year, q);
  const list = invoicesInRange(s, e);
  const sum = summarizeInvoices(list);
  renderReport("Informe trimestral OBRANTIS", `Año: ${year} · Q${q} (${s} a ${e})`, list, sum);
}

/* ---------------------------
   Boot refresh
----------------------------*/
async function refreshAll(){
  await fetchProviders();
  await fetchInvoices();

  // Rellenar filtro de proveedor en pestaña Facturas
  const invProv = $("#invProvider");
  if(invProv){
    invProv.innerHTML = `<option value="">Todos los proveedores</option>`;
    const list = [...providersCache]
      .sort((a,b)=>(a.nameCommercial||"").localeCompare(b.nameCommercial||""));

    for(const p of list){
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.nameCommercial || p.legalName || p.id;
      invProv.appendChild(o);
    }
  }

  renderProviders();
  renderInvoices();
}

/* Defaults */
$("#invMonth").value = monthToday();
