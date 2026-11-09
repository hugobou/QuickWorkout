// Lectura y escritura de rutinas en CSV.
(function () {
  const COLS = ["bloque", "ejercicio", "detalle", "segundos", "lados", "transicion"];
  const DEFAULT_TRANSITION = 5;

  // Decodifica bytes: UTF-8 si es válido, si no Windows-1252 (CSV guardado desde Excel).
  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (e) { text = new TextDecoder("windows-1252").decode(bytes); }
    return text.replace(/^﻿/, "");
  }

  function detectDelimiter(text) {
    const first = text.split(/\r?\n/).find(l => l.trim()) || "";
    const count = ch => (first.match(new RegExp("\\" + ch, "g")) || []).length;
    const semi = count(";"), comma = count(","), tab = count("\t");
    if (tab > semi && tab > comma) return "\t";
    return semi >= comma ? ";" : ",";
  }

  // Parser CSV con comillas ("" escapa una comilla).
  function parseRows(text, delim) {
    const rows = []; let row = []; let field = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(f => f.trim() !== ""));
  }

  const norm = s => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function toNumber(v) {
    const s = String(v).trim().replace(",", ".");
    if (s === "") return NaN;
    return Number(s);
  }

  // Devuelve { items, errors }.
  function parseRoutine(text) {
    const delim = detectDelimiter(text);
    const rows = parseRows(text, delim);
    const errors = [];
    if (rows.length < 2) return { items: [], errors: ["El archivo no tiene filas de ejercicios."] };
    const header = rows[0].map(norm);
    const idx = {};
    COLS.forEach(c => { idx[c] = header.indexOf(c); });
    if (idx.ejercicio < 0) errors.push('Falta la columna "ejercicio".');
    if (idx.segundos < 0) errors.push('Falta la columna "segundos".');
    if (errors.length) return { items: [], errors };
    const get = (r, c) => (idx[c] >= 0 && r[idx[c]] != null ? r[idx[c]].trim() : "");
    const items = [];
    rows.slice(1).forEach((r, k) => {
      const line = k + 2;
      const ejercicio = get(r, "ejercicio");
      const segundos = toNumber(get(r, "segundos"));
      const ladosRaw = get(r, "lados");
      const transRaw = get(r, "transicion");
      const lados = ladosRaw === "" ? 1 : toNumber(ladosRaw);
      const transicion = transRaw === "" ? DEFAULT_TRANSITION : toNumber(transRaw);
      if (!ejercicio) errors.push(`Fila ${line}: falta el nombre del ejercicio.`);
      if (!(segundos > 0)) errors.push(`Fila ${line}: "segundos" debe ser un número mayor que 0.`);
      if (!(Number.isInteger(lados) && lados >= 1 && lados <= 10)) errors.push(`Fila ${line}: "lados" debe ser 1, 2 o un número entero hasta 10.`);
      if (!(transicion >= 0)) errors.push(`Fila ${line}: "transicion" debe ser 0 o más.`);
      items.push({ bloque: get(r, "bloque"), ejercicio, detalle: get(r, "detalle"),
        segundos: Math.round(segundos), lados, transicion: Math.round(transicion) });
    });
    if (!items.length) errors.push("El archivo no tiene filas de ejercicios.");
    return { items: errors.length ? [] : items, errors };
  }

  function quote(v) {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(items) {
    const lines = [COLS.join(";")];
    items.forEach(it => lines.push(COLS.map(c => quote(it[c])).join(";")));
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  window.RoutineCSV = { decode, parseRoutine, toCSV, DEFAULT_TRANSITION };
})();
