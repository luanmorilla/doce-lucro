import { loadState, saveState, getDefaultState, newId } from "./state.js";
import { brl, qs, qsa, setTheme, setBrand } from "./ui.js";
import { calcCardFee, calcProfit, calcMargin, calcROI } from "./db.js";
import { supabase } from "./supabase.js";

let state = normalizeState(loadState());
let session = null;

/* =========================================================
   ✅ CLOUD SYNC (Supabase) — salva state por usuário
========================================================= */
let cloudUserId = null;
let saveTimer = null;
let lastSavedHash = "";

function stableHash(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Date.now());
  }
}

async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function bindAuthSync() {
  const u = await getUser();
  cloudUserId = u?.id || null;

  supabase.auth.onAuthStateChange((_event, newSession) => {
    cloudUserId = newSession?.user?.id || null;
  });
}

async function loadStateFromCloud(localState) {
  const u = await getUser();
  if (!u) return { state: localState };

  cloudUserId = u.id;

  const { data, error } = await supabase
    .from("user_state")
    .select("data")
    .eq("user_id", u.id)
    .single();

  // Se ainda não existir registro → cria
  if (error && (error.code === "PGRST116" || error.status === 406)) {
    await supabase.from("user_state").upsert({
      user_id: u.id,
      data: localState,
      updated_at: new Date().toISOString(),
    });

    lastSavedHash = stableHash(localState);
    return { state: localState };
  }

  if (error) {
    console.warn("Erro ao carregar cloud state:", error);
    return { state: localState };
  }

  const cloudState = data?.data ?? {};
  lastSavedHash = stableHash(cloudState);

  return { state: cloudState };
}

function scheduleSaveToCloud(currentState, debounceMs = 700) {
  if (!cloudUserId) return;

  const h = stableHash(currentState);
  if (h === lastSavedHash) return;

  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    const { error } = await supabase.from("user_state").upsert({
      user_id: cloudUserId,
      data: currentState,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("Erro ao salvar cloud state:", error);
      return;
    }

    lastSavedHash = h;
  }, debounceMs);
}

async function applyCloudAfterLogin() {
  const loaded = await loadStateFromCloud(state);
  state = normalizeState(loaded.state);

  saveState(state);
  setTheme(state.theme || "dark");
  setBrand(state.storeName || "");
}

async function applyCloudAfterLogin() {
  const loaded = await loadStateFromCloud(state);
  state = normalizeState(loaded.state);

  // mantém o local igual ao cloud (e vice-versa)
  saveState(state);

  // aplica UI caso tenha mudado no cloud
  setTheme(state.theme || "dark");
  setBrand(state.storeName || "");
  const btnTheme = qs("#btnTheme");
  syncThemeIcon(btnTheme);
}
/* =========================================================
   CORE
========================================================= */
async function mount() {
  setTheme(state.theme || "dark");
  setBrand(state.storeName || "");

  const btnTheme = qs("#btnTheme");
  syncThemeIcon(btnTheme);

  btnTheme?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    persist();
    setTheme(state.theme);
    syncThemeIcon(btnTheme);
  });

  window.addEventListener("hashchange", () => {
    const r = (location.hash || "").replace("#", "").trim();
    if (r) navigate(r, true);
  });

  qsa(".nav__item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });

  // ✅ pega sessão atual
  await refreshSession();
  cloudUserId = getUserId();

  // ✅ se já estiver logado, carrega do cloud agora
  if (session) {
    await applyCloudAfterLogin();
  }

  // ✅ Listener ÚNICO: mudanças de auth (login/logout)
  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    cloudUserId = getUserId();

    if (session) {
      await applyCloudAfterLogin();
    }

    render(state.route || "home");
  });

  const hashRoute = (location.hash || "").replace("#", "").trim();
  navigate(hashRoute || state.route || "home", true);

  registerSW();
}

async function refreshSession() {
  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session || null;
  } catch {
    session = null;
  }
}

function normalizeState(s) {
  const base = getDefaultState();
  const merged = {
    ...base,
    ...(s || {}),
    ui: { ...base.ui, ...((s && s.ui) || {}) },
    auth: { ...base.auth, ...((s && s.auth) || {}) },
  };

  merged.products = Array.isArray(merged.products) ? merged.products : [];
  merged.sales = Array.isArray(merged.sales) ? merged.sales : [];
  merged.orders = Array.isArray(merged.orders) ? merged.orders : [];
  merged.cashMoves = Array.isArray(merged.cashMoves) ? merged.cashMoves : [];

  merged.ui.saleCart = merged.ui.saleCart && typeof merged.ui.saleCart === "object" ? merged.ui.saleCart : {};

  // ✅ rascunhos (itens + formulário) por key (new / edit:<id>)
  merged.ui.orderDraftItems =
    merged.ui.orderDraftItems && typeof merged.ui.orderDraftItems === "object" ? merged.ui.orderDraftItems : {};
  merged.ui.orderDraftForm =
    merged.ui.orderDraftForm && typeof merged.ui.orderDraftForm === "object" ? merged.ui.orderDraftForm : {};

  merged.theme = merged.theme === "light" ? "light" : "dark";
  merged.route = merged.route || "home";
  merged.metaMensal = Number.isFinite(Number(merged.metaMensal)) ? Number(merged.metaMensal) : 3000;
  merged.mesRef = merged.mesRef || monthKey();

  merged.ui.salePay = merged.ui.salePay || "pix";
  merged.ui.saleDiscount = Number(merged.ui.saleDiscount || 0);
  merged.ui.saleExtra = Number(merged.ui.saleExtra || 0);
  merged.ui.saleReceived = Number(merged.ui.saleReceived || 0);

  merged.storeName = typeof merged.storeName === "string" ? merged.storeName : "";

  merged.auth.mode = merged.auth.mode === "pin" ? "pin" : "supabase";
  merged.auth.enabled = merged.auth.enabled === true;
  merged.auth.pin = typeof merged.auth.pin === "string" ? merged.auth.pin : "";
  merged.auth.unlocked = merged.auth.unlocked === true;

  // ✅ compat/normalização de encomendas antigas
  merged.orders = (merged.orders || []).map((o) => {
    const total = Number(o?.total || 0);
    const sinal = Number(o?.sinal || 0);
    return {
      ...o,
      total,
      sinal,
      createdAt: o?.createdAt || new Date().toISOString(),
      status: o?.status || "aberta",
      // novos campos (não quebram nada)
      metodoSinal: o?.metodoSinal || "pix",
      metodoRestante: o?.metodoRestante || "pix",
      sinalRegistrado: o?.sinalRegistrado === true,
      entregaRegistrada: o?.entregaRegistrada === true,
    };
  });

  return merged;
}

/**
 * ✅ Persistência local + cloud (quando logado)
 * - Local sempre (offline)
 * - Cloud se tiver session (sincroniza entre navegadores)
 */
function persist() {
  state = normalizeState(state);

  // local
  saveState(state);

  // cloud
  if (session?.user?.id) {
    cloudUserId = session.user.id;
    scheduleSaveToCloud(700);
  }
}

function syncThemeIcon(btnTheme) {
  const icon = btnTheme?.querySelector(".icon");
  if (icon) icon.textContent = state.theme === "light" ? "☀️" : "🌙";
}

function navigate(route, silent = false) {
  const r = String(route || "home").trim();
  state.route = r || "home";
  persist();

  qsa(".nav__item").forEach((b) => b.classList.toggle("is-active", b.dataset.route === state.route));
  render(state.route);

  try {
    if ((location.hash || "").replace("#", "") !== state.route) {
      history.replaceState(null, "", `#${state.route}`);
    }
  } catch (_) {}

  if (!silent) window.scrollTo({ top: 0, behavior: "smooth" });
}

function render(route) {
  const root = qs("#viewRoot");
  if (!root) return;

  // ✅ LOGIN SUPABASE (padrão)
  if (state.auth.mode === "supabase") {
    if (!session) {
      renderSupabaseLogin(root);
      return;
    }
  }

  // ✅ PIN (opcional)
  if (state.auth.mode === "pin" && state.auth?.enabled && !state.auth?.unlocked && route !== "more") {
    renderPinLockScreen(root);
    return;
  }

  const routes = {
    home: () => renderHome(root),
    sale: () => renderSale(root),
    orders: () => renderOrders(root),
    products: () => renderProducts(root),
    reports: () => renderReports(root),
    more: () => renderMore(root),
  };

  (routes[route] || routes.home)();
}

/* =========================================================
   SUPABASE LOGIN UI
========================================================= */
function renderSupabaseLogin(root) {
  const html = `
    <div class="h1">🔐 Entrar</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Login do Doce Lucro</div>
      <div class="muted" style="font-size:12px;margin-bottom:14px">
        Entre com seu e-mail e senha. (Supabase)
      </div>

      <div class="field">
        <label class="label">E-mail</label>
        <input class="input" id="authEmail" type="email" placeholder="seuemail@gmail.com" autocomplete="email" />
      </div>

      <div class="field mt-12">
        <label class="label">Senha</label>
        <input class="input" id="authPass" type="password" placeholder="••••••••" autocomplete="current-password" />
      </div>

      <div style="height:12px"></div>

      <button class="btn btn--brand" id="btnLogin" style="width:100%" type="button">Entrar</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnSignup" style="width:100%" type="button">Criar conta</button>

      <div style="height:10px"></div>
      <button class="btn" id="btnForgot" style="width:100%" type="button">Esqueci minha senha</button>

      <div style="height:10px"></div>
      <div class="muted" style="font-size:12px">
        Dica: se seu projeto estiver com confirmação por e-mail ativada, você vai precisar confirmar no e-mail ao criar conta.
      </div>
    </section>
  `;

  root.innerHTML = html;

  qs("#btnLogin")?.addEventListener("click", async () => {
    const email = (qs("#authEmail")?.value || "").trim();
    const password = (qs("#authPass")?.value || "").trim();
    if (!email || !password) return toast("Preencha e-mail e senha", "error");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message, "error");

    await refreshSession();
    cloudUserId = getUserId();

    // ✅ puxa cloud imediatamente
    await applyCloudAfterLogin();

    toast("Logado ✅", "success");
    render(state.route || "home");
  });

  qs("#btnSignup")?.addEventListener("click", async () => {
    const email = (qs("#authEmail")?.value || "").trim();
    const password = (qs("#authPass")?.value || "").trim();
    if (!email || !password) return toast("Preencha e-mail e senha", "error");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return toast(error.message, "error");

    toast("Conta criada ✅ (confirme no e-mail se necessário)", "success");
    await refreshSession();
    cloudUserId = getUserId();

    if (session) await applyCloudAfterLogin();

    render(state.route || "home");
  });

  qs("#btnForgot")?.addEventListener("click", async () => {
    const email = (qs("#authEmail")?.value || "").trim();
    if (!email) return toast("Digite seu e-mail", "error");

    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return toast(error.message, "error");
    toast("Link de recuperação enviado ✅", "success");
  });
}

/* =========================================================
   PIN LOCK SCREEN (opcional)
========================================================= */
function renderPinLockScreen(root) {
  const html = `
    <div class="h1">🔒 Entrar</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Acesso protegido</div>
      <div class="muted" style="font-size:12px;margin-bottom:12px">
        Digite seu PIN para acessar o Doce Lucro.
      </div>

      <div class="field">
        <label class="label">PIN</label>
        <input type="password" inputmode="numeric" class="input" id="inpPinLogin" placeholder="••••" />
      </div>

      <div style="height:12px"></div>
      <button class="btn btn--brand" id="btnPinEnter" style="width:100%" type="button">Entrar</button>

      <div style="height:10px"></div>
      <button class="btn" id="btnGoMore" style="width:100%" type="button">⚙️ Ajustes</button>
    </section>
  `;

  root.innerHTML = html;

  const enter = () => {
    const pin = String(qs("#inpPinLogin")?.value || "").trim();
    if (!pin) return toast("Digite o PIN", "error");
    if (pin !== String(state.auth?.pin || "")) return toast("PIN incorreto", "error");

    state.auth.unlocked = true;
    persist();
    toast("Bem-vindo ✅", "success");
    render(state.route || "home");
  };

  qs("#btnPinEnter")?.addEventListener("click", enter);
  qs("#inpPinLogin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enter();
  });

  qs("#btnGoMore")?.addEventListener("click", () => navigate("more"));
}

/* =========================================================
   HOME
========================================================= */
function renderHome(root) {
  const today = getTodaySummary();
  const openToReceive = getOpenOrdersToReceive();
  const month = getMonthSummary();
  const week = getLast7DaysSummary();

  const meta = Number(state.metaMensal || 0);
  const progresso = meta > 0 ? Math.min(100, (month.lucro / meta) * 100) : 0;
  const faltam = Math.max(0, meta - month.lucro);
  const daysLeft = getRemainingDaysInMonth();
  const mediaNecessaria = daysLeft > 0 ? faltam / daysLeft : faltam;

  const cash = getCashSummaryForDate(todayKey());

  const html = `
    <div class="h1">📊 Painel Inteligente</div>

    <section class="stats">
      ${statCard("Faturamento (hoje)", brl(today.faturamento), "💰")}
      ${statCard("Custos (hoje)", brl(today.custos), "📉")}
      ${statCard("Taxas (cartão)", brl(today.taxas), "💳")}
      ${statCard("Lucro real (hoje)", brl(today.lucro), "✨")}
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
        <div>
          <div style="font-weight:900">🎯 Meta de lucro do mês</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(state.mesRef || monthKey())}</div>
        </div>
        <button class="btn btn--small" id="btnEditMeta" type="button">Editar</button>
      </div>

      <div style="height:10px"></div>

      <div class="progress" aria-label="Progresso da meta">
        <div class="progress__bar" style="width:${progresso.toFixed(1)}%"></div>
      </div>

      <div style="height:10px"></div>

      <div class="pillrow">
        <div class="pill">Lucro mês: <span class="value">${brl(month.lucro)}</span></div>
        <div class="pill">Meta: <span class="value">${brl(meta)}</span></div>
        <div class="pill">Faltam: <span class="value">${brl(faltam)}</span></div>
        <div class="pill">Média/dia: <span class="value">${brl(mediaNecessaria)}</span></div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card">
      <div class="row">
        <div class="kpi"><b>💰 Caixa do dia</b><span>Entradas − saídas (saldo)</span></div>
        <div class="badge badge--good">${brl(cash.saldo)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>📥 Entradas</b><span>Dinheiro / Pix / Cartão</span></div>
        <div class="badge">${brl(cash.entradasTotal)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>💵 Dinheiro</b><span>Entrou no caixa</span></div>
        <div class="badge">${brl(cash.dinheiro)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>📱 Pix</b><span>Recebido</span></div>
        <div class="badge">${brl(cash.pix)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>💳 Cartão</b><span>Recebido</span></div>
        <div class="badge">${brl(cash.cartao)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>📤 Saídas</b><span>Despesas/retiradas</span></div>
        <div class="badge badge--bad">${brl(cash.saidas)}</div>
      </div>

      <div style="height:10px"></div>
      <button class="btn btn--danger btn--cta-danger" id="btnCashOut" style="width:100%" type="button">➖ Registrar saída</button>
    </section>

    <div style="height:12px"></div>

    <section class="card">
      <div class="row">
        <div class="kpi"><b>📦 Encomendas abertas</b><span>Total a receber</span></div>
        <div class="badge">${brl(openToReceive)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>📈 Resumo do mês</b><span>Faturamento do mês</span></div>
        <div class="badge">${brl(month.faturamento)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">📊 Últimos 7 dias</div>
      ${renderWeekTable(week)}
      <div class="muted" style="font-size:12px;margin-top:10px">Lucro real = venda − custo − taxa.</div>
    </section>

    <div style="height:12px"></div>

    <button class="btn btn--brand" id="btnQuickSale" type="button">⚡ Fazer venda (balcão)</button>
  `;

  root.innerHTML = html;

  qs("#btnQuickSale")?.addEventListener("click", () => navigate("sale"));

  qs("#btnCashOut")?.addEventListener("click", () => {
    showCashOutModal(root);
  });

  qs("#btnEditMeta")?.addEventListener("click", () => {
    const atual = Number(state.metaMensal || 0);
    const v = prompt("Defina sua meta de LUCRO do mês (em R$). Ex: 3000", String(atual));
    if (v === null) return;

    const num = parseMoneyInput(v);
    if (!Number.isFinite(num) || num < 0) {
      toast("Valor inválido. Use um número como 3000.", "error");
      return;
    }
    state.mesRef = monthKey();
    state.metaMensal = num;
    persist();
    toast("Meta atualizada ✅", "success");
    renderHome(root);
  });
}

function statCard(label, value, icon = "") {
  return `
    <div class="card stat">
      <div style="font-size:24px;margin-bottom:8px">${icon}</div>
      <div class="stat__label">${escapeHtml(label)}</div>
      <div class="stat__value">${escapeHtml(value)}</div>
    </div>
  `;
}

/* =========================================================
   ✅ SAÍDA DE CAIXA (modal)
========================================================= */
function showCashOutModal(_root) {
  const container = qs("#modalContainer");
  if (!container) {
    toast("ModalContainer não encontrado (#modalContainer).", "error");
    return;
  }

  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">➖ Registrar saída</div>
          <button class="modal__close" id="closeModal" type="button">X</button>
        </div>

        <div class="muted" style="font-size:12px;margin-bottom:12px">
          Use para retirada pessoal ou despesa do negócio. Isso diminui o saldo do caixa.
        </div>

        <div class="field">
          <label class="label">Valor</label>
          <input type="text" inputmode="decimal" class="input" id="outValor" placeholder="0,00" value="" />
        </div>

        <div class="field mt-12">
          <label class="label">Tipo</label>
          <select class="select" id="outCat">
            <option value="retirada_pessoal">Retirada pessoal</option>
            <option value="despesa_negocio">Despesa do negócio</option>
          </select>
        </div>

        <div class="field mt-12">
          <label class="label">Descrição</label>
          <input type="text" class="input" id="outDesc" placeholder="Ex: mercado, gás, transporte, pró-labore..." value="" />
        </div>

        <div class="field mt-12">
          <label class="label">Data</label>
          <input type="date" class="input" id="outDate" value="${todayKey()}" />
        </div>

        <div style="height:12px"></div>
        <button class="btn btn--brand" id="btnSaveOut" style="width:100%" type="button">Salvar saída</button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const modal = container.querySelector(".modal");
  container.querySelector("#closeModal")?.addEventListener("click", () => modal?.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  bindMoneyInputClearOnFocus(container, ["outValor"]);

  container.querySelector("#btnSaveOut")?.addEventListener("click", () => {
    const valor = parseMoneyInput(container.querySelector("#outValor")?.value || "0");
    const categoria = String(container.querySelector("#outCat")?.value || "retirada_pessoal");
    const desc = String(container.querySelector("#outDesc")?.value || "").trim();
    const date = String(container.querySelector("#outDate")?.value || todayKey()).trim() || todayKey();

    if (!Number.isFinite(valor) || valor <= 0) return toast("Informe um valor maior que 0.", "error");
    if (!desc) return toast("Informe uma descrição.", "error");

    const labelTipo = categoria === "despesa_negocio" ? "Despesa do negócio" : "Retirada pessoal";

    state.cashMoves.push({
      id: newId(),
      date,
      tipo: "saida",
      valor,
      createdAt: new Date().toISOString(),
      note: `${labelTipo}: ${desc}`,
      categoria,
      descricao: desc,
    });

    persist();
    modal?.remove();
    toast("Saída registrada ✅", "success");
    render(state.route || "home");
  });
}

/* =========================================================
   SALE (Balcão)
========================================================= */
let saleBound = false;
let saleInputDebounce = null;

function renderSale(root) {
  const products = state.products || [];
  if (products.length === 0) {
    root.innerHTML = `
      <div class="h1">💳 Venda (Balcão)</div>
      <section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">📦</div>
          <div class="empty-state__title">Nenhum produto cadastrado</div>
          <div class="empty-state__description">Cadastre seus produtos primeiro para começar a vender.</div>
          <button class="btn btn--brand" id="goProducts" type="button">Cadastrar produtos</button>
        </div>
      </section>
    `;
    qs("#goProducts")?.addEventListener("click", () => navigate("products"));
    return;
  }

  const focusSnap = captureFocusState();

  const cart = state.ui.saleCart || {};
  const metodo = state.ui.salePay || "pix";
  const desconto = Number(state.ui.saleDiscount || 0);
  const acrescimo = Number(state.ui.saleExtra || 0);
  const recebido = Number(state.ui.saleReceived || 0);

  const totals = computeCartTotals(cart, products, metodo, desconto, acrescimo);
  const falta = metodo === "dinheiro" ? Math.max(0, totals.totalFinal - recebido) : 0;
  const troco = metodo === "dinheiro" ? Math.max(0, recebido - totals.totalFinal) : 0;

  const html = `
    <div class="h1">💳 Venda (Balcão)</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">➕ Adicionar produtos</div>
      <div class="productlist">
        ${products.map((p) => renderProductAddRow(p, cart)).join("")}
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section" id="saleSection">
      <div style="font-weight:900;margin-bottom:10px">📋 Resumo da venda</div>

      <div class="field">
        <div class="label">Pagamento</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${radioPill("pay", "pix", "📱 Pix", metodo === "pix")}
          ${radioPill("pay", "dinheiro", "💵 Dinheiro", metodo === "dinheiro")}
          ${radioPill("pay", "cartao", "💳 Cartão", metodo === "cartao")}
        </div>
      </div>

      <div class="field mt-12">
        <div class="label">Desconto</div>
        <input type="text" inputmode="decimal" class="input" id="inpDiscount" placeholder="0,00" value="${formatMoneyInput(
          desconto
        )}" />
      </div>

      <div class="field mt-12">
        <div class="label">Acréscimo (entrega, etc)</div>
        <input type="text" inputmode="decimal" class="input" id="inpExtra" placeholder="0,00" value="${formatMoneyInput(
          acrescimo
        )}" />
      </div>

      ${
        metodo === "dinheiro"
          ? `
        <div class="field mt-12">
          <div class="label">Recebido em dinheiro</div>
          <input type="text" inputmode="decimal" class="input" id="inpRecebido" placeholder="0,00" value="${formatMoneyInput(
            recebido
          )}" />
        </div>
      `
          : ""
      }

      <div style="height:12px"></div>

      <div class="card section" style="background:rgba(255,79,163,0.08);border-color:rgba(255,79,163,0.25)">
        <div class="row">
          <div class="kpi"><b>Subtotal</b><span>Produtos</span></div>
          <div class="value" id="saleSubtotal">${brl(totals.subtotal)}</div>
        </div>

        <div class="row">
          <div class="kpi"><b>Custo</b><span>Total de custo</span></div>
          <div class="value" id="saleCusto">${brl(totals.totalCusto)}</div>
        </div>

        <div class="row">
          <div class="kpi"><b>Taxa</b><span id="saleTaxaLabel">${metodo === "cartao" ? "2.99%" : "Sem taxa"}</span></div>
          <div class="value" id="saleTaxa">${brl(totals.taxa)}</div>
        </div>

        <div class="row">
          <div class="kpi"><b>Desconto</b><span>Aplicado</span></div>
          <div class="value" id="saleDiscount">-${brl(desconto)}</div>
        </div>

        <div class="row">
          <div class="kpi"><b>Acréscimo</b><span>Adicionado</span></div>
          <div class="value" id="saleExtra">+${brl(acrescimo)}</div>
        </div>

        <div class="carttotal">
          <div class="kpi"><b>Total</b><span>A cobrar</span></div>
          <div class="big" id="saleTotal" style="color:var(--brand)">${brl(totals.totalFinal)}</div>
        </div>

        <div class="carttotal">
          <div class="kpi"><b>Lucro</b><span>Desta venda</span></div>
          <div class="big" id="saleLucro" style="color:var(--good)">${brl(totals.lucro)}</div>
        </div>

        <div id="saleCashBlock">
          ${
            metodo === "dinheiro" && falta > 0
              ? `
            <div class="carttotal" style="color:var(--warn)" id="saleFaltaRow">
              <div class="kpi"><b>Falta</b><span>Ainda a receber</span></div>
              <div class="big" id="saleFalta">${brl(falta)}</div>
            </div>
          `
              : ""
          }

          ${
            metodo === "dinheiro" && troco > 0
              ? `
            <div class="carttotal" style="color:var(--good)" id="saleTrocoRow">
              <div class="kpi"><b>Troco</b><span>A devolver</span></div>
              <div class="big" id="saleTroco">${brl(troco)}</div>
            </div>
          `
              : ""
          }
        </div>
      </div>

      <div style="height:12px"></div>
      <button class="btn btn--brand" id="btnFinalizeSale" style="width:100%" type="button">✅ Finalizar venda</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnClearCart" style="width:100%" type="button">🗑️ Limpar carrinho</button>
    </section>
  `;

  root.innerHTML = html;

  if (!saleBound) {
    saleBound = true;

    root.addEventListener("click", (e) => {
      if (state.route !== "sale") return;

      const t = e.target;

      const payBtn = t.closest?.("[data-pay]");
      if (payBtn) {
        state.ui.salePay = payBtn.dataset.pay || "pix";
        state.ui.saleReceived = 0;
        persist();
        renderSale(root);
        return;
      }

      const opBtn = t.closest?.("[data-op]");
      if (opBtn) {
        const prodId = opBtn.dataset.prod;
        const op = opBtn.dataset.op;
        const cart = state.ui.saleCart || {};
        const qty = cart[prodId] || 0;

        cart[prodId] = op === "plus" ? qty + 1 : Math.max(0, qty - 1);
        if (cart[prodId] === 0) delete cart[prodId];

        state.ui.saleCart = cart;
        persist();
        renderSale(root);
        return;
      }

      if (t.closest?.("#btnFinalizeSale")) {
        finalizeSale(root);
        return;
      }

      if (t.closest?.("#btnClearCart")) {
        state.ui.saleCart = {};
        state.ui.saleDiscount = 0;
        state.ui.saleExtra = 0;
        state.ui.saleReceived = 0;
        persist();
        renderSale(root);
        return;
      }
    });

    root.addEventListener("input", (e) => {
      if (state.route !== "sale") return;

      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;

      if (el.id === "inpDiscount") {
        state.ui.saleDiscount = parseMoneyInput(el.value);
        persist();
        debounceSaleRecalc(root);
      }
      if (el.id === "inpExtra") {
        state.ui.saleExtra = parseMoneyInput(el.value);
        persist();
        debounceSaleRecalc(root);
      }
      if (el.id === "inpRecebido") {
        state.ui.saleReceived = parseMoneyInput(el.value);
        persist();
        debounceSaleRecalc(root);
      }
    });

    root.addEventListener(
      "blur",
      (e) => {
        if (state.route !== "sale") return;
        const el = e.target;
        if (!(el instanceof HTMLInputElement)) return;
        if (el.id === "inpDiscount" || el.id === "inpExtra" || el.id === "inpRecebido") {
          renderSale(root);
        }
      },
      true
    );

    root.addEventListener("change", (e) => {
      if (state.route !== "sale") return;
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.id === "inpDiscount" || el.id === "inpExtra" || el.id === "inpRecebido") {
        renderSale(root);
      }
    });
  }

  restoreFocusState(focusSnap);
}

function debounceSaleRecalc(root) {
  clearTimeout(saleInputDebounce);
  saleInputDebounce = setTimeout(() => {
    updateSaleNumbersInDOM(root);
  }, 350);
}

function updateSaleNumbersInDOM(root) {
  if (state.route !== "sale") return;

  const products = state.products || [];
  const cart = state.ui.saleCart || {};
  const metodo = state.ui.salePay || "pix";
  const desconto = Number(state.ui.saleDiscount || 0);
  const acrescimo = Number(state.ui.saleExtra || 0);
  const recebido = Number(state.ui.saleReceived || 0);

  const totals = computeCartTotals(cart, products, metodo, desconto, acrescimo);
  const falta = metodo === "dinheiro" ? Math.max(0, totals.totalFinal - recebido) : 0;
  const troco = metodo === "dinheiro" ? Math.max(0, recebido - totals.totalFinal) : 0;

  const setText = (id, txt) => {
    const el = root.querySelector(`#${id}`);
    if (el) el.textContent = txt;
  };

  setText("saleSubtotal", brl(totals.subtotal));
  setText("saleCusto", brl(totals.totalCusto));
  setText("saleTaxa", brl(totals.taxa));
  setText("saleTaxaLabel", metodo === "cartao" ? "2.99%" : "Sem taxa");
  setText("saleDiscount", `-${brl(desconto)}`);
  setText("saleExtra", `+${brl(acrescimo)}`);
  setText("saleTotal", brl(totals.totalFinal));
  setText("saleLucro", brl(totals.lucro));

  const cashBlock = root.querySelector("#saleCashBlock");
  if (!cashBlock) return;

  if (metodo !== "dinheiro") {
    cashBlock.innerHTML = "";
    return;
  }

  let html = "";
  if (falta > 0) {
    html += `
      <div class="carttotal" style="color:var(--warn)" id="saleFaltaRow">
        <div class="kpi"><b>Falta</b><span>Ainda a receber</span></div>
        <div class="big" id="saleFalta">${brl(falta)}</div>
      </div>
    `;
  }
  if (troco > 0) {
    html += `
      <div class="carttotal" style="color:var(--good)" id="saleTrocoRow">
        <div class="kpi"><b>Troco</b><span>A devolver</span></div>
        <div class="big" id="saleTroco">${brl(troco)}</div>
      </div>
    `;
  }
  cashBlock.innerHTML = html;
}

function finalizeSale(root) {
  const products = state.products || [];
  const cart = state.ui.saleCart || {};
  const metodo = state.ui.salePay || "pix";
  const desconto = Number(state.ui.saleDiscount || 0);
  const acrescimo = Number(state.ui.saleExtra || 0);
  const recebido = Number(state.ui.saleReceived || 0);

  if (Object.keys(cart).length === 0) {
    toast("Carrinho vazio!", "error");
    return;
  }

  const totals = computeCartTotals(cart, products, metodo, desconto, acrescimo);
  const falta = metodo === "dinheiro" ? Math.max(0, totals.totalFinal - recebido) : 0;

  if (metodo === "dinheiro" && falta > 0) {
    toast(`Falta receber ${brl(falta)}`, "error");
    return;
  }

  const items = cartToItems(cart, products);

  const venda = {
    id: newId(),
    date: todayKey(),
    createdAt: new Date().toISOString(),
    metodo,
    items,
    desconto,
    acrescimo,
    recebido,
    troco: metodo === "dinheiro" ? Math.max(0, recebido - totals.totalFinal) : 0,
    totalVenda: totals.totalFinal,
    totalCusto: totals.totalCusto,
    taxaCartao: totals.taxa,
    lucro: totals.lucro,
  };

  state.sales.push(venda);

  state.ui.saleCart = {};
  state.ui.saleDiscount = 0;
  state.ui.saleExtra = 0;
  state.ui.saleReceived = 0;
  state.ui.salePay = "pix";

  const tipo = metodo === "dinheiro" ? "dinheiro" : metodo === "pix" ? "pix" : "cartao";
  state.cashMoves.push({
    id: newId(),
    date: todayKey(),
    tipo,
    valor: totals.totalFinal,
    createdAt: new Date().toISOString(),
    note: "Venda balcão",
  });

  persist();
  toast("Venda registrada ✅", "success");
  renderSale(root);
}

function renderProductAddRow(product, cart) {
  const qty = cart[product.id] || 0;

  return `
    <div class="proditem">
      <div class="prodmeta">
        <b>${escapeHtml(product.nome)}</b>
        <span>Venda: ${brl(product.preco)} | Custo: ${brl(product.custo)}</span>
      </div>

      <div class="qty">
        <button class="qbtn" data-prod="${product.id}" data-op="minus" type="button">−</button>
        <div class="qnum">${qty}</div>
        <button class="qbtn" data-prod="${product.id}" data-op="plus" type="button">+</button>
      </div>
    </div>
  `;
}

/* =========================================================
   ORDERS
========================================================= */
/* (A PARTIR DAQUI, SEU CÓDIGO SEGUE IGUAL AO QUE VOCÊ MANDOU)
   ... eu mantive todo o resto igual, sem mudar lógica.
========================================================= */

function renderOrders(root) {
  const orders = state.orders || [];

  const html = `
    <div class="h1">📦 Encomendas</div>

    <section class="card section">
      <button class="btn btn--brand" id="btnNewOrder" style="width:100%" type="button">➕ Nova encomenda</button>
    </section>

    <div style="height:12px"></div>

    ${
      orders.length === 0
        ? `
      <section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <div class="empty-state__title">Nenhuma encomenda</div>
          <div class="empty-state__description">Crie sua primeira encomenda para começar.</div>
        </div>
      </section>
    `
        : `
      <section class="card">
        ${orders.map((o) => renderOrderRow(o)).join("")}
      </section>
    `
    }
  `;

  root.innerHTML = html;

  qs("#btnNewOrder")?.addEventListener("click", () => showOrderModal(null, root));

  qsa("[data-order-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const oid = btn.dataset.orderId;
      const action = btn.dataset.action;

      if (action === "edit") showOrderModal(oid, root);

      if (action === "delete") {
        if (confirm("Deletar encomenda?")) {
          state.orders = state.orders.filter((o) => o.id !== oid);
          persist();
          toast("Encomenda deletada ✅", "success");
          renderOrders(root);
        }
      }

      if (action === "delivered") {
        markOrderDelivered(oid, root);
      }
    });
  });
}

function renderOrderRow(order) {
  const status = order.status || "aberta";
  const statusIcon = status === "entregue" ? "✅" : status === "cancelada" ? "❌" : "⏳";

  const total = Number(order.total || 0);
  const sinal = Number(order.sinal || 0);
  const restante = Math.max(0, total - sinal);

  const dateLabel = formatOrderDateLabel(order);

  return `
    <div class="row">
      <div class="kpi">
        <b>${escapeHtml(order.cliente || "Sem nome")}</b>
        <span>
          ${statusIcon} ${escapeHtml(status)} • ${escapeHtml(dateLabel)} • Total: ${brl(total)} • Sinal: ${brl(
    sinal
  )} • Falta: ${brl(restante)}
        </span>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${
          status === "aberta"
            ? `<button class="btn btn--small btn--brand" data-order-id="${order.id}" data-action="delivered" type="button">📦 Marcar como entregue</button>`
            : status === "entregue"
            ? `<span class="badge badge--good">✅ Entregue</span>`
            : `<span class="badge badge--bad">❌ Cancelada</span>`
        }
        <button class="btn btn--small" data-order-id="${order.id}" data-action="edit" type="button">Editar</button>
        <button class="btn btn--small btn--danger" data-order-id="${order.id}" data-action="delete" type="button">Deletar</button>
      </div>
    </div>
  `;
}

function formatOrderDateLabel(order) {
  const retirada = String(order?.dataRetirada || "").trim();
  if (retirada) {
    try {
      const d = new Date(`${retirada}T00:00:00`);
      const br = d.toLocaleDateString("pt-BR");
      return `Retirada: ${br}`;
    } catch {
      return `Retirada: ${retirada}`;
    }
  }
  const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `Pedido: ${createdAt.toLocaleDateString("pt-BR")}`;
  }
  return "Pedido: —";
}

function markOrderDelivered(orderId, root) {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return;

  const order = state.orders[idx];
  if ((order.status || "aberta") !== "aberta") {
    toast("Essa encomenda não está aberta.", "error");
    return;
  }

  const total = Number(order.total || 0);
  const sinal = Number(order.sinal || 0);
  const restante = Math.max(0, total - sinal);

  // segurança: não duplicar lançamentos
  if (order.entregaRegistrada === true) {
    state.orders[idx] = { ...order, status: "entregue" };
    persist();
    toast("Encomenda já estava entregue ✅", "info");
    renderOrders(root);
    return;
  }

  const ok = confirm(
    `Marcar como ENTREGUE?\n\nCliente: ${order.cliente || "—"}\nTotal: ${brl(total)}\nSinal: ${brl(
      sinal
    )}\nFalta receber: ${brl(restante)}`
  );
  if (!ok) return;

  // 1) registra no caixa o restante (se houver)
  if (restante > 0) {
    const tipo =
      order.metodoRestante === "dinheiro" ? "dinheiro" : order.metodoRestante === "cartao" ? "cartao" : "pix";
    state.cashMoves.push({
      id: newId(),
      date: todayKey(),
      tipo,
      valor: restante,
      createdAt: new Date().toISOString(),
      note: `Restante encomenda - ${order.cliente || "Cliente"}`,
    });
  }

  // 2) registra a venda (1x) para relatórios/lucro
  state.sales.push({
    id: newId(),
    date: todayKey(),
    createdAt: new Date().toISOString(),
    metodo: order.metodoRestante || "pix",
    items: Array.isArray(order.items) ? order.items : [],
    desconto: 0,
    acrescimo: 0,
    recebido: 0,
    troco: 0,
    totalVenda: total,
    totalCusto: Number(order.totalCusto || 0),
    taxaCartao: 0,
    lucro: calcProfit(total, Number(order.totalCusto || 0), 0),
    ref: { type: "order", orderId: order.id },
  });

  // 3) atualiza encomenda
  state.orders[idx] = {
    ...order,
    status: "entregue",
    entregaRegistrada: true,
    entregueEm: new Date().toISOString(),
  };

  persist();
  toast("Encomenda entregue ✅ (caixa + relatório atualizados)", "success");
  renderOrders(root);
}

/* =========================================================
   (RESTO DO SEU ARQUIVO)
   ⚠️ Aqui embaixo é exatamente o que você mandou (helpers, products, reports, more, etc).
   Mantive igual, só o cloud sync foi corrigido.
========================================================= */

function showOrderModal(orderId, root) {
  const products = state.products || [];
  const order = orderId ? state.orders.find((o) => o.id === orderId) : null;
  const isEdit = !!order;

  const key = draftKeyForOrder(orderId);

  // ✅ rascunho do formulário (pra não apagar ao clicar +)
  const draft = getOrderDraft(orderId, order);

  // ✅ itens por key (new / edit:<id>)
  const itemsBox =
    state.ui.orderDraftItems && typeof state.ui.orderDraftItems === "object" ? state.ui.orderDraftItems : {};
  const itemsById = {
    ...(((itemsBox[key] && typeof itemsBox[key] === "object" ? itemsBox[key] : null) ||
      order?.itemsById ||
      {}) ?? {}),
  };

  const items = cartToItems(itemsById, products);
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);

  const taxaEntregaBase = Number(draft?.taxaEntrega || 0);
  const sinalBase = Number(draft?.sinal || 0);
  const total = subtotal + taxaEntregaBase;

  const metodoSinal = draft?.metodoSinal || order?.metodoSinal || "pix";
  const metodoRestante = draft?.metodoRestante || order?.metodoRestante || "pix";
  const statusDraft = draft?.status || order?.status || "aberta";
  const sinalRegistrado = order?.sinalRegistrado === true;

  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${isEdit ? "Editar encomenda" : "Nova encomenda"}</div>
          <button class="modal__close" id="closeModal" type="button">X</button>
        </div>

        <div class="field">
          <label class="label">Nome do cliente</label>
          <input type="text" class="input" id="inpCliente" placeholder="Ex: Maria Silva" value="${escapeHtml(
            draft?.cliente || ""
          )}" />
        </div>

        <div class="field mt-12">
          <label class="label">WhatsApp (opcional)</label>
          <input type="text" class="input" id="inpWhats" placeholder="Ex: 11999999999" value="${escapeHtml(
            draft?.whats || ""
          )}" />
        </div>

        <div class="field mt-12">
          <label class="label">Data de retirada</label>
          <input type="date" class="input" id="inpData" value="${escapeHtml(draft?.dataRetirada || "")}" />
        </div>

        <div class="field mt-12">
          <label class="label">Taxa de entrega</label>
          <input type="text" inputmode="decimal" class="input" id="inpTaxa" placeholder="0,00" value="${formatMoneyInput(
            taxaEntregaBase
          )}" />
        </div>

        <div style="font-weight:900;margin-top:16px;margin-bottom:10px">📦 Produtos</div>
        ${
          products.length === 0
            ? `<div class="muted">Cadastre produtos para montar encomendas.</div>`
            : `<div class="productlist">
                ${products.map((p) => renderOrderProductRow(p, itemsById)).join("")}
              </div>`
        }

        <div class="carttotal" style="margin-top:16px">
          <div class="kpi"><b>Subtotal</b></div>
          <div class="big" style="color:var(--brand)">${brl(subtotal)}</div>
        </div>

        <div class="carttotal">
          <div class="kpi"><b>Custo total</b></div>
          <div class="value">${brl(totalCusto)}</div>
        </div>

        <div class="field mt-12">
          <label class="label">Sinal</label>
          <input type="text" inputmode="decimal" class="input" id="inpSinal" placeholder="0,00" value="${formatMoneyInput(
            sinalBase
          )}" />
          <div class="muted" style="font-size:12px;margin-top:6px">Se o cliente já pagou sinal, você pode registrar no caixa aqui.</div>
        </div>

        <div class="field mt-12">
          <label class="label">Método do sinal</label>
          <select class="select" id="selMetodoSinal">
            <option value="pix" ${metodoSinal === "pix" ? "selected" : ""}>Pix</option>
            <option value="dinheiro" ${metodoSinal === "dinheiro" ? "selected" : ""}>Dinheiro</option>
            <option value="cartao" ${metodoSinal === "cartao" ? "selected" : ""}>Cartão</option>
          </select>
        </div>

        <div class="field mt-12">
          <label class="label">Método do restante (na entrega)</label>
          <select class="select" id="selMetodoRestante">
            <option value="pix" ${metodoRestante === "pix" ? "selected" : ""}>Pix</option>
            <option value="dinheiro" ${metodoRestante === "dinheiro" ? "selected" : ""}>Dinheiro</option>
            <option value="cartao" ${metodoRestante === "cartao" ? "selected" : ""}>Cartão</option>
          </select>
        </div>

        ${
          isEdit
            ? `
          <div style="height:10px"></div>
          <button class="btn" id="btnRegisterSinal" style="width:100%" type="button" ${sinalRegistrado ? "disabled" : ""}>
            ${sinalRegistrado ? "✅ Sinal já registrado no caixa" : "💰 Registrar sinal no caixa"}
          </button>
        `
            : ""
        }

        <div class="carttotal" style="margin-top:16px">
          <div class="kpi"><b>Total</b></div>
          <div class="big" style="color:var(--brand)">${brl(total)}</div>
        </div>

        <div class="carttotal">
          <div class="kpi"><b>Restante</b></div>
          <div class="big" style="color:var(--warn)">${brl(Math.max(0, total - sinalBase))}</div>
        </div>

        <div class="carttotal">
          <div class="kpi"><b>Lucro estimado</b></div>
          <div class="big" style="color:var(--good)">${brl(calcProfit(total, totalCusto, 0))}</div>
        </div>

        <div class="field mt-12">
          <label class="label">Status</label>
          <select class="select" id="selStatus">
            <option value="aberta" ${statusDraft === "aberta" ? "selected" : ""}>Aberta</option>
            <option value="entregue" ${statusDraft === "entregue" ? "selected" : ""}>Entregue</option>
            <option value="cancelada" ${statusDraft === "cancelada" ? "selected" : ""}>Cancelada</option>
          </select>
        </div>

        <div style="height:12px"></div>
        <button class="btn btn--brand" id="btnSaveOrder" style="width:100%" type="button">Salvar encomenda</button>

        ${
          isEdit
            ? `
          <div style="height:8px"></div>
          <button class="btn btn--danger" id="btnDeleteOrder" style="width:100%" type="button">Deletar encomenda</button>
        `
            : ""
        }
      </div>
    </div>
  `;

  const container = qs("#modalContainer");
  container.innerHTML = html;

  const modal = container.querySelector(".modal");
  container.querySelector("#closeModal")?.addEventListener("click", () => modal?.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  bindMoneyInputClearOnFocus(container, ["inpTaxa", "inpSinal"]);

  container.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return;

    if (el.id === "inpCliente") setOrderDraft(orderId, { cliente: el.value });
    if (el.id === "inpWhats") setOrderDraft(orderId, { whats: el.value });
    if (el.id === "inpData") setOrderDraft(orderId, { dataRetirada: el.value });

    if (el.id === "inpTaxa") setOrderDraft(orderId, { taxaEntrega: parseMoneyInput(el.value) });
    if (el.id === "inpSinal") setOrderDraft(orderId, { sinal: parseMoneyInput(el.value) });

    if (el.id === "selMetodoSinal") setOrderDraft(orderId, { metodoSinal: el.value });
    if (el.id === "selMetodoRestante") setOrderDraft(orderId, { metodoRestante: el.value });
    if (el.id === "selStatus") setOrderDraft(orderId, { status: el.value });
  });

  container.querySelectorAll("[data-op]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.prod;
      const op = btn.dataset.op;
      const q = itemsById[prodId] || 0;

      itemsById[prodId] = op === "plus" ? q + 1 : Math.max(0, q - 1);
      if (itemsById[prodId] === 0) delete itemsById[prodId];

      const box =
        state.ui.orderDraftItems && typeof state.ui.orderDraftItems === "object" ? state.ui.orderDraftItems : {};
      box[key] = itemsById;
      state.ui.orderDraftItems = box;

      persist();
      showOrderModal(orderId, root);
    });
  });

  container.querySelector("#btnRegisterSinal")?.addEventListener("click", () => {
    if (!isEdit) return;
    const idx = state.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) return;

    const sinal = parseMoneyInput(container.querySelector("#inpSinal")?.value || "0");
    if (!sinal || sinal <= 0) return toast("Defina um valor de sinal maior que 0.", "error");

    const metodoSinalX = container.querySelector("#selMetodoSinal")?.value || "pix";

    const current = state.orders[idx];
    if (current.sinalRegistrado === true) return toast("Sinal já foi registrado.", "info");

    const tipo = metodoSinalX === "dinheiro" ? "dinheiro" : metodoSinalX === "cartao" ? "cartao" : "pix";

    state.cashMoves.push({
      id: newId(),
      date: todayKey(),
      tipo,
      valor: sinal,
      createdAt: new Date().toISOString(),
      note: `Sinal encomenda - ${current.cliente || "Cliente"}`,
    });

    state.orders[idx] = {
      ...current,
      sinal,
      metodoSinal: metodoSinalX,
      sinalRegistrado: true,
    };

    persist();
    toast("Sinal registrado no caixa ✅", "success");
    showOrderModal(orderId, root);
  });

  container.querySelector("#btnSaveOrder")?.addEventListener("click", () => {
    const cliente = (container.querySelector("#inpCliente")?.value || "").trim();
    const whats = (container.querySelector("#inpWhats")?.value || "").trim();
    const dataRetirada = container.querySelector("#inpData")?.value || "";
    const taxaEntrega = parseMoneyInput(container.querySelector("#inpTaxa")?.value || "0");
    const sinal = parseMoneyInput(container.querySelector("#inpSinal")?.value || "0");
    const status = container.querySelector("#selStatus")?.value || "aberta";
    const metodoSinalX = container.querySelector("#selMetodoSinal")?.value || "pix";
    const metodoRestanteX = container.querySelector("#selMetodoRestante")?.value || "pix";

    if (!cliente) return toast("Preencha o nome do cliente", "error");
    if (Object.keys(itemsById).length === 0) return toast("Adicione pelo menos um produto", "error");

    const itemsX = cartToItems(itemsById, products);
    const subtotalX = itemsX.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    const totalCustoX = itemsX.reduce((a, i) => a + i.qty * i.unitCost, 0);
    const totalX = subtotalX + taxaEntrega;

    if (isEdit) {
      const idx = state.orders.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        const prev = state.orders[idx] || {};
        state.orders[idx] = {
          ...prev,
          cliente,
          whats,
          dataRetirada,
          taxaEntrega,
          sinal,
          status,
          itemsById,
          items: itemsX,
          total: totalX,
          totalCusto: totalCustoX,
          lucroEstimado: calcProfit(totalX, totalCustoX, 0),
          metodoSinal: metodoSinalX,
          metodoRestante: metodoRestanteX,
          sinalRegistrado: prev.sinalRegistrado === true,
          entregaRegistrada: prev.entregaRegistrada === true,
          createdAt: prev.createdAt || new Date().toISOString(),
        };
      }
    } else {
      state.orders.push({
        id: newId(),
        createdAt: new Date().toISOString(),
        status: "aberta",
        cliente,
        whats,
        dataRetirada,
        taxaEntrega,
        sinal,
        itemsById,
        items: itemsX,
        total: totalX,
        totalCusto: totalCustoX,
        lucroEstimado: calcProfit(totalX, totalCustoX, 0),
        metodoSinal: metodoSinalX,
        metodoRestante: metodoRestanteX,
        sinalRegistrado: false,
        entregaRegistrada: false,
      });
    }

    clearOrderDraft(orderId);
    const box =
      state.ui.orderDraftItems && typeof state.ui.orderDraftItems === "object" ? state.ui.orderDraftItems : {};
    if (box[key]) delete box[key];
    state.ui.orderDraftItems = box;

    persist();
    modal?.remove();
    toast(`Encomenda ${isEdit ? "atualizada" : "criada"} ✅`, "success");
    renderOrders(root);
  });

  container.querySelector("#btnDeleteOrder")?.addEventListener("click", () => {
    if (confirm("Tem certeza que quer deletar esta encomenda?")) {
      state.orders = state.orders.filter((o) => o.id !== orderId);

      clearOrderDraft(orderId);
      const box =
        state.ui.orderDraftItems && typeof state.ui.orderDraftItems === "object" ? state.ui.orderDraftItems : {};
      if (box[key]) delete box[key];
      state.ui.orderDraftItems = box;

      persist();
      modal?.remove();
      toast("Encomenda deletada ✅", "success");
      renderOrders(root);
    }
  });
}

function renderOrderProductRow(product, itemsById) {
  const qty = itemsById[product.id] || 0;

  return `
    <div class="proditem">
      <div class="prodmeta">
        <b>${escapeHtml(product.nome)}</b>
        <span>Venda: ${brl(product.preco)} | Custo: ${brl(product.custo)}</span>
      </div>

      <div class="qty">
        <button class="qbtn" data-prod="${product.id}" data-op="minus" type="button">−</button>
        <div class="qnum">${qty}</div>
        <button class="qbtn" data-prod="${product.id}" data-op="plus" type="button">+</button>
      </div>
    </div>
  `;
}

/* =========================================================
   PRODUCTS / REPORTS / MORE
========================================================= */

function renderProducts(root) {
  const products = state.products || [];

  const html = `
    <div class="h1">🎂 Produtos</div>

    <section class="card section">
      <button class="btn btn--brand" id="btnNewProduct" style="width:100%" type="button">➕ Novo produto</button>
    </section>

    <div style="height:12px"></div>

    ${
      products.length === 0
        ? `
      <section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">📦</div>
          <div class="empty-state__title">Nenhum produto</div>
          <div class="empty-state__description">Crie seu primeiro produto para começar a vender.</div>
        </div>
      </section>
    `
        : `
      <section class="card">
        ${products.map((p) => renderProductRow(p)).join("")}
      </section>
    `
    }
  `;

  root.innerHTML = html;

  qs("#btnNewProduct")?.addEventListener("click", () => showProductModal(null, root));

  qsa("[data-prod-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.dataset.prodId;
      const action = btn.dataset.action;

      if (action === "edit") showProductModal(pid, root);

      if (action === "delete") {
        if (confirm("Deletar produto?")) {
          state.products = state.products.filter((p) => p.id !== pid);
          persist();
          toast("Produto deletado ✅", "success");
          renderProducts(root);
        }
      }
    });
  });
}

function renderProductRow(product) {
  const margin = Math.round(calcMargin(Number(product.preco || 0), Number(product.custo || 0)));
  const lucroUn = Number(product.preco || 0) - Number(product.custo || 0);
  const roi = Math.round(calcROI(lucroUn, Number(product.custo || 0)));

  return `
    <div class="row">
      <div class="kpi">
        <b>${escapeHtml(product.nome)}</b>
        <span>
          Venda: ${brl(product.preco)} | Custo: ${brl(product.custo)} | Margem: ${margin}% | ROI: ${roi}%
        </span>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--small" data-prod-id="${product.id}" data-action="edit" type="button">Editar</button>
        <button class="btn btn--small btn--danger" data-prod-id="${product.id}" data-action="delete" type="button">Deletar</button>
      </div>
    </div>
  `;
}

function showProductModal(productId, root) {
  const product = productId ? state.products.find((p) => p.id === productId) : null;
  const isEdit = !!product;

  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${isEdit ? "Editar produto" : "Novo produto"}</div>
          <button class="modal__close" id="closeModal" type="button">X</button>
        </div>

        <div class="field">
          <label class="label">Nome do produto</label>
          <input type="text" class="input" id="inpNome" placeholder="Ex: Bolo no pote" value="${escapeHtml(
            product?.nome || ""
          )}" />
        </div>

        <div class="fieldgrid mt-12">
          <div class="field">
            <label class="label">Preço de venda</label>
            <input type="text" inputmode="decimal" class="input" id="inpPreco" placeholder="0,00" value="${formatMoneyInput(
              product?.preco || 0
            )}" />
          </div>

          <div class="field">
            <label class="label">Custo unitário</label>
            <input type="text" inputmode="decimal" class="input" id="inpCusto" placeholder="0,00" value="${formatMoneyInput(
              product?.custo || 0
            )}" />
          </div>
        </div>

        <div class="card section" style="background:rgba(46,229,157,0.08);border-color:rgba(46,229,157,0.25);margin-top:12px">
          <div class="row">
            <div class="kpi"><b>Margem</b><span>Lucro por unidade</span></div>
            <div class="value" id="marginDisplay">0%</div>
          </div>
        </div>

        <div style="height:12px"></div>
        <button class="btn btn--brand" id="btnSaveProduct" style="width:100%" type="button">Salvar produto</button>

        ${
          isEdit
            ? `
          <div style="height:8px"></div>
          <button class="btn btn--danger" id="btnDeleteProduct" style="width:100%" type="button">Deletar produto</button>
        `
            : ""
        }
      </div>
    </div>
  `;

  const container = qs("#modalContainer");
  container.innerHTML = html;

  const modal = container.querySelector(".modal");
  container.querySelector("#closeModal")?.addEventListener("click", () => modal?.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  const inpPreco = container.querySelector("#inpPreco");
  const inpCusto = container.querySelector("#inpCusto");
  const marginDisplay = container.querySelector("#marginDisplay");

  const updateMargin = () => {
    const preco = parseMoneyInput(inpPreco?.value || "0");
    const custo = parseMoneyInput(inpCusto?.value || "0");
    const margin = Math.round(calcMargin(preco, custo));
    if (marginDisplay) marginDisplay.textContent = `${margin}%`;
  };

  inpPreco?.addEventListener("input", updateMargin);
  inpCusto?.addEventListener("input", updateMargin);
  updateMargin();

  container.querySelector("#btnSaveProduct")?.addEventListener("click", () => {
    const nome = (container.querySelector("#inpNome")?.value || "").trim();
    const preco = parseMoneyInput(container.querySelector("#inpPreco")?.value || "0");
    const custo = parseMoneyInput(container.querySelector("#inpCusto")?.value || "0");

    if (!nome) return toast("Preencha o nome do produto", "error");
    if (!Number.isFinite(preco) || preco <= 0) return toast("Preço inválido", "error");
    if (!Number.isFinite(custo) || custo < 0) return toast("Custo inválido", "error");

    if (isEdit) {
      const idx = state.products.findIndex((p) => p.id === productId);
      if (idx >= 0) state.products[idx] = { ...product, nome, preco, custo };
    } else {
      state.products.push({ id: newId(), nome, preco, custo });
    }

    persist();
    modal?.remove();
    toast(`Produto ${isEdit ? "atualizado" : "criado"} ✅`, "success");
    renderProducts(root);
  });

  container.querySelector("#btnDeleteProduct")?.addEventListener("click", () => {
    if (confirm("Deletar produto?")) {
      state.products = state.products.filter((p) => p.id !== productId);
      persist();
      modal?.remove();
      toast("Produto deletado ✅", "success");
      renderProducts(root);
    }
  });
}

function renderReports(root) {
  const sales = state.sales || [];
  const orders = state.orders || [];

  const today = getTodaySummary();
  const month = getMonthSummary();
  const year = getYearSummary();

  const html = `
    <div class="h1">📈 Relatórios</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">📊 Resumo de vendas</div>

      <div class="row">
        <div class="kpi"><b>Vendas hoje</b><span>Quantidade</span></div>
        <div class="badge">${sales.filter((s) => s.date === todayKey()).length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Faturamento hoje</b><span>Total</span></div>
        <div class="badge">${brl(today.faturamento)}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Lucro hoje</b><span>Real</span></div>
        <div class="badge badge--good">${brl(today.lucro)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">📅 Resumo do mês</div>

      <div class="row">
        <div class="kpi"><b>Vendas mês</b><span>Quantidade</span></div>
        <div class="badge">${sales.filter((s) => String(s.date || "").startsWith(monthKey())).length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Faturamento mês</b><span>Total</span></div>
        <div class="badge">${brl(month.faturamento)}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Lucro mês</b><span>Real</span></div>
        <div class="badge badge--good">${brl(month.lucro)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">📈 Resumo do ano</div>

      <div class="row">
        <div class="kpi"><b>Vendas ano</b><span>Quantidade</span></div>
        <div class="badge">${sales.filter((s) => String(s.date || "").startsWith(yearKey())).length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Faturamento ano</b><span>Total</span></div>
        <div class="badge">${brl(year.faturamento)}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Lucro ano</b><span>Real</span></div>
        <div class="badge badge--good">${brl(year.lucro)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">📦 Encomendas</div>

      <div class="row">
        <div class="kpi"><b>Total de encomendas</b><span>Todas</span></div>
        <div class="badge">${orders.length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Abertas</b><span>Aguardando</span></div>
        <div class="badge badge--warn">${orders.filter((o) => o.status === "aberta").length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Entregues</b><span>Concluídas</span></div>
        <div class="badge badge--good">${orders.filter((o) => o.status === "entregue").length}</div>
      </div>

      <div class="row">
        <div class="kpi"><b>Canceladas</b><span>Perdidas</span></div>
        <div class="badge badge--bad">${orders.filter((o) => o.status === "cancelada").length}</div>
      </div>
    </section>
  `;

  root.innerHTML = html;
}

function renderMore(root) {
  const isAuthOn = !!state.auth?.enabled;

  const html = `
    <div class="h1">⚙️ Mais</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">🏷️ Confeitaria</div>

      <div class="field">
        <label class="label">Nome da confeitaria</label>
        <input type="text" class="input" id="inpStoreName" placeholder="Ex: Doces da Ana" value="${escapeHtml(
          state.storeName || ""
        )}" />
      </div>

      <div style="height:10px"></div>
      <button class="btn btn--brand" id="btnSaveStoreName" style="width:100%" type="button">Salvar nome</button>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">🔐 Login</div>

      <div class="row">
        <div class="kpi">
          <b>Modo</b>
          <span>${state.auth.mode === "supabase" ? "Supabase (e-mail/senha)" : "PIN (local)"}</span>
        </div>
        <button class="btn btn--small" id="btnToggleMode" type="button">Trocar</button>
      </div>

      ${
        state.auth.mode === "supabase"
          ? `
        <div style="height:10px"></div>
        <button class="btn btn--danger" id="btnLogout" style="width:100%" type="button">Sair (logout)</button>
      `
          : `
        <div class="row">
          <div class="kpi">
            <b>Proteção por PIN</b>
            <span>${isAuthOn ? "Ativado" : "Desativado"}</span>
          </div>
          <button class="btn btn--small" id="btnTogglePin" type="button">${isAuthOn ? "Desativar" : "Ativar"}</button>
        </div>

        <div class="field mt-12">
          <label class="label">Definir/alterar PIN</label>
          <input type="password" inputmode="numeric" class="input" id="inpPinSet" placeholder="Ex: 1234" value="" />
          <div class="muted" style="font-size:12px;margin-top:6px">Dica: use 4 a 8 números.</div>
        </div>

        <div style="height:10px"></div>
        <button class="btn" id="btnSavePin" style="width:100%" type="button">Salvar PIN</button>

        ${isAuthOn ? `<div style="height:8px"></div>
        <button class="btn" id="btnLockNow" style="width:100%" type="button">🔒 Bloquear agora</button>` : ""}
      `
      }
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">🧹 Dados</div>
      <button class="btn btn--danger" id="btnClearData" style="width:100%" type="button">🗑️ Limpar todos os dados</button>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">ℹ️ Sobre</div>
      <div class="row">
        <div class="kpi"><b>Doce Lucro</b><span>v1.0.2</span></div>
      </div>
      <div class="row">
        <div class="kpi"><b>Armazenamento</b><span>Local (offline) + Login Supabase</span></div>
      </div>
    </section>
  `;

  root.innerHTML = html;

  qs("#btnSaveStoreName")?.addEventListener("click", () => {
    const name = String(qs("#inpStoreName")?.value || "").trim();
    state.storeName = name;
    persist();
    setBrand(state.storeName || "");
    toast("Nome salvo ✅", "success");
  });

  qs("#btnToggleMode")?.addEventListener("click", () => {
    state.auth.mode = state.auth.mode === "supabase" ? "pin" : "supabase";
    persist();
    toast("Modo alterado ✅", "success");
    renderMore(root);
  });

  qs("#btnLogout")?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return toast(error.message, "error");
    session = null;
    cloudUserId = null;
    toast("Saiu ✅", "success");
    render(state.route || "home");
  });

  qs("#btnTogglePin")?.addEventListener("click", () => {
    const enable = !(state.auth?.enabled === true);

    if (enable) {
      if (!state.auth.pin) {
        toast("Defina um PIN antes de ativar.", "error");
        return;
      }
      state.auth.enabled = true;
      state.auth.unlocked = true;
      persist();
      toast("Login PIN ativado ✅", "success");
      renderMore(root);
      return;
    }

    if (confirm("Desativar o login por PIN?")) {
      state.auth.enabled = false;
      state.auth.unlocked = true;
      persist();
      toast("Login PIN desativado ✅", "success");
      renderMore(root);
    }
  });

  qs("#btnSavePin")?.addEventListener("click", () => {
    const pin = String(qs("#inpPinSet")?.value || "").trim();
    const onlyDigits = pin.replace(/\D/g, "");
    if (onlyDigits.length < 4 || onlyDigits.length > 8) {
      toast("PIN inválido. Use 4 a 8 números.", "error");
      return;
    }
    state.auth.pin = onlyDigits;
    persist();
    toast("PIN salvo ✅", "success");
  });

  qs("#btnLockNow")?.addEventListener("click", () => {
    state.auth.unlocked = false;
    persist();
    toast("Bloqueado 🔒", "info");
    render(state.route || "home");
  });

  qs("#btnClearData")?.addEventListener("click", () => {
    if (confirm("⚠️ Tem certeza? Isso vai DELETAR TODOS os dados!")) {
      const keepTheme = state.theme;
      const keepStore = state.storeName;
      const keepAuth = state.auth;

      state = normalizeState(getDefaultState());
      state.theme = keepTheme;
      state.storeName = keepStore;
      state.auth = keepAuth;

      persist();
      setBrand(state.storeName || "");
      toast("Dados limpos ✅", "success");
      renderMore(root);
    }
  });
}

/* =========================================================
   HELPERS
========================================================= */
function draftKeyForOrder(orderId) {
  return orderId ? `edit:${orderId}` : "new";
}

function getOrderDraft(orderId, baseOrder = null) {
  const key = draftKeyForOrder(orderId);
  const draft = (state.ui.orderDraftForm || {})[key];

  if (draft && typeof draft === "object") return { ...draft };

  const init = {
    cliente: baseOrder?.cliente || "",
    whats: baseOrder?.whats || "",
    dataRetirada: baseOrder?.dataRetirada || "",
    taxaEntrega: Number(baseOrder?.taxaEntrega || 0),
    sinal: Number(baseOrder?.sinal || 0),
    status: baseOrder?.status || "aberta",
    metodoSinal: baseOrder?.metodoSinal || "pix",
    metodoRestante: baseOrder?.metodoRestante || "pix",
  };

  setOrderDraft(orderId, init);
  return init;
}

function setOrderDraft(orderId, patch) {
  const key = draftKeyForOrder(orderId);
  const box = state.ui.orderDraftForm && typeof state.ui.orderDraftForm === "object" ? state.ui.orderDraftForm : {};
  box[key] = { ...(box[key] || {}), ...(patch || {}) };
  state.ui.orderDraftForm = box;
  persist();
}

function clearOrderDraft(orderId) {
  const key = draftKeyForOrder(orderId);
  const box = state.ui.orderDraftForm && typeof state.ui.orderDraftForm === "object" ? state.ui.orderDraftForm : {};
  if (box[key]) delete box[key];
  state.ui.orderDraftForm = box;
  persist();
}

// ✅ UX: ao focar em campos de dinheiro, se for "0,00" limpa; senão seleciona tudo
function bindMoneyInputClearOnFocus(root, ids = []) {
  ids.forEach((id) => {
    const el = root.querySelector(`#${id}`);
    if (!el || !(el instanceof HTMLInputElement)) return;

    el.addEventListener("focus", () => {
      const raw = String(el.value || "").trim();
      const v = parseMoneyInput(raw);
      if (!raw || v === 0) {
        el.value = "";
        return;
      }
      try {
        el.select();
      } catch {}
    });
  });
}

function radioPill(_name, value, label, checked) {
  return `
    <button
      class="pill ${checked ? "is-active" : ""}"
      data-pay="${escapeHtml(value)}"
      type="button"
      aria-pressed="${checked ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text ?? "").replace(/[&<>"']/g, (m) => map[m]);
}

function parseMoneyInput(value) {
  if (value === null || value === undefined) return 0;
  let str = String(value).trim();
  if (!str) return 0;

  str = str.replace(/[^\d.,-]/g, "");

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) str = str.replace(/\./g, "").replace(",", ".");
    else str = str.replace(/,/g, "");
  } else if (hasComma) {
    str = str.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

function formatMoneyInput(value) {
  const num = Number(value || 0);
  return num.toFixed(2).replace(".", ",");
}

function computeCartTotals(cart, products, metodo, desconto, acrescimo) {
  const items = cartToItems(cart, products);

  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);

  const taxa = calcCardFee(subtotal, metodo);
  const totalFinal = subtotal + acrescimo - desconto + taxa;

  const lucro = calcProfit(totalFinal, totalCusto, taxa);
  return { subtotal, totalCusto, taxa, totalFinal, lucro };
}

function cartToItems(cart, products) {
  return Object.entries(cart || {})
    .map(([prodId, qty]) => {
      const prod = (products || []).find((p) => p.id === prodId);
      if (!prod) return null;

      return { ...prod, qty: Number(qty || 0), unitPrice: Number(prod.preco || 0), unitCost: Number(prod.custo || 0) };
    })
    .filter(Boolean);
}

function captureFocusState() {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLInputElement)) return null;
  return { id: el.id || null, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocusState(snap) {
  if (!snap || !snap.id) return;
  const el = document.getElementById(snap.id);
  if (!el || !(el instanceof HTMLInputElement)) return;
  try {
    el.focus();
    if (typeof snap.start === "number" && typeof snap.end === "number") el.setSelectionRange(snap.start, snap.end);
  } catch (_) {}
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}
function yearKey() {
  return new Date().toISOString().slice(0, 4);
}

function getTodaySummary() {
  const key = todayKey();
  const sales = (state.sales || []).filter((s) => s.date === key);
  const faturamento = sales.reduce((a, s) => a + Number(s.totalVenda || 0), 0);
  const custos = sales.reduce((a, s) => a + Number(s.totalCusto || 0), 0);
  const taxas = sales.reduce((a, s) => a + Number(s.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);
  return { faturamento, custos, taxas, lucro };
}

function getMonthSummary() {
  const key = monthKey();
  const sales = (state.sales || []).filter((s) => String(s.date || "").startsWith(key));
  const faturamento = sales.reduce((a, s) => a + Number(s.totalVenda || 0), 0);
  const custos = sales.reduce((a, s) => a + Number(s.totalCusto || 0), 0);
  const taxas = sales.reduce((a, s) => a + Number(s.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);
  return { faturamento, custos, taxas, lucro };
}

function getYearSummary() {
  const key = yearKey();
  const sales = (state.sales || []).filter((s) => String(s.date || "").startsWith(key));
  const faturamento = sales.reduce((a, s) => a + Number(s.totalVenda || 0), 0);
  const custos = sales.reduce((a, s) => a + Number(s.totalCusto || 0), 0);
  const taxas = sales.reduce((a, s) => a + Number(s.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);
  return { faturamento, custos, taxas, lucro };
}

function getLast7DaysSummary() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);

    const sales = (state.sales || []).filter((s) => s.date === key);
    const faturamento = sales.reduce((a, s) => a + Number(s.totalVenda || 0), 0);
    const custos = sales.reduce((a, s) => a + Number(s.totalCusto || 0), 0);
    const taxas = sales.reduce((a, s) => a + Number(s.taxaCartao || 0), 0);
    const lucro = calcProfit(faturamento, custos, taxas);

    days.push({ date: key, faturamento, custos, taxas, lucro });
  }
  return days;
}

function renderWeekTable(week) {
  return `
    <table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Faturamento</th>
          <th>Custo</th>
          <th>Lucro</th>
        </tr>
      </thead>
      <tbody>
        ${week
          .map((d) => {
            const label = new Date(d.date).toLocaleDateString("pt-BR", {
              weekday: "short",
              month: "2-digit",
              day: "2-digit",
            });
            return `
            <tr>
              <td>${escapeHtml(label)}</td>
              <td>${brl(d.faturamento)}</td>
              <td>${brl(d.custos)}</td>
              <td style="color:var(--good)">${brl(d.lucro)}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function getOpenOrdersToReceive() {
  const orders = (state.orders || []).filter((o) => o.status === "aberta");
  return orders.reduce((a, o) => a + Math.max(0, Number(o.total || 0) - Number(o.sinal || 0)), 0);
}

function getRemainingDaysInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, lastDay.getDate() - now.getDate());
}

function getCashSummaryForDate(date) {
  const moves = (state.cashMoves || []).filter((m) => m.date === date);

  const dinheiro = moves.filter((m) => m.tipo === "dinheiro").reduce((a, m) => a + Number(m.valor || 0), 0);
  const pix = moves.filter((m) => m.tipo === "pix").reduce((a, m) => a + Number(m.valor || 0), 0);
  const cartao = moves.filter((m) => m.tipo === "cartao").reduce((a, m) => a + Number(m.valor || 0), 0);

  const entradasTotal = dinheiro + pix + cartao;
  const saidas = moves.filter((m) => m.tipo === "saida").reduce((a, m) => a + Number(m.valor || 0), 0);
  const saldo = entradasTotal - saidas;

  return { dinheiro, pix, cartao, entradasTotal, saidas, saldo };
}

function toast(message, type = "info") {
  let existing = qs(".dl-toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = `dl-toast dl-toast--${type} is-visible`;
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 200);
  }, 3000);
}

function seedDemo() {
  state.products = [
    { id: newId(), nome: "Bolo no pote", preco: 25, custo: 8 },
    { id: newId(), nome: "Brigadeiro (pote)", preco: 15, custo: 4 },
    { id: newId(), nome: "Pavê", preco: 35, custo: 12 },
    { id: newId(), nome: "Cupcake", preco: 8, custo: 2.5 },
  ];

  const today = todayKey();
  state.sales = [
    {
      id: newId(),
      date: today,
      createdAt: new Date().toISOString(),
      metodo: "pix",
      items: [{ nome: "Bolo no pote", preco: 25, custo: 8, qty: 2, unitPrice: 25, unitCost: 8 }],
      desconto: 0,
      acrescimo: 0,
      recebido: 0,
      troco: 0,
      totalVenda: 50,
      totalCusto: 16,
      taxaCartao: 0,
      lucro: 34,
    },
  ];

  persist();
}

function registerSW() {
  // Durante DEV (Live Server), não registra service worker pra não cachear arquivos
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// start
mount();