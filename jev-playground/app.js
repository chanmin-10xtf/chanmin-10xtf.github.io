(() => {
  "use strict";

  const API = "https://openrouter.ai/api/alpha/decisions";
  const MODEL = "typesafe/jev-1.13";
  const SCENARIOS = window.SCENARIOS;
  const TYPES = ["noul", "choice", "score"];
  const $ = (sel, root = document) => root.querySelector(sel);

  // ─── 저장소 — 사생활 모드·차단 환경에서도 페이지가 돌아가게 전부 감싼다 ───
  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch { /* 저장 불가 — 메모리로만 쓴다 */ } },
    del(area, k) { try { window[area].removeItem(k); } catch { /* noop */ } },
  };

  // ─── DOM 헬퍼 — 입력값은 전부 textContent 로 넣는다 ───
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const pretty = (v) => JSON.stringify(v, null, 2);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const fmt = (x, d = 2) => (Number.isInteger(x) ? String(x) : x.toFixed(d));
  const typesOf = (sc) => TYPES.filter((t) => Object.values(sc.questions).some((q) => q.type === t));
  const shapeOf = (v) => (typeof v === "string" ? "문자열" : Array.isArray(v) ? "배열" : "객체");

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ─── 키 ───
  const keyInput = $("#key");
  const remember = $("#remember");
  const keyState = $("#key-state");
  let apiKey = store.get("localStorage", "jev.key") || store.get("sessionStorage", "jev.key") || "";
  remember.checked = Boolean(store.get("localStorage", "jev.key"));
  keyInput.value = apiKey;

  function syncKey() {
    apiKey = keyInput.value.trim();
    const on = apiKey.length > 0;
    keyState.textContent = on ? "키 입력됨" : "키 없음";
    keyState.className = `key-state ${on ? "on" : "off"}`;
    if (remember.checked && on) store.set("localStorage", "jev.key", apiKey);
    else store.del("localStorage", "jev.key");
    if (on) store.set("sessionStorage", "jev.key", apiKey);
    else store.del("sessionStorage", "jev.key");
    document.querySelectorAll("[data-needs-key]").forEach((b) => { b.disabled = !on; });
  }
  keyInput.addEventListener("input", syncKey);
  remember.addEventListener("change", () => {
    syncKey();
    toast(remember.checked ? "이 브라우저에 키를 기억합니다" : "이 탭을 닫으면 키를 잊습니다");
  });

  // ─── 테마 ───
  const themes = ["auto", "light", "dark"];
  const themeLabel = { auto: "테마: 시스템", light: "테마: 밝게", dark: "테마: 어둡게" };
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    $("#theme-btn").textContent = themeLabel[t];
  }
  let theme = store.get("localStorage", "jev.theme") || "auto";
  applyTheme(theme);
  $("#theme-btn").addEventListener("click", () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    store.set("localStorage", "jev.theme", theme);
    applyTheme(theme);
  });

  // ─── 목록 · 타입 필터 ───
  const rail = $("#rail");
  const menuBtn = $("#menu-btn");
  let typeFilter = "all";
  let current = null;

  function renderTypes() {
    const box = $("#types");
    box.replaceChildren();
    [["all", "전체"], ...TYPES.map((t) => [t, t])].forEach(([v, label]) => {
      const n = v === "all" ? SCENARIOS.length : SCENARIOS.filter((s) => typesOf(s).includes(v)).length;
      box.append(h("button", {
        type: "button", "aria-pressed": String(typeFilter === v), title: `${label} (${n})`,
        onclick: () => { typeFilter = v; renderTypes(); renderList($("#search").value); },
      }, h("span", { text: label }), h("small", { text: String(n) })));
    });
  }

  function renderList(filter = "") {
    const list = $("#list");
    list.replaceChildren();
    const q = filter.trim().toLowerCase();
    // 시나리오가 파일 두 곳에 나뉘어 있어 같은 분류가 흩어진다 — 첫 등장 순서대로 분류별로 모은다.
    const cats = [...new Set(SCENARIOS.map((s) => s.cat))];
    cats.forEach((cat) => {
      const rows = SCENARIOS.filter((sc) => {
        if (sc.cat !== cat) return false;
        const types = typesOf(sc);
        if (typeFilter !== "all" && !types.includes(typeFilter)) return false;
        return !q || `${sc.title} ${sc.blurb} ${sc.cat} ${types.join(" ")}`.toLowerCase().includes(q);
      });
      if (!rows.length) return;
      list.append(h("div", { class: "cat", text: cat }));
      rows.forEach((sc) => { const types = typesOf(sc); list.append(h("button", {
        class: "sc-link", type: "button", "data-id": sc.id,
        "aria-current": String(current?.id === sc.id),
        onclick: () => { location.hash = sc.id; closeRail(); },
      }, h("span", { text: sc.title }), h("span", { class: "sc-types" }, types.map((t) => h("span", { class: "t", text: t }))))); });
    });
    if (!list.children.length) list.append(h("p", { class: "rail-foot", text: "맞는 시나리오가 없습니다." }));
  }
  $("#search").addEventListener("input", (e) => renderList(e.target.value));

  function closeRail() { rail.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", () => {
    const open = !rail.classList.contains("open");
    rail.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  // 모바일 목록 서랍은 바깥을 누르거나 Esc 로 닫는다.
  document.addEventListener("click", (e) => {
    if (rail.classList.contains("open") && !rail.contains(e.target) && !menuBtn.contains(e.target)) closeRail();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && rail.classList.contains("open")) { closeRail(); menuBtn.focus(); } });

  // ─── 호출 ───
  async function ask(state, questions) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const t0 = performance.now();
    try {
      const res = await fetch(API, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Jev Playground" },
        body: JSON.stringify({ model: MODEL, state, questions }),
      });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* 본문이 JSON 이 아님 */ }
      if (!res.ok) {
        const detail = body?.error?.message || body?.message || text.slice(0, 300) || res.statusText;
        const hint = {
          401: "키가 올바르지 않습니다. OpenRouter 키를 다시 확인하세요.",
          402: "OpenRouter 크레딧이 부족합니다.",
          429: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        }[res.status];
        throw new Error(`HTTP ${res.status} — ${hint ? hint + " " : ""}${detail}`);
      }
      return { body, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      if (e.name === "AbortError") throw new Error("30초 안에 응답이 없어 중단했습니다.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── 게이지 — 판정 규칙이 쓰는 값 하나를 가로 막대와 기준선으로 ───
  function gaugeFor(sc, questions, answers) {
    const g = sc.gauge;
    const a = answers?.[g.q];
    if (!a) return null;
    let value, range, label, display;
    if (a.type === "noul") { value = a.noul; range = [0, 1]; label = `${g.q} · 예일 확률`; display = pct(a.noul); }
    else if (a.type === "score") {
      const n = Array.isArray(questions[g.q]?.criteria) ? questions[g.q].criteria.length : 2;
      value = a.score; range = g.range || [0, n - 1]; label = `${g.q} · 점수`; display = fmt(a.score);
    } else if (a.type === "choice") { value = a.confidence; range = [0, 1]; label = `${g.q} · 「${a.choice}」 확신`; display = pct(a.confidence); }
    else return null;
    const [lo, hi] = range;
    const pos = (x) => `${Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1))) * 100}%`;
    const asLabel = (x) => (hi === 1 ? pct(x) : fmt(x, 1));
    return h("div", { class: "gauge" },
      h("div", { class: "gauge-top" }, h("span", { text: label }), h("b", { text: display })),
      h("div", { class: "g-track", role: "img", "aria-label": `${label} ${display}` },
        h("div", { class: "g-fill", style: `width:${pos(value)}` }),
        g.thresholds.map((th) => h("i", { class: "g-tick", style: `left:${pos(th)}`, title: `기준선 ${asLabel(th)}` }))),
      h("div", { class: "g-scale" },
        h("span", { class: "edge-l", style: "left:0", text: asLabel(lo) }),
        g.thresholds.map((th) => h("span", { style: `left:${pos(th)}`, text: asLabel(th) })),
        h("span", { class: "edge-r", style: "left:100%", text: asLabel(hi) })));
  }

  // 타입별 응답 형식 설명 — 어떤 필드를 읽으면 되는지 카드마다 적는다.
  const FORMAT = {
    noul: ["noul", "= “예(true)” 일 확률"],
    choice: ["choice", "= 고른 보기 · probabilities = 보기별 확률 · confidence = 고른 답에 몰린 정도"],
    score: ["score", "= 등급의 기대값(소수) · probabilities = 등급별 확률 · legend = 등급 설명"],
  };

  function barRow(name, p, top) {
    return h("div", { class: `bar-row${top ? " top" : ""}`, title: name },
      h("span", { class: "nm", text: name }),
      h("span", { class: "bar" }, h("i", { style: `width:${Math.max(0, Math.min(1, p)) * 100}%` })),
      h("span", { class: "pct", text: pct(p) }));
  }

  function answerCard(name, a) {
    const val = a.type === "noul" ? pct(a.noul) : a.type === "score" ? fmt(a.score) : a.type === "choice" ? a.choice : "";
    const f = FORMAT[a.type];
    const card = h("div", { class: "ans" },
      h("div", { class: "ans-head" },
        h("span", {}, h("span", { class: "ans-name", text: name }), " ", h("span", { class: "t", text: a.type })),
        h("span", { class: "ans-val", text: val })),
      f ? h("div", { class: "ans-fmt" }, h("code", { text: f[0] }), ` ${f[1]}`) : null);
    if (a.type === "noul") {
      card.append(barRow("true", a.noul, a.noul >= 0.5), barRow("false", 1 - a.noul, a.noul < 0.5));
    } else if (a.probabilities) {
      // 점수는 등급 순서(0, 1, 2 …)가 의미라 그대로 두고, 보기 고르기만 확률순으로 정렬한다.
      const entries = a.type === "score"
        ? Object.entries(a.probabilities).sort((x, y) => Number(x[0]) - Number(y[0]))
        : Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
      const topKey = a.type === "choice" ? a.choice : [...entries].sort((x, y) => y[1] - x[1])[0]?.[0];
      entries.forEach(([k, p]) => {
        // criteria 가 이미 "0: …" 처럼 번호로 시작하면 번호를 다시 붙이지 않는다.
        const lg = a.type === "score" ? a.legend?.[k] : null;
        const label = lg ? (lg.trim().startsWith(k) ? lg : `${k} · ${lg}`) : k;
        card.append(barRow(label, p, k === String(topKey)));
      });
      if (a.confidence != null) card.append(h("div", { class: "legend", text: `confidence ${pct(a.confidence)}` }));
    }
    return card;
  }

  // ─── 시나리오 화면 ───
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch { toast("복사하지 못했습니다 — 브라우저가 클립보드 접근을 막았습니다"); }
  }
  function curlFor(state, questions) {
    const body = JSON.stringify({ model: MODEL, state, questions }, null, 2).replace(/'/g, "'\\''");
    return `curl ${API} \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  }
  const decideSafe = (sc, answers) => { try { return sc.decide(answers); } catch { return null; } };

  function renderScenario(sc) {
    current = sc;
    let sampleIndex = 0;
    let mode = "json"; // json | text — text 는 입력을 그대로 문자열 state 로 보낸다
    const root = $("#scenario");

    const stateTa = h("textarea", { class: "editor", spellcheck: "false", "aria-label": "state 입력" });
    const stateErr = h("div", { class: "err", role: "alert" });
    const qTa = h("textarea", { class: "editor q", spellcheck: "false", "aria-label": "questions(JSON)" });
    const qErr = h("div", { class: "err", role: "alert" });
    qTa.value = pretty(sc.questions);
    const result = h("div", { class: "card-body" });
    const batchBox = h("div");
    const shapeTag = h("span", { class: "hint" });

    const segJson = h("button", { type: "button", text: "JSON", onclick: () => setMode("json") });
    const segText = h("button", { type: "button", text: "텍스트", onclick: () => setMode("text") });
    function paintMode() {
      segJson.setAttribute("aria-pressed", String(mode === "json"));
      segText.setAttribute("aria-pressed", String(mode === "text"));
      let shape = "문자열";
      if (mode === "json") { try { shape = shapeOf(JSON.parse(stateTa.value)); } catch { shape = "JSON 형식 오류"; } }
      shapeTag.textContent = `state: ${shape}`;
    }
    function setMode(next) {
      if (next === mode) return;
      if (next === "text") {
        try { const v = JSON.parse(stateTa.value); stateTa.value = typeof v === "string" ? v : stateTa.value; } catch { /* 그대로 둔다 */ }
      } else {
        stateTa.value = pretty(stateTa.value);
      }
      mode = next;
      stateTa.classList.remove("bad");
      stateErr.textContent = "";
      paintMode();
    }
    stateTa.addEventListener("input", paintMode);

    const chips = h("div", { class: "samples", role: "group", "aria-label": "샘플 입력" });
    function loadSample(i) {
      sampleIndex = i;
      const st = sc.samples[i].state;
      mode = typeof st === "string" ? "text" : "json";
      stateTa.value = typeof st === "string" ? st : pretty(st);
      stateTa.classList.remove("bad");
      stateErr.textContent = "";
      [...chips.children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === i)));
      paintMode();
    }
    sc.samples.forEach((s, i) => chips.append(h("button", { class: "chip", type: "button", onclick: () => loadSample(i), text: s.label })));
    const sampleText = (i) => (typeof sc.samples[i].state === "string" ? sc.samples[i].state : pretty(sc.samples[i].state));

    function readState() {
      if (mode === "text") return stateTa.value;
      try { const v = JSON.parse(stateTa.value); stateTa.classList.remove("bad"); stateErr.textContent = ""; return v; }
      catch (e) { stateTa.classList.add("bad"); stateErr.textContent = `state JSON 형식 오류: ${e.message} — 그냥 글을 보내려면 「텍스트」를 고르세요.`; return undefined; }
    }
    function readQuestions() {
      try { const v = JSON.parse(qTa.value); qTa.classList.remove("bad"); qErr.textContent = ""; return v; }
      catch (e) { qTa.classList.add("bad"); qErr.textContent = `questions JSON 형식 오류: ${e.message}`; return undefined; }
    }

    const qSummary = h("div", { class: "qsum" });
    const refreshQSummary = () => {
      qSummary.replaceChildren();
      try { Object.entries(JSON.parse(qTa.value)).forEach(([k, v]) => qSummary.append(h("span", { class: "qtag", text: `${k} · ${v.type}` }))); }
      catch { qSummary.append(h("span", { class: "qtag", text: "JSON 형식 오류" })); }
    };
    qTa.addEventListener("input", refreshQSummary);
    refreshQSummary();

    const runBtn = h("button", { class: "btn primary", type: "button", "data-needs-key": true, onclick: () => runOne(), text: "판정하기" });
    const batchBtn = h("button", { class: "btn", type: "button", "data-needs-key": true, onclick: () => runBatch(), text: `샘플 ${sc.samples.length}개 모두` });

    const left = h("section", { class: "card" },
      h("div", { class: "card-head" }, h("b", { text: "입력 (state)" }), h("button", { class: "btn", type: "button", text: "샘플 되돌리기", onclick: () => loadSample(sampleIndex) })),
      h("div", { class: "card-body" },
        chips,
        h("div", { class: "mode" }, shapeTag, h("span", { class: "seg", role: "group", "aria-label": "입력 형식" }, segJson, segText)),
        stateTa, stateErr,
        h("details", { class: "qbox" },
          h("summary", { text: "질문 보기·고치기 (questions)" }),
          qSummary, qTa, qErr,
          h("div", { class: "actions" },
            h("button", { class: "btn", type: "button", text: "질문 원래대로", onclick: () => { qTa.value = pretty(sc.questions); qTa.classList.remove("bad"); qErr.textContent = ""; refreshQSummary(); } }))),
        h("div", { class: "actions" },
          runBtn, batchBtn,
          h("button", {
            class: "btn", type: "button", text: "curl 복사",
            onclick: () => { const s = readState(); const q = readQuestions(); if (s !== undefined && q !== undefined) copy(curlFor(s, q), "curl 명령을 복사했습니다 (키는 $OPENROUTER_API_KEY 자리)"); },
          }),
          h("button", { class: "btn", type: "button", text: "링크 복사", onclick: () => copy(location.href, "이 시나리오 링크를 복사했습니다") }),
          h("span", { class: "hint", text: "⌘/Ctrl + Enter 로 실행" }))));

    const right = h("section", { class: "card" },
      h("div", { class: "card-head" }, h("b", { text: "Jev 판정" }), h("span", { class: "mono", text: MODEL })),
      result);

    function showEmpty() {
      result.replaceChildren(h("div", { class: "empty", text: apiKey ? "샘플을 고르거나 입력을 고친 뒤 「판정하기」를 누르세요." : "먼저 위에 OpenRouter 키를 넣으세요. 키는 openrouter.ai/keys 에서 만듭니다." }));
    }

    let busy = false;
    async function runOne() {
      if (busy) return;
      const s = readState();
      const q = readQuestions();
      if (s === undefined || q === undefined) return;
      if (!apiKey) { toast("OpenRouter 키를 먼저 넣으세요"); keyInput.focus(); return; }
      busy = true;
      runBtn.disabled = true;
      result.replaceChildren(h("div", { class: "empty", text: "판정 중…" }));
      try {
        const { body, ms } = await ask(s, q);
        // 샘플을 그대로 돌렸을 때만 기대값과 비교한다 — 입력을 고쳤으면 기대값이 더 이상 맞지 않는다.
        const pristine = stateTa.value === sampleText(sampleIndex) && qTa.value === pretty(sc.questions);
        renderResult(body, ms, pristine ? sc.samples[sampleIndex].expect : null, q);
        // 한 열 배치에서는 결과 카드가 입력 아래라 화면 밖에 있다 — 결과로 내려 준다.
        if (window.matchMedia("(max-width: 1000px)").matches) right.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (e) {
        result.replaceChildren(h("div", { class: "problem", text: e.message }));
      } finally {
        busy = false;
        runBtn.disabled = !apiKey;
      }
    }

    function renderResult(body, ms, expect, questions) {
      const answers = body.answers || {};
      const d = decideSafe(sc, answers);
      const u = body.usage || {};
      result.replaceChildren(
        d
          ? h("div", { class: `verdict ${d.tone}` },
              h("div", {}, h("div", { class: "v-label", text: "판정 규칙 적용 결과" }), h("div", { class: "v-action", text: d.action })),
              expect ? h("span", { class: `match ${d.action === expect ? "hit" : "miss"}`, text: d.action === expect ? "기대와 일치" : `기대와 다름 · 기대: ${expect}` }) : null)
          : h("div", { class: "verdict warn" }, h("div", {}, h("div", { class: "v-label", text: "판정 규칙" }), h("div", { class: "v-action", text: "질문이 바뀌어 규칙을 적용하지 않음" }))),
        gaugeFor(sc, questions, answers) || "",
        h("div", { class: "answers" }, Object.entries(answers).map(([k, a]) => answerCard(k, a))),
        h("div", { class: "usage" },
          h("span", {}, "지연 ", h("b", { text: `${ms}ms` })),
          h("span", {}, "입력 토큰 ", h("b", { text: String(u.input_tokens ?? "—") })),
          h("span", {}, "비용 ", h("b", { text: u.cost != null ? `$${u.cost.toFixed(7)}` : "—" })),
          h("span", {}, "모델 ", h("b", { text: body.model || MODEL }))),
        h("details", { class: "raw" }, h("summary", { text: "원본 응답(JSON)" }), h("pre", { class: "json", text: pretty(body) })));
    }

    async function runBatch() {
      if (busy) return;
      const q = readQuestions();
      if (q === undefined) return;
      if (!apiKey) { toast("OpenRouter 키를 먼저 넣으세요"); keyInput.focus(); return; }
      busy = true;
      batchBtn.disabled = true;
      const edited = qTa.value !== pretty(sc.questions);
      const tbody = h("tbody");
      const summary = h("span", { text: "실행 중…" });
      batchBox.replaceChildren(h("section", { class: "card batch" },
        h("div", { class: "card-head" }, h("b", { text: "샘플 일괄 실행" }), summary),
        h("div", { class: "table-scroll" }, h("table", { class: "btable" },
          h("thead", {}, h("tr", {}, ["샘플", "기대", "판정", sc.gauge.q, "결과", "지연"].map((t) => h("th", { text: t })))),
          tbody))));
      let hit = 0, cost = 0;
      for (const s of sc.samples) {
        const pending = h("td", { colspan: "4", class: "num", text: "…" });
        const tr = h("tr", {}, h("td", { text: s.label }), h("td", { text: edited ? "—" : s.expect }), pending);
        tbody.append(tr);
        try {
          const { body, ms } = await ask(s.state, q);
          cost += body.usage?.cost || 0;
          const d = decideSafe(sc, body.answers || {});
          const a = body.answers?.[sc.gauge.q];
          const v = !a ? "—" : a.type === "noul" ? pct(a.noul) : a.type === "score" ? fmt(a.score) : `${a.choice} ${pct(a.confidence)}`;
          const ok = !edited && d && d.action === s.expect;
          if (ok) hit++;
          pending.remove();
          tr.append(
            h("td", {}, d ? h("span", { class: `pill ${d.tone}`, text: d.action }) : "—"),
            h("td", { class: "num", text: v }),
            h("td", {}, edited ? h("span", { class: "pill muted", text: "질문 수정됨" }) : h("span", { class: `pill ${ok ? "ok" : "crit"}`, text: ok ? "일치" : "다름" })),
            h("td", { class: "num", text: `${ms}ms` }));
        } catch (e) {
          pending.textContent = e.message;
          pending.className = "";
        }
      }
      summary.textContent = edited ? `${sc.samples.length}건 · $${cost.toFixed(6)}` : `${hit}/${sc.samples.length} 일치 · $${cost.toFixed(6)}`;
      busy = false;
      batchBtn.disabled = !apiKey;
    }

    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); runOne(); } };
    stateTa.addEventListener("keydown", onKey);
    qTa.addEventListener("keydown", onKey);

    root.replaceChildren(
      h("header", { class: "sc-head" },
        h("div", { class: "sc-meta" }, h("span", { text: sc.cat }), typesOf(sc).map((t) => h("span", { class: "t", text: t }))),
        h("h2", { text: sc.title }),
        h("p", { class: "sc-blurb", text: sc.blurb }),
        h("p", { class: "rule-line" }, h("b", { text: "판정 규칙" }), sc.rule)),
      h("div", { class: "bench" }, left, right),
      batchBox);

    loadSample(0);
    showEmpty();
    syncKey();
    document.title = `${sc.title} · Jev Playground`;
    document.querySelectorAll(".sc-link").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === sc.id)));
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const sc = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    renderScenario(sc);
    if (id && sc.id === id) $("#scenario").scrollIntoView({ block: "start" });
  }
  window.addEventListener("hashchange", route);

  renderTypes();
  renderList();
  route();
  syncKey();
})();
