// QuickWorkout: lista de rutinas, importación de CSV y temporizador.
(function () {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const plugin = name => (isNative && Cap.Plugins && Cap.Plugins[name]) || null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Almacenamiento ----------
  const KEY = "rutinas.v1";
  async function loadState() {
    let raw = null;
    try {
      const P = plugin("Preferences");
      raw = P ? (await P.get({ key: KEY })).value : localStorage.getItem(KEY);
    } catch (e) { /* sin almacenamiento */ }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  async function saveState() {
    const raw = JSON.stringify(state);
    try {
      const P = plugin("Preferences");
      if (P) await P.set({ key: KEY, value: raw }); else localStorage.setItem(KEY, raw);
    } catch (e) { toast("No se pudo guardar."); }
  }

  let state = { routines: [], beep: true };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const byId = id => state.routines.find(r => r.id === id);

  // ---------- Utilidades ----------
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function itemTime(it) { return (it.segundos + it.transicion) * it.lados; }
  function routineTime(r) { return r.items.reduce((a, it) => a + itemTime(it), 0); }
  function sideLabel(n, s) { return n === 2 ? ["Lado izquierdo", "Lado derecho"][s] : n > 2 ? `Serie ${s + 1} de ${n}` : ""; }
  function amount(it) { return it.lados === 2 ? `${it.segundos}" por lado` : it.lados > 2 ? `${it.lados} × ${it.segundos}"` : `${it.segundos}"`; }
  function groups(items) {
    const out = [];
    items.forEach((it, k) => {
      const last = out[out.length - 1];
      if (last && last.bloque === it.bloque) last.items.push([it, k]);
      else out.push({ bloque: it.bloque, items: [[it, k]] });
    });
    return out;
  }
  function uniqueName(base) {
    let name = base, n = 2;
    while (state.routines.some(r => r.name === name)) name = `${base} (${n++})`;
    return name;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // Diálogo propio (confirmación o texto).
  function ask(msg, { input = null, ok = "Aceptar", cancel = "Cancelar" } = {}) {
    return new Promise(resolve => {
      const d = $("dlg"), inp = $("dlg-input");
      $("dlg-msg").textContent = msg;
      $("dlg-ok").textContent = ok;
      $("dlg-cancel").textContent = cancel;
      $("dlg-cancel").hidden = cancel === null;
      inp.hidden = input === null; inp.value = input ?? "";
      d.onclose = () => resolve(d.returnValue === "ok" ? (input === null ? true : inp.value.trim()) : null);
      d.returnValue = "";
      d.showModal();
      if (input !== null) { inp.focus(); inp.select(); }
    });
  }
  $("dlg-form").addEventListener("submit", e => {
    // Enter dentro del campo de texto equivale a Aceptar.
    if (!e.submitter) { e.preventDefault(); $("dlg").close("ok"); }
  });

  // ---------- Vistas ----------
  function show(view) {
    ["v-home", "v-detail", "v-edit", "v-player"].forEach(v => { $(v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const ul = $("routines");
    ul.innerHTML = "";
    state.routines.forEach(r => {
      const li = document.createElement("li");
      li.innerHTML = `<a class="card" href="#r-${r.id}"><span><b>${esc(r.name)}</b><small>${r.items.length} ${r.items.length === 1 ? "ejercicio" : "ejercicios"}</small></span><span class="dur">${fmt(routineTime(r))}</span></a>`;
      ul.appendChild(li);
    });
    $("empty").hidden = state.routines.length > 0;
    show("v-home");
  }

  function blocksHTML(r, clickable) {
    return groups(r.items).map(g => {
      const t = g.items.reduce((a, [it]) => a + itemTime(it), 0);
      return `<li class="grp"><h3><span>${esc(g.bloque || "Ejercicios")}</span><span>${fmt(t)}</span></h3><ul>` +
        g.items.map(([it, k]) => `<li data-item="${k}"><span>${esc(it.ejercicio)}</span><span class="r">${amount(it)}</span></li>`).join("") +
        `</ul></li>`;
    }).join("");
  }

  let current = null;
  function renderDetail(r) {
    current = r;
    $("d-name").textContent = r.name;
    $("d-meta").textContent = `${r.items.length} ${r.items.length === 1 ? "ejercicio" : "ejercicios"} · ${fmt(routineTime(r))} en total`;
    $("d-blocks").innerHTML = `<ol class="blocks">${blocksHTML(r)}</ol>`;
    show("v-detail");
  }

  $("d-start").onclick = () => { location.hash = "p-" + current.id; };
  $("d-edit").onclick = () => { location.hash = "e-" + current.id; };
  $("d-dup").onclick = async () => {
    const r = { id: uid(), name: uniqueName(current.name + " (copia)"), items: current.items.map(it => ({ ...it })) };
    state.routines.push(r);
    await saveState(); toast(`Creada "${r.name}"`); location.hash = "e-" + r.id;
  };
  $("d-delete").onclick = async () => {
    const yes = await ask(`¿Borrar "${current.name}"? No se puede deshacer.`, { ok: "Borrar" });
    if (!yes) return;
    state.routines = state.routines.filter(r => r !== current);
    await saveState(); location.hash = "";
  };
  $("d-export").onclick = async () => {
    const csv = RoutineCSV.toCSV(current.items);
    const file = current.name.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_") + ".csv";
    const FS = plugin("Filesystem"), Share = plugin("Share");
    try {
      if (FS && Share) {
        const res = await FS.writeFile({ path: file, data: csv, directory: "CACHE", encoding: "utf8" });
        await Share.share({ title: current.name, files: [res.uri] });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = file; document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) toast("No se pudo exportar: " + (e && e.message || e));
    }
  };


  // ---------- Crear / editar ----------
  let draft = null, editing = null;
  const blank = () => ({ bloque: "", ejercicio: "", detalle: "", segundos: 30, lados: 1, transicion: RoutineCSV.DEFAULT_TRANSITION });

  function renderEditor(r) {
    editing = r;
    draft = r ? r.items.map(it => ({ ...it })) : [blank()];
    $("e-title").textContent = r ? "Editar rutina" : "Nueva rutina";
    $("e-name").value = r ? r.name : "";
    $("e-back").href = r ? "#r-" + r.id : "#";
    drawItems();
    show("v-edit");
    if (!r) $("e-name").focus();
  }

  function drawItems() {
    const blocks = [...new Set(draft.map(it => it.bloque).filter(Boolean))];
    $("e-blocks").innerHTML = blocks.map(b => `<option value="${esc(b)}">`).join("");
    $("e-items").innerHTML = draft.map((it, k) => `
      <li class="ex" data-k="${k}">
        <div class="head"><b>${k + 1}</b><span class="tools">
          <button class="btn" data-act="up" aria-label="Subir" ${k === 0 ? "disabled" : ""}>↑</button>
          <button class="btn" data-act="down" aria-label="Bajar" ${k === draft.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn" data-act="copy" aria-label="Duplicar">⧉</button>
          <button class="btn danger" data-act="del" aria-label="Quitar">✕</button>
        </span></div>
        <label class="field wide"><span>Ejercicio</span><input data-f="ejercicio" value="${esc(it.ejercicio)}" placeholder="Plancha"></label>
        <label class="field wide"><span>Detalle</span><input data-f="detalle" value="${esc(it.detalle)}" placeholder="Opcional: repeticiones, indicaciones…"></label>
        <label class="field wide"><span>Bloque</span><input data-f="bloque" list="e-blocks" value="${esc(it.bloque)}" placeholder="Opcional: Movilidad, Core…"></label>
        <label class="field"><span>Segundos</span><input data-f="segundos" type="number" inputmode="numeric" min="1" value="${it.segundos}"></label>
        <label class="field"><span>Lados</span><select data-f="lados">
          <option value="1"${it.lados === 1 ? " selected" : ""}>1</option>
          <option value="2"${it.lados === 2 ? " selected" : ""}>2</option>
          ${it.lados > 2 ? `<option value="${it.lados}" selected>${it.lados}</option>` : ""}
        </select></label>
        <label class="field"><span>Transición</span><input data-f="transicion" type="number" inputmode="numeric" min="0" value="${it.transicion}"></label>
      </li>`).join("");
    updateEditMeta();
  }

  function updateEditMeta() {
    const t = draft.reduce((a, it) => a + ((Number(it.segundos) || 0) + (Number(it.transicion) || 0)) * (Number(it.lados) || 1), 0);
    $("e-meta").textContent = `${draft.length} ${draft.length === 1 ? "ejercicio" : "ejercicios"} · ${fmt(t)} en total`;
  }

  $("e-items").addEventListener("input", e => {
    const f = e.target.dataset.f; if (!f) return;
    const it = draft[Number(e.target.closest(".ex").dataset.k)];
    it[f] = ["segundos", "lados", "transicion"].includes(f) ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
    e.target.closest(".ex").classList.remove("invalid");
    updateEditMeta();
  });
  $("e-items").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const k = Number(b.closest(".ex").dataset.k), a = b.dataset.act;
    if (a === "up" && k > 0) [draft[k - 1], draft[k]] = [draft[k], draft[k - 1]];
    if (a === "down" && k < draft.length - 1) [draft[k + 1], draft[k]] = [draft[k], draft[k + 1]];
    if (a === "copy") draft.splice(k + 1, 0, { ...draft[k] });
    if (a === "del") { draft.splice(k, 1); if (!draft.length) draft.push(blank()); }
    drawItems();
  });
  $("e-add").onclick = () => {
    const prev = draft[draft.length - 1];
    draft.push({ ...blank(), bloque: prev ? prev.bloque : "", transicion: prev ? prev.transicion : RoutineCSV.DEFAULT_TRANSITION });
    drawItems();
    const items = $("e-items").querySelectorAll(".ex");
    const lastEl = items[items.length - 1];
    lastEl.scrollIntoView({ behavior: "smooth", block: "center" });
    lastEl.querySelector('[data-f="ejercicio"]').focus();
  };
  $("e-cancel").onclick = () => { location.hash = editing ? "r-" + editing.id : ""; };
  $("e-save").onclick = async () => {
    const name = $("e-name").value.trim();
    const items = draft.map(it => ({
      bloque: String(it.bloque || "").trim(), ejercicio: String(it.ejercicio || "").trim(), detalle: String(it.detalle || "").trim(),
      segundos: Math.round(Number(it.segundos)), lados: Math.round(Number(it.lados)) || 1, transicion: Math.round(Number(it.transicion))
    }));
    const bad = [];
    items.forEach((it, k) => {
      if (!it.ejercicio || !(it.segundos > 0) || !(it.transicion >= 0)) bad.push(k);
    });
    document.querySelectorAll("#e-items .ex").forEach(el => el.classList.toggle("invalid", bad.includes(Number(el.dataset.k))));
    if (!name) { toast("Ponle un nombre a la rutina."); $("e-name").focus(); return; }
    if (bad.length) {
      toast(`Revisa ${bad.length === 1 ? "el ejercicio " + (bad[0] + 1) : "los ejercicios " + bad.map(k => k + 1).join(", ")}: necesita nombre, segundos mayor que 0 y transición de 0 o más.`);
      document.querySelector("#e-items .ex.invalid").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    let r = editing;
    if (r) {
      if (name !== r.name) r.name = uniqueName(name);
      r.items = items;
    } else {
      r = { id: uid(), name: uniqueName(name), items };
      state.routines.push(r);
    }
    await saveState();
    toast("Guardada");
    location.hash = "r-" + r.id;
  };

  // ---------- Importar ----------
  $("file").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = RoutineCSV.decode(await f.arrayBuffer());
      const { items, errors } = RoutineCSV.parseRoutine(text);
      if (errors.length) {
        const shown = errors.slice(0, 6).join("\n") + (errors.length > 6 ? `\n… y ${errors.length - 6} más.` : "");
        await ask(`No se ha importado "${f.name}":\n\n${shown}`, { ok: "Entendido", cancel: null });
        return;
      }
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Rutina";
      const r = { id: uid(), name: uniqueName(base), items };
      state.routines.push(r);
      await saveState();
      toast(`Importada "${r.name}"`);
      location.hash = "r-" + r.id;
    } catch (err) {
      toast("No se pudo leer el archivo.");
    }
  });

  // ---------- Temporizador ----------
  const C = 2 * Math.PI * 52;
  $("p-prog").style.strokeDasharray = C;
  let steps = [], total = 0, i = 0, phase = "prep", left = 0, running = false, last = 0, ac = null;

  function buildSteps(r) {
    steps = [];
    r.items.forEach((it, k) => {
      for (let s = 0; s < it.lados; s++) steps.push({ k, it, side: sideLabel(it.lados, s), prep: it.transicion, dur: it.segundos });
    });
    total = steps.reduce((a, s) => a + s.prep + s.dur, 0);
  }
  function startStep(k) {
    i = k; const s = steps[i];
    if (s.prep > 0) { phase = "prep"; left = s.prep; } else { phase = "work"; left = s.dur; }
  }
  function elapsed() {
    let e = 0;
    for (let k = 0; k < i; k++) e += steps[k].prep + steps[k].dur;
    const s = steps[i];
    return e + (phase === "prep" ? s.prep - left : s.prep + s.dur - left);
  }
  const isRest = it => /^descanso$/i.test(it.ejercicio.trim());

  function renderPlayer() {
    const s = steps[i], it = s.it;
    const prep = phase === "prep";
    $("p-stage").classList.toggle("prep", prep || isRest(it));
    $("p-block").textContent = prep ? (elapsed() === 0 ? "Prepárate" : "Siguiente") : (it.bloque || "Ejercicio");
    $("p-name").textContent = it.ejercicio;
    $("p-side").textContent = s.side;
    $("p-hint").textContent = it.detalle;
    const d = prep ? s.prep : s.dur;
    $("p-secs").textContent = Math.ceil(left);
    $("p-unit").textContent = prep ? "para empezar" : "segundos";
    $("p-prog").style.strokeDashoffset = C * (1 - left / d);
    const n = steps[i + 1];
    $("p-next").innerHTML = n ? `Después: <b>${esc(n.it.ejercicio)}</b>${n.side ? " · " + esc(n.side.toLowerCase()) : ""}` : "Último ejercicio";
    const e = elapsed();
    $("p-bar").style.width = (e / total * 100) + "%";
    $("p-total").textContent = fmt(e) + " / " + fmt(total);
    document.querySelectorAll("#p-list li[data-item]").forEach(li => {
      const k = Number(li.dataset.item);
      li.classList.toggle("cur", k === s.k);
      li.classList.toggle("done", k < s.k);
    });
    $("p-play").textContent = running ? "Pausa" : (e > 0 ? "Seguir" : "Empezar");
  }

  function tone(f, ms) {
    if (!state.beep || !ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + ms / 1000);
      o.start(); o.stop(ac.currentTime + ms / 1000);
    } catch (e) { /* sin audio */ }
  }

  let wakeLock = null;
  async function keepAwake(on) {
    const K = plugin("KeepAwake");
    try {
      if (K) { on ? await K.keepAwake() : await K.allowSleep(); return; }
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* opcional */ }
  }

  function finish() {
    running = false; keepAwake(false);
    tone(990, 700);
    $("p-block").textContent = "Terminado";
    $("p-name").textContent = "Rutina completada";
    $("p-side").textContent = ""; $("p-hint").textContent = ""; $("p-next").textContent = "";
    $("p-secs").textContent = "0"; $("p-prog").style.strokeDashoffset = 0;
    $("p-bar").style.width = "100%"; $("p-total").textContent = fmt(total) + " / " + fmt(total);
    $("p-play").textContent = "Repetir";
    startStep(0); finished = true;
  }
  let finished = false;

  function tick(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1); last = now;
    const before = Math.ceil(left); left -= dt; const after = Math.ceil(left);
    if (after !== before && after <= 3 && after > 0) tone(660, 120);
    if (left <= 0) {
      if (phase === "prep") { phase = "work"; left = steps[i].dur; tone(990, 300); }
      else if (i < steps.length - 1) { startStep(i + 1); tone(phase === "prep" ? 520 : 990, 250); }
      else { finish(); return; }
    }
    renderPlayer(); requestAnimationFrame(tick);
  }

  function setRunning(on) {
    if (on && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (on && ac && ac.state === "suspended") ac.resume();
    if (on && finished) { finished = false; startStep(0); }
    running = on;
    keepAwake(on);
    if (on) { last = performance.now(); requestAnimationFrame(tick); }
    renderPlayer();
  }
  function go(k) { if (k < 0 || k >= steps.length) return; finished = false; startStep(k); renderPlayer(); }

  $("p-play").onclick = () => setRunning(!running);
  $("p-skip").onclick = () => go(i + 1);
  $("p-prev").onclick = () => go(phase === "work" && left < steps[i].dur - 2 ? i : i - 1);
  $("p-reset").onclick = () => { setRunning(false); go(0); };
  $("p-beep").onchange = e => { state.beep = e.target.checked; saveState(); };
  $("p-list").addEventListener("click", e => {
    const li = e.target.closest("li[data-item]");
    if (li) go(steps.findIndex(s => s.k === Number(li.dataset.item)));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && running) setRunning(false); });

  function renderPlayerView(r) {
    current = r;
    buildSteps(r); finished = false; startStep(0); running = false;
    $("p-title").textContent = r.name;
    $("p-back").href = "#r-" + r.id;
    $("p-beep").checked = state.beep !== false;
    $("p-list").innerHTML = blocksHTML(r);
    show("v-player"); renderPlayer();
  }

  // ---------- Navegación ----------
  function route() {
    if (running) setRunning(false);
    const h = location.hash.slice(1);
    if (h === "e-new") return renderEditor(null);
    const m = h.match(/^([rpe])-(.+)$/);
    const r = m && byId(m[2]);
    if (r && m[1] === "r") renderDetail(r);
    else if (r && m[1] === "e") renderEditor(r);
    else if (r && m[1] === "p") renderPlayerView(r);
    else renderHome();
  }
  window.addEventListener("hashchange", route);

  // ---------- Arranque ----------
  (async function init() {
    const saved = await loadState();
    if (saved && Array.isArray(saved.routines)) state = Object.assign(state, saved);
    if (!saved || !saved.seeded) {
      const { items } = RoutineCSV.parseRoutine(window.DEFAULT_ROUTINE.csv);
      if (items.length) state.routines.unshift({ id: uid(), name: uniqueName(window.DEFAULT_ROUTINE.name), items });
      state.seeded = true;
      await saveState();
    }
    route();
  })();
})();
