(() => {
  "use strict";

  const API = "https://openrouter.ai/api/alpha/decisions";
  const MODEL = "typesafe/jev-1.13";
  const SCENARIOS = window.SCENARIOS;
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
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const pretty = (v) => JSON.stringify(v, null, 2);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const fmt = (x, d = 2) => (Number.isInteger(x) ? String(x) : x.toFixed(d));

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
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    $("#theme-btn").title = { auto: "테마: 시스템", light: "테마: 밝게", dark: "테마: 어둡게" }[t];
  }
  let theme = store.get("localStorage", "jev.theme") || "auto";
  applyTheme(theme);
  $("#theme-btn").addEventListener("click", () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    store.set("localStorage", "jev.theme", theme);
    applyTheme(theme);
    toast($("#theme-btn").title);
  });

  // ─── 목록 ───
  const rail = $("#rail");
  const menuBtn = $("#menu-btn");
  function renderList(filter = "") {
    const list = $("#list");
    list.replaceChildren();
    const q = filter.trim().toLowerCase();
    let lastCat = null;
    SCENARIOS.forEach((sc, i) => {
      const hay = `${sc.title} ${sc.blurb} ${sc.cat}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      if (sc.cat !== lastCat) { list.append(h("div", { class: "cat", text: sc.cat })); lastCat = sc.cat; }
      list.append(h("button", {
        class: "sc-link", type: "button", "data-id": sc.id,
        "aria-current": current && current.id === sc.id ? "true" : "false",
        onclick: () => { location.hash = sc.id; closeRail(); },
      }, h("span", { class: "no", text: String(i + 1).padStart(2, "0") }), h("span", { text: sc.title })));
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
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Jev Playground",
        },
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

  // ─── 계기판 ───
  const CX = 170, CY = 170, R = 140;
  const onArc = (t, r) => {
    const a = Math.PI * (1 - t);
    return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
  };
  function meter(value, range, thresholds, caption, display) {
    const [lo, hi] = range;
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
    const el = svg("svg", { class: "meter", viewBox: "0 -14 340 214", role: "img", "aria-label": `${caption} ${display}` });
    const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
    el.append(svg("path", { class: "track", d: arc }));
    const fill = svg("path", { class: "fill", d: arc, pathLength: "100", "stroke-dasharray": "100 100", "stroke-dashoffset": "100" });
    el.append(fill);
    thresholds.forEach((th) => {
      const tt = (th - lo) / (hi - lo || 1);
      const [x1, y1] = onArc(tt, R - 16);
      const [x2, y2] = onArc(tt, R + 16);
      const [lx, ly] = onArc(tt, R + 28);
      el.append(svg("line", { class: "tick", x1, y1, x2, y2 }));
      const label = svg("text", { class: "tick-label", x: lx, y: ly + 3, "text-anchor": "middle" });
      label.textContent = range[1] === 1 ? pct(th) : fmt(th, 1);
      el.append(label);
    });
    [0, 1].forEach((edge) => {
      const [x, y] = onArc(edge, R + 26);
      const lab = svg("text", { class: "tick-label", x, y: y + 16, "text-anchor": "middle" });
      lab.textContent = range[1] === 1 ? pct(edge) : fmt(edge ? hi : lo, 0);
      el.append(lab);
    });
    const needle = svg("line", { class: "needle", x1: CX, y1: CY, x2: CX, y2: CY - R + 22, style: "transform: rotate(-90deg)" });
    el.append(needle, svg("circle", { class: "hub", cx: CX, cy: CY, r: 7 }));
    const big = svg("text", { class: "big", x: CX, y: CY - 42 });
    big.textContent = display;
    const cap = svg("text", { class: "cap", x: CX, y: CY - 20 });
    cap.textContent = caption;
    el.append(big, cap);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.setAttribute("stroke-dashoffset", String(100 - t * 100));
      needle.style.transform = `rotate(${-90 + t * 180}deg)`;
    }));
    return el;
  }

  function gaugeFor(sc, questions, answers) {
    const g = sc.gauge;
    const a = answers?.[g.q];
    if (!a) return null;
    if (a.type === "noul") return meter(a.noul, [0, 1], g.thresholds, `${g.q} · 예일 확률`, pct(a.noul));
    if (a.type === "score") {
      const n = Array.isArray(questions[g.q]?.criteria) ? questions[g.q].criteria.length : 2;
      return meter(a.score, g.range || [0, n - 1], g.thresholds, `${g.q} · 점수`, fmt(a.score));
    }
    if (a.type === "choice") return meter(a.confidence, [0, 1], g.thresholds, `${g.q} · ${a.choice} 확신`, pct(a.confidence));
    return null;
  }

  function answerCard(name, a) {
    const card = h("div", { class: "ans" });
    let val = "";
    if (a.type === "noul") val = pct(a.noul);
    else if (a.type === "score") val = fmt(a.score);
    else if (a.type === "choice") val = a.choice;
    card.append(h("div", { class: "ans-head" },
      h("span", {}, h("span", { class: "ans-name", text: name }), " ", h("span", { class: "ans-type", text: a.type })),
      h("span", { class: "ans-val", text: val })));
    if (a.type === "noul") {
      card.append(barRow("true", a.noul, a.noul >= 0.5), barRow("false", 1 - a.noul, a.noul < 0.5));
    } else if (a.probabilities) {
      // 점수는 등급 순서(0, 1, 2 …)가 의미라 그대로 두고, 보기 고르기만 확률순으로 정렬한다.
      const entries = a.type === "score"
        ? Object.entries(a.probabilities).sort((x, y) => Number(x[0]) - Number(y[0]))
        : Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
      const topKey = a.type === "choice" ? a.choice : [...entries].sort((x, y) => y[1] - x[1])[0]?.[0];
      entries.forEach(([k, p]) => {
        const label = a.type === "score" && a.legend?.[k] ? `${k} · ${a.legend[k]}` : k;
        card.append(barRow(label, p, k === String(topKey)));
      });
      if (a.confidence != null) card.append(h("div", { class: "legend", text: `확신 ${pct(a.confidence)}` }));
    }
    return card;
  }
  function barRow(name, p, top) {
    const bar = h("span", { class: "bar" }, h("i", { style: "width:0%" }));
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.firstChild.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`; }));
    return h("div", { class: `bar-row${top ? " top" : ""}`, title: name },
      h("span", { class: "nm", text: name }), bar, h("span", { class: "pct", text: pct(p) }));
  }

  // ─── 시나리오 화면 ───
  let current = null;
  let sampleIndex = 0;

  function parseEditor(ta, errEl, label) {
    try {
      const v = JSON.parse(ta.value);
      ta.classList.remove("bad");
      errEl.textContent = "";
      return v;
    } catch (e) {
      ta.classList.add("bad");
      errEl.textContent = `${label} JSON 형식 오류: ${e.message}`;
      return undefined;
    }
  }

  function curlFor(state, questions) {
    const body = JSON.stringify({ model: MODEL, state, questions }, null, 2).replace(/'/g, "'\\''");
    return `curl ${API} \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  }

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch { toast("복사하지 못했습니다 — 브라우저가 클립보드 접근을 막았습니다"); }
  }

  function decideSafe(sc, answers) {
    try { return sc.decide(answers); } catch { return null; }
  }

  function renderScenario(sc) {
    current = sc;
    sampleIndex = 0;
    const idx = SCENARIOS.indexOf(sc);
    const root = $("#scenario");
    root.replaceChildren();

    const stateTa = h("textarea", { class: "editor", spellcheck: "false", "aria-label": "state 입력(JSON)" });
    const stateErr = h("div", { class: "err", role: "alert" });
    const qTa = h("textarea", { class: "editor q", spellcheck: "false", "aria-label": "questions(JSON)" });
    const qErr = h("div", { class: "err", role: "alert" });
    qTa.value = pretty(sc.questions);
    const result = h("div", { class: "card-body" });
    const batchBox = h("div");

    const chips = h("div", { class: "samples", role: "group", "aria-label": "샘플 입력" });
    function loadSample(i) {
      sampleIndex = i;
      stateTa.value = pretty(sc.samples[i].state);
      stateTa.classList.remove("bad");
      stateErr.textContent = "";
      [...chips.children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === i)));
    }
    sc.samples.forEach((s, i) => chips.append(h("button", { class: "chip", type: "button", onclick: () => loadSample(i), text: s.label })));

    const qSummary = h("div", { class: "qsum" });
    const refreshQSummary = () => {
      qSummary.replaceChildren();
      try {
        Object.entries(JSON.parse(qTa.value)).forEach(([k, v]) => qSummary.append(h("span", { class: "qtag", text: `${k} · ${v.type}` })));
      } catch { qSummary.append(h("span", { class: "qtag", text: "JSON 형식 오류" })); }
    };
    qTa.addEventListener("input", refreshQSummary);
    refreshQSummary();

    const runBtn = h("button", { class: "run-btn", type: "button", "data-needs-key": true, onclick: () => runOne() },
      "판정하기", h("span", { class: "kbd", text: "⌘/Ctrl ↵" }));
    const batchBtn = h("button", { class: "ghost-btn", type: "button", "data-needs-key": true, onclick: () => runBatch(), text: `샘플 ${sc.samples.length}개 모두 돌리기` });

    const left = h("section", { class: "card" },
      h("div", { class: "card-head" },
        h("span", { class: "card-title", text: "입력 · state" }),
        h("button", { class: "ghost-btn", type: "button", text: "샘플 되돌리기", onclick: () => loadSample(sampleIndex) })),
      h("div", { class: "card-body" },
        chips, stateTa, stateErr,
        h("details", { class: "qbox" },
          h("summary", {}, "Jev 에게 묻는 질문 (questions)"),
          qSummary, qTa, qErr,
          h("div", { class: "actions" },
            h("button", { class: "ghost-btn", type: "button", text: "질문 원래대로", onclick: () => { qTa.value = pretty(sc.questions); qTa.classList.remove("bad"); qErr.textContent = ""; refreshQSummary(); } }))),
        h("div", { class: "actions" },
          runBtn, batchBtn,
          h("button", {
            class: "ghost-btn", type: "button", text: "curl 복사",
            onclick: () => {
              const s = parseEditor(stateTa, stateErr, "state");
              const q = parseEditor(qTa, qErr, "questions");
              if (s !== undefined && q !== undefined) copy(curlFor(s, q), "curl 명령을 복사했습니다 (키는 $OPENROUTER_API_KEY 자리)");
            },
          }),
          h("button", { class: "ghost-btn", type: "button", text: "링크 복사", onclick: () => copy(location.href, "이 시나리오 링크를 복사했습니다") }))));

    const right = h("section", { class: "card" },
      h("div", { class: "card-head" }, h("span", { class: "card-title", text: "Jev 판정" }), h("span", { class: "card-title mono", text: MODEL })),
      result);

    function showEmpty() {
      result.replaceChildren(h("div", { class: "empty" },
        h("div", { class: "big-dial", text: "—" }),
        h("p", { text: apiKey ? "샘플을 고르거나 입력을 고친 뒤 「판정하기」를 누르세요." : "먼저 위에 OpenRouter 키를 넣으세요. 키는 openrouter.ai/keys 에서 만듭니다." })));
    }

    function readInputs() {
      const s = parseEditor(stateTa, stateErr, "state");
      const q = parseEditor(qTa, qErr, "questions");
      if (s === undefined || q === undefined) return null;
      if (!apiKey) { toast("OpenRouter 키를 먼저 넣으세요"); keyInput.focus(); return null; }
      return { s, q };
    }

    let busy = false;
    async function runOne() {
      if (busy) return;
      const inp = readInputs();
      if (!inp) return;
      busy = true;
      runBtn.disabled = true;
      result.replaceChildren(h("div", { class: "empty" }, h("div", { class: "big-dial", text: "…" }), h("p", { text: "판정 중" })));
      try {
        const { body, ms } = await ask(inp.s, inp.q);
        // 샘플을 그대로 돌렸을 때만 기대값과 비교한다 — 입력을 고쳤으면 기대값이 더 이상 맞지 않는다.
        const pristine = stateTa.value === pretty(sc.samples[sampleIndex].state) && qTa.value === pretty(sc.questions);
        renderResult(body, ms, pristine ? sc.samples[sampleIndex].expect : null, inp.q);
        // 한 열 배치에서는 결과 카드가 입력 아래라 화면 밖에 있다 — 결과로 내려 준다.
        if (window.matchMedia("(max-width: 1080px)").matches) right.scrollIntoView({ block: "start", behavior: "smooth" });
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
      const out = [];
      if (d) {
        out.push(h("div", { class: `verdict ${d.tone}` },
          h("div", {}, h("div", { class: "v-label", text: "판정 규칙 적용 결과" }), h("div", { class: "v-action", text: d.action })),
          expect ? h("span", { class: `match ${d.action === expect ? "hit" : "miss"}`, text: d.action === expect ? "기대와 일치" : `기대와 다름 · 기대: ${expect}` }) : null));
      } else {
        out.push(h("div", { class: "verdict warn" },
          h("div", {}, h("div", { class: "v-label", text: "판정 규칙" }), h("div", { class: "v-action", text: "질문이 바뀌어 규칙을 적용하지 않음" }))));
      }
      const g = gaugeFor(sc, questions, answers);
      if (g) out.push(h("div", { class: "meter-wrap" }, g));
      out.push(h("div", { class: "answers" }, Object.entries(answers).map(([k, a]) => answerCard(k, a))));
      const u = body.usage || {};
      out.push(h("div", { class: "usage" },
        h("span", {}, "지연 ", h("b", { text: `${ms}ms` })),
        h("span", {}, "입력 토큰 ", h("b", { text: String(u.input_tokens ?? "—") })),
        h("span", {}, "비용 ", h("b", { text: u.cost != null ? `$${u.cost.toFixed(7)}` : "—" })),
        h("span", {}, "모델 ", h("b", { text: body.model || MODEL }))));
      out.push(h("details", { class: "raw" }, h("summary", { text: "원본 응답 보기" }), h("pre", { class: "json", text: pretty(body) })));
      result.replaceChildren(...out);
    }

    async function runBatch() {
      if (busy) return;
      const q = parseEditor(qTa, qErr, "questions");
      if (q === undefined) return;
      if (!apiKey) { toast("OpenRouter 키를 먼저 넣으세요"); keyInput.focus(); return; }
      busy = true;
      batchBtn.disabled = true;
      const edited = qTa.value !== pretty(sc.questions);
      const tbody = h("tbody");
      const summary = h("span", { class: "card-title", text: "실행 중…" });
      batchBox.replaceChildren(h("section", { class: "card batch" },
        h("div", { class: "card-head" }, h("span", { class: "card-title", text: "샘플 일괄 실행" }), summary),
        h("div", { class: "table-scroll" }, h("table", { class: "btable" },
          h("thead", {}, h("tr", {}, ["샘플", "기대", "판정", sc.gauge.q, "결과", "지연"].map((t) => h("th", { text: t })))),
          tbody))));
      let hit = 0, cost = 0;
      for (const s of sc.samples) {
        const tr = h("tr", {}, h("td", { text: s.label }), h("td", { text: edited ? "—" : s.expect }), h("td", { colspan: "4", class: "num", text: "…" }));
        tbody.append(tr);
        try {
          const { body, ms } = await ask(s.state, q);
          cost += body.usage?.cost || 0;
          const d = decideSafe(sc, body.answers || {});
          const a = body.answers?.[sc.gauge.q];
          const v = !a ? "—" : a.type === "noul" ? pct(a.noul) : a.type === "score" ? fmt(a.score) : `${a.choice} ${pct(a.confidence)}`;
          const ok = !edited && d && d.action === s.expect;
          if (ok) hit++;
          tr.lastChild.remove();
          tr.append(
            h("td", {}, d ? h("span", { class: `pill ${d.tone}`, text: d.action }) : "—"),
            h("td", { class: "num", text: v }),
            h("td", {}, edited ? h("span", { class: "pill muted", text: "질문 수정됨" }) : h("span", { class: `pill ${ok ? "ok" : "crit"}`, text: ok ? "일치" : "다름" })),
            h("td", { class: "num", text: `${ms}ms` }));
        } catch (e) {
          tr.lastChild.textContent = e.message;
          tr.lastChild.className = "";
        }
      }
      summary.textContent = edited
        ? `${sc.samples.length}건 · $${cost.toFixed(6)}`
        : `${hit}/${sc.samples.length} 일치 · $${cost.toFixed(6)}`;
      busy = false;
      batchBtn.disabled = !apiKey;
    }

    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); runOne(); }
    };
    stateTa.addEventListener("keydown", onKey);
    qTa.addEventListener("keydown", onKey);

    root.append(
      h("div", { class: "reveal" },
        h("header", { class: "sc-head" },
          h("div", { class: "sc-no", text: String(idx + 1).padStart(2, "0") }),
          h("div", {},
            h("div", { class: "sc-cat", text: sc.cat }),
            h("h2", { text: sc.title }),
            h("p", { class: "sc-blurb", text: sc.blurb }),
            h("div", { class: "rule-line" }, h("b", { text: "판정 규칙" }), h("span", { text: sc.rule })))),
        h("div", { class: "bench" }, left, right),
        batchBox));

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

  renderList();
  route();
  syncKey();
})();
