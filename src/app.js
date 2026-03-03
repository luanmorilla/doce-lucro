import { newId } from "./state.js";
import { brl, qs, qsa, setTheme, setBrand } from "./ui.js";
import { calcCardFee, calcProfit, calcMargin, calcROI } from "./db.js";
import { supabase } from "./supabase.js";

// ✅ Store central (fonte da verdade)
import { getState, setState, persist } from "./core/store.js";

// ✅ Cloud (módulo único)
import {
  refreshSession,
  getUserId,
  applyCloudAfterLogin,
  bindAuthListener,
  bindCloudSaveHook,
  unbindCloudSaveHook,
} from "./features/cloud/cloud.js";

// ✅ Products separado (página oficial)
import { renderProducts as renderProductsPage } from "./features/products/products.page.js";

// ✅ Helpers compartilhados (NÃO re-declarar no app.js)
import { toast, escapeHtml, parseMoneyInput, formatMoneyInput } from "./utils/helpers.js";

/* =========================================================
   DOCE LUCRO — APP.JS (ROBUSTO / SEM PLACEHOLDERS)
========================================================= */

let state = getState();

// (evita bind duplicado)
let saleBound = false;
let saleInputDebounce = null;

let ordersBound = false;
let reportsBound = false;
let moreBound = false;

/* =========================================================
   🔧 HELPERS INTERNOS (NÃO CONFLITAM COM IMPORTS)
========================================================= */

function syncThemeIcon(btnTheme) {
  const s = getState();
  const icon = btnTheme?.querySelector(".icon");
  if (icon) icon.textContent = s.theme === "light" ? "☀️" : "🌙";
}

function commit(mutator) {
  const s = getState();
  mutator(s);
  setState(s);
  persist();
  state = getState();
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

function clampMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, x);
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function fmtDateBR(iso) {
  try {
    const d = new Date(String(iso || ""));
    if (Number.isNaN(d.getTime())) return String(iso || "");
    return d.toLocaleDateString("pt-BR");
  } catch {
    return String(iso || "");
  }
}

/* =========================================================
   ✅ ROUTER / RENDER
========================================================= */

function navigate(route, silent = false) {
  const r = String(route || "home").trim() || "home";

  commit((s) => {
    s.route = r;
  });

  qsa(".nav__item").forEach((b) => b.classList.toggle("is-active", b.dataset.route === r));

  render(r);

  try {
    if ((location.hash || "").replace("#", "") !== r) {
      history.replaceState(null, "", `#${r}`);
    }
  } catch (_) {}

  if (!silent) window.scrollTo({ top: 0, behavior: "smooth" });
}

function render(route) {
  state = getState();
  const root = qs("#viewRoot");
  if (!root) return;

  // Supabase login screen (se modo supabase e não logado)
  if (state.auth?.mode === "supabase") {
    if (!getUserId()) {
      renderSupabaseLogin(root);
      return;
    }
  }

  // PIN lock (opcional)
  if (state.auth?.mode === "pin" && state.auth?.enabled && !state.auth?.unlocked && route !== "more") {
    renderPinLockScreen(root);
    return;
  }

  const routes = {
    home: () => renderHome(root),
    sale: () => renderSale(root),
    orders: () => renderOrders(root),
    products: () => renderProductsPage(root),
    reports: () => renderReports(root),
    more: () => renderMore(root),
  };

  (routes[route] || routes.home)();
}

function normalizeRoute(r) {
  return String(r || "").replace("#", "").trim();
}

function shouldShowNav(route, isLogged) {
  // esconde no login e quando não está logado
  if (!isLogged) return false;
  if (route === "login") return false;
  return true;
}

function setNavVisible(visible) {
  const nav = qs(".nav");
  if (!nav) return;
  nav.style.display = visible ? "flex" : "none";
}

// ✅ deixa a nav com 4 itens no mobile, sem quebrar no iPhone
function enforceNavFourItems() {
  // mantém só esses 4
  const keep = new Set(["home", "sale", "orders", "products"]);

  qsa(".nav__item").forEach((btn) => {
    const r = btn?.dataset?.route;
    if (!r) return;

    if (!keep.has(r)) {
      btn.style.display = "none"; // some com reports e more
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    } else {
      btn.style.display = ""; // garante que os 4 aparecem
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
    }
  });
}

async function mount() {
  state = getState();

  // ✅ aplica tema/marca logo de cara (evita “tela preta” sem UI)
  setTheme(state.theme || "dark");
  setBrand(state.storeName || "");

  const btnTheme = qs("#btnTheme");
  syncThemeIcon(btnTheme);

  btnTheme?.addEventListener("click", () => {
    commit((s) => {
      s.theme = s.theme === "light" ? "dark" : "light";
    });
    setTheme(getState().theme);
    syncThemeIcon(btnTheme);
  });

  // ✅ força nav com 4 itens (corrige “Mais” quebrado no iPhone)
  enforceNavFourItems();

  // wrapper pra sempre controlar nav visível antes/depois de navegar
  const go = async (route, replace = false) => {
    const r = normalizeRoute(route);
    const logged = !!getUserId();

    // ✅ se não estiver logado, SEMPRE joga pra login
    const finalRoute = logged ? (r || "home") : "login";

    // ✅ esconde/mostra a nav antes de renderizar a tela
    setNavVisible(shouldShowNav(finalRoute, logged));

    // agora navega normal
    return navigate(finalRoute, replace);
  };

  window.addEventListener("hashchange", () => {
    const r = normalizeRoute(location.hash);
    go(r, true);
  });

  // ✅ clique dos botões
  qsa(".nav__item").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.route));
  });

  // ✅ sessão + cloud
  await refreshSession();

  if (getUserId()) {
    bindCloudSaveHook();
    await applyCloudAfterLogin(); // pega cloud -> aplica no store
    state = getState();
    setTheme(state.theme || "dark");
    setBrand(state.storeName || "");
    syncThemeIcon(btnTheme);
  } else {
    unbindCloudSaveHook();
  }

  // ✅ rota inicial (sem “tela preta”)
  const hashRoute = normalizeRoute(location.hash);
  await go(hashRoute || state.route || "home", true);

  // UX dinheiro global
  bindGlobalMoneyUX();
}

/* =========================================================
   ✅ AUTH LISTENER (UM SÓ)
========================================================= */
bindAuthListener({
  onLoggedIn: async () => {
    await applyCloudAfterLogin();
    render(getState().route || "home");
  },
  onLoggedOut: async () => {
    render(getState().route || "home");
  },
});

/* =========================================================
   ✅ AUTH UI (SUPABASE)
========================================================= */

async function doLogin(email, password) {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("ERRO LOGIN:", err);
    toast(err?.message || "Erro ao fazer login", "error");
    return false;
  }
}

async function doSignup(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // se confirmação email ativa
    if (!data?.session) {
      toast("Conta criada! Confirme o e-mail para entrar.", "info");
      return false;
    }
    return true;
  } catch (err) {
    console.error("ERRO SIGNUP:", err);
    toast(err?.message || "Erro ao criar conta", "error");
    return false;
  }
}

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
        Dica: se a confirmação por e-mail estiver ativada no Supabase, confirme no e-mail ao criar conta.
      </div>
    </section>
  `;

  root.innerHTML = html;

  const getCreds = () => {
    const email = (qs("#authEmail")?.value || "").trim();
    const password = (qs("#authPass")?.value || "").trim();
    return { email, password };
  };

  qs("#btnLogin")?.addEventListener("click", async () => {
    const { email, password } = getCreds();
    if (!email || !password) return toast("Preencha e-mail e senha", "error");

    const ok = await doLogin(email, password);
    if (!ok) return;

    toast("Logado ✅", "success");
  });

  qs("#btnSignup")?.addEventListener("click", async () => {
    const { email, password } = getCreds();
    if (!email || !password) return toast("Preencha e-mail e senha", "error");

    const ok = await doSignup(email, password);
    if (!ok) return;

    toast("Conta criada ✅", "success");
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
   PIN LOCK SCREEN
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
    const s = getState();
    const pin = String(qs("#inpPinLogin")?.value || "").trim();
    if (!pin) return toast("Digite o PIN", "error");
    if (pin !== String(s.auth?.pin || "")) return toast("PIN incorreto", "error");

    commit((st) => {
      st.auth.unlocked = true;
    });

    toast("Bem-vindo ✅", "success");
    render(getState().route || "home");
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

function statCard(label, value, icon = "") {
  return `
    <div class="card stat">
      <div style="font-size:24px;margin-bottom:8px">${icon}</div>
      <div class="stat__label">${escapeHtml(label)}</div>
      <div class="stat__value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderHome(root) {
  state = getState();

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
  qs("#btnCashOut")?.addEventListener("click", () => showCashOutModal());

  qs("#btnEditMeta")?.addEventListener("click", () => {
    const atual = Number(getState().metaMensal || 0);
    const v = prompt("Defina sua meta de LUCRO do mês (em R$). Ex: 3000", String(atual));
    if (v === null) return;

    const num = parseMoneyInput(v);
    if (!Number.isFinite(num) || num < 0) return toast("Valor inválido. Use um número como 3000.", "error");

    commit((s) => {
      s.mesRef = monthKey();
      s.metaMensal = num;
    });

    toast("Meta atualizada ✅", "success");
    renderHome(root);
  });
}

/* =========================================================
   ✅ SAÍDA DE CAIXA (modal)
========================================================= */

function showCashOutModal() {
  const container = qs("#modalContainer");
  if (!container) return toast("ModalContainer não encontrado (#modalContainer).", "error");

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

    commit((s) => {
      s.cashMoves = Array.isArray(s.cashMoves) ? s.cashMoves : [];
      s.cashMoves.push({
        id: newId(),
        date,
        tipo: "saida",
        valor,
        createdAt: new Date().toISOString(),
        note: `${labelTipo}: ${desc}`,
        categoria,
        descricao: desc,
      });
    });

    modal?.remove();
    toast("Saída registrada ✅", "success");
    render(getState().route || "home");
  });
}

/* =========================================================
   ✅ SALE (Balcão) — (mantido igual ao seu)
========================================================= */

function renderSale(root) {
  state = getState();
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

  const cart = state.ui?.saleCart || {};
  const metodo = state.ui?.salePay || "pix";
  const desconto = Number(state.ui?.saleDiscount || 0);
  const acrescimo = Number(state.ui?.saleExtra || 0);
  const recebido = Number(state.ui?.saleReceived || 0);

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
        <input type="text" inputmode="decimal" class="input" id="inpDiscount" placeholder="0,00" value="${formatMoneyInput(desconto)}" />
      </div>

      <div class="field mt-12">
        <div class="label">Acréscimo (entrega, etc)</div>
        <input type="text" inputmode="decimal" class="input" id="inpExtra" placeholder="0,00" value="${formatMoneyInput(acrescimo)}" />
      </div>

      ${
        metodo === "dinheiro"
          ? `
        <div class="field mt-12">
          <div class="label">Recebido em dinheiro</div>
          <input type="text" inputmode="decimal" class="input" id="inpRecebido" placeholder="0,00" value="${formatMoneyInput(recebido)}" />
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
      if (getState().route !== "sale") return;

      const t = e.target;

      const payBtn = t.closest?.("[data-pay]");
      if (payBtn) {
        commit((s) => {
          s.ui = s.ui || {};
          s.ui.salePay = payBtn.dataset.pay || "pix";
          s.ui.saleReceived = 0;
        });
        renderSale(root);
        return;
      }

      const opBtn = t.closest?.("[data-op]");
      if (opBtn) {
        const prodId = opBtn.dataset.prod;
        const op = opBtn.dataset.op;

        commit((s) => {
          s.ui = s.ui || {};
          const cartX = s.ui.saleCart || {};
          const qty = cartX[prodId] || 0;
          cartX[prodId] = op === "plus" ? qty + 1 : Math.max(0, qty - 1);
          if (cartX[prodId] === 0) delete cartX[prodId];
          s.ui.saleCart = cartX;
        });

        renderSale(root);
        return;
      }

      if (t.closest?.("#btnFinalizeSale")) return finalizeSale(root);

      if (t.closest?.("#btnClearCart")) {
        commit((s) => {
          s.ui = s.ui || {};
          s.ui.saleCart = {};
          s.ui.saleDiscount = 0;
          s.ui.saleExtra = 0;
          s.ui.saleReceived = 0;
        });
        renderSale(root);
        return;
      }
    });

    root.addEventListener("input", (e) => {
      if (getState().route !== "sale") return;
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;

      if (el.id === "inpDiscount") {
        commit((s) => {
          s.ui = s.ui || {};
          s.ui.saleDiscount = parseMoneyInput(el.value);
        });
        debounceSaleRecalc(root);
      }
      if (el.id === "inpExtra") {
        commit((s) => {
          s.ui = s.ui || {};
          s.ui.saleExtra = parseMoneyInput(el.value);
        });
        debounceSaleRecalc(root);
      }
      if (el.id === "inpRecebido") {
        commit((s) => {
          s.ui = s.ui || {};
          s.ui.saleReceived = parseMoneyInput(el.value);
        });
        debounceSaleRecalc(root);
      }
    });

    root.addEventListener(
      "blur",
      (e) => {
        if (getState().route !== "sale") return;
        const el = e.target;
        if (!(el instanceof HTMLInputElement)) return;
        if (el.id === "inpDiscount" || el.id === "inpExtra" || el.id === "inpRecebido") {
          renderSale(root);
        }
      },
      true
    );
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
  const s = getState();
  if (s.route !== "sale") return;

  const products = s.products || [];
  const cart = s.ui?.saleCart || {};
  const metodo = s.ui?.salePay || "pix";
  const desconto = Number(s.ui?.saleDiscount || 0);
  const acrescimo = Number(s.ui?.saleExtra || 0);
  const recebido = Number(s.ui?.saleReceived || 0);

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
  const s = getState();
  const products = s.products || [];
  const cart = s.ui?.saleCart || {};
  const metodo = s.ui?.salePay || "pix";
  const desconto = Number(s.ui?.saleDiscount || 0);
  const acrescimo = Number(s.ui?.saleExtra || 0);
  const recebido = Number(s.ui?.saleReceived || 0);

  if (Object.keys(cart).length === 0) return toast("Carrinho vazio!", "error");

  const totals = computeCartTotals(cart, products, metodo, desconto, acrescimo);
  const falta = metodo === "dinheiro" ? Math.max(0, totals.totalFinal - recebido) : 0;
  if (metodo === "dinheiro" && falta > 0) return toast(`Falta receber ${brl(falta)}`, "error");

  const items = cartToItems(cart, products);

  commit((st) => {
    st.sales = Array.isArray(st.sales) ? st.sales : [];
    st.cashMoves = Array.isArray(st.cashMoves) ? st.cashMoves : [];
    st.ui = st.ui || {};

    st.sales.push({
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
    });

    st.ui.saleCart = {};
    st.ui.saleDiscount = 0;
    st.ui.saleExtra = 0;
    st.ui.saleReceived = 0;
    st.ui.salePay = "pix";

    const tipo = metodo === "dinheiro" ? "dinheiro" : metodo === "pix" ? "pix" : "cartao";
    st.cashMoves.push({
      id: newId(),
      date: todayKey(),
      tipo,
      valor: totals.totalFinal,
      createdAt: new Date().toISOString(),
      note: "Venda balcão",
    });
  });

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
   ✅ ORDERS (ENCOMENDAS) — COMPLETO
========================================================= */

function ensureOrdersShape(s) {
  s.orders = Array.isArray(s.orders) ? s.orders : [];
  s.ui = s.ui || {};
  s.ui.ordersFilter = s.ui.ordersFilter || "abertas"; // abertas | entregues | canceladas | todas
}

function getOrderTotals(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const totalVenda = items.reduce((a, i) => a + Number(i.total || 0), 0);
  const totalCusto = items.reduce((a, i) => a + Number(i.totalCusto || 0), 0);
  const taxa = calcCardFee(totalVenda, order?.pagamento || "pix");
  const desconto = Number(order?.desconto || 0);
  const acrescimo = Number(order?.acrescimo || 0);
  const totalFinal = totalVenda + acrescimo - desconto + taxa;
  const lucro = calcProfit(totalFinal, totalCusto, taxa);
  const sinal = Number(order?.sinal || 0);
  const aReceber = Math.max(0, totalFinal - sinal);
  return { totalVenda, totalCusto, taxa, totalFinal, lucro, sinal, aReceber };
}

function renderOrders(root) {
  state = getState();
  ensureOrdersShape(state);

  const filter = state.ui.ordersFilter || "abertas";
  const all = state.orders || [];
  const list =
    filter === "todas"
      ? all
      : all.filter((o) => {
          const st = o.status || "aberta";
          if (filter === "abertas") return st === "aberta";
          if (filter === "entregues") return st === "entregue";
          if (filter === "canceladas") return st === "cancelada";
          return true;
        });

  // soma rápido
  const sumAReceber = list
    .filter((o) => (o.status || "aberta") === "aberta")
    .reduce((a, o) => a + getOrderTotals(o).aReceber, 0);

  const html = `
    <div class="h1">📦 Encomendas</div>

    <section class="card section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">Controle de encomendas</div>
          <div class="muted" style="font-size:12px;margin-top:4px">Organize pedidos, sinal e o que falta receber.</div>
        </div>

        <button class="btn btn--brand" id="btnNewOrder" type="button">➕ Nova encomenda</button>
      </div>

      <div style="height:12px"></div>

      <div class="pillrow">
        <button class="pill ${filter === "abertas" ? "is-active" : ""}" data-ordf="abertas" type="button">Abertas</button>
        <button class="pill ${filter === "entregues" ? "is-active" : ""}" data-ordf="entregues" type="button">Entregues</button>
        <button class="pill ${filter === "canceladas" ? "is-active" : ""}" data-ordf="canceladas" type="button">Canceladas</button>
        <button class="pill ${filter === "todas" ? "is-active" : ""}" data-ordf="todas" type="button">Todas</button>
      </div>

      <div style="height:10px"></div>

      <div class="row" style="border-top:0">
        <div class="kpi"><b>💸 Total a receber</b><span>Somente encomendas abertas</span></div>
        <div class="badge">${brl(sumAReceber)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      ${
        list.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state__icon">📦</div>
          <div class="empty-state__title">Nada por aqui</div>
          <div class="empty-state__description">Crie sua primeira encomenda e acompanhe o que falta receber.</div>
          <button class="btn btn--brand" id="btnNewOrder2" type="button">➕ Nova encomenda</button>
        </div>
      `
          : `
        <div class="muted" style="font-size:12px;margin-bottom:10px">
          Toque em uma encomenda para ver detalhes / editar.
        </div>

        <div class="cartbox" id="ordersList">
          ${list
            .slice()
            .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
            .map((o) => renderOrderCard(o))
            .join("")}
        </div>
      `
      }
    </section>
  `;

  root.innerHTML = html;

  // binds
  const bindNew = () => showOrderModal({ mode: "new" });
  qs("#btnNewOrder")?.addEventListener("click", bindNew);
  qs("#btnNewOrder2")?.addEventListener("click", bindNew);

  // filtros
  if (!ordersBound) {
    ordersBound = true;

    root.addEventListener("click", (e) => {
      if (getState().route !== "orders") return;
      const t = e.target;

      const fbtn = t.closest?.("[data-ordf]");
      if (fbtn) {
        const v = fbtn.dataset.ordf || "abertas";
        commit((s) => {
          ensureOrdersShape(s);
          s.ui.ordersFilter = v;
        });
        renderOrders(root);
        return;
      }

      const openBtn = t.closest?.("[data-open-order]");
      if (openBtn) {
        const id = openBtn.dataset.openOrder;
        const s = getState();
        const ord = (s.orders || []).find((x) => x.id === id);
        if (!ord) return toast("Encomenda não encontrada.", "error");
        showOrderModal({ mode: "edit", orderId: id });
        return;
      }
    });
  }
}

function renderOrderCard(order) {
  const o = order || {};
  const st = o.status || "aberta";
  const totals = getOrderTotals(o);

  const badgeClass =
    st === "entregue" ? "badge--good" : st === "cancelada" ? "badge--bad" : "badge--warn";

  const titulo = safeStr(o.cliente) ? `👩‍🍳 ${o.cliente}` : "👩‍🍳 Cliente";
  const entrega = o.entrega ? fmtDateBR(o.entrega) : "—";
  const criado = o.date ? fmtDateBR(o.date) : fmtDateBR(o.createdAt);

  return `
    <div class="card section" style="padding:14px" data-open-order="${escapeHtml(o.id)}" role="button" tabindex="0">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="min-width:0">
          <div style="font-weight:950;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(
            titulo
          )}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">
            Criado: ${escapeHtml(criado)} • Entrega: ${escapeHtml(entrega)}
          </div>
        </div>

        <div class="badge ${badgeClass}">
          ${st === "aberta" ? "Aberta" : st === "entregue" ? "Entregue" : "Cancelada"}
        </div>
      </div>

      <div style="height:10px"></div>

      <div class="row" style="border-top:0;padding:10px 0">
        <div class="kpi"><b>Total</b><span>Com taxa/desconto</span></div>
        <div class="value">${brl(totals.totalFinal)}</div>
      </div>

      <div class="row" style="padding:10px 0">
        <div class="kpi"><b>Sinal</b><span>Já recebeu</span></div>
        <div class="value">${brl(totals.sinal)}</div>
      </div>

      <div class="row" style="padding:10px 0">
        <div class="kpi"><b>Falta</b><span>A receber</span></div>
        <div class="value" style="color:${st === "aberta" ? "var(--warn)" : "var(--muted)"}">${brl(
          totals.aReceber
        )}</div>
      </div>

      <div style="height:10px"></div>
      <button class="btn btn--small" style="width:100%" type="button" data-open-order="${escapeHtml(
        o.id
      )}">Ver / Editar</button>
    </div>
  `;
}

function showOrderModal({ mode, orderId }) {
  const container = qs("#modalContainer");
  if (!container) return toast("ModalContainer não encontrado (#modalContainer).", "error");

  const s = getState();
  ensureOrdersShape(s);
  const products = Array.isArray(s.products) ? s.products : [];

  const existing = mode === "edit" ? (s.orders || []).find((x) => x.id === orderId) : null;

  const draft = existing
    ? structuredClone(existing)
    : {
        id: newId(),
        status: "aberta",
        date: todayKey(),
        createdAt: new Date().toISOString(),
        cliente: "",
        telefone: "",
        entrega: todayKey(),
        pagamento: "pix",
        desconto: 0,
        acrescimo: 0,
        sinal: 0,
        obs: "",
        items: [],
      };

  const totals = getOrderTotals(draft);

  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${mode === "edit" ? "✏️ Editar encomenda" : "➕ Nova encomenda"}</div>
          <button class="modal__close" id="closeOrderModal" type="button">X</button>
        </div>

        <div class="fieldgrid">
          <div class="field">
            <label class="label">Cliente</label>
            <input class="input" id="ordCliente" type="text" placeholder="Nome do cliente" value="${escapeHtml(
              draft.cliente || ""
            )}" />
          </div>

          <div class="field">
            <label class="label">Telefone (opcional)</label>
            <input class="input" id="ordTel" type="tel" placeholder="(11) 99999-9999" value="${escapeHtml(
              draft.telefone || ""
            )}" />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="fieldgrid">
          <div class="field">
            <label class="label">Data</label>
            <input class="input" id="ordDate" type="date" value="${escapeHtml(draft.date || todayKey())}" />
          </div>

          <div class="field">
            <label class="label">Entrega</label>
            <input class="input" id="ordEntrega" type="date" value="${escapeHtml(
              draft.entrega || todayKey()
            )}" />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="field">
          <div class="label">Pagamento</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="pill ${draft.pagamento === "pix" ? "is-active" : ""}" data-ordpay="pix" type="button">📱 Pix</button>
            <button class="pill ${draft.pagamento === "dinheiro" ? "is-active" : ""}" data-ordpay="dinheiro" type="button">💵 Dinheiro</button>
            <button class="pill ${draft.pagamento === "cartao" ? "is-active" : ""}" data-ordpay="cartao" type="button">💳 Cartão</button>
          </div>
        </div>

        <div style="height:12px"></div>

        <section class="card section" style="padding:14px">
          <div style="font-weight:950;margin-bottom:8px">🍰 Itens da encomenda</div>

          ${
            products.length === 0
              ? `
              <div class="muted" style="font-size:12px">
                Você ainda não cadastrou produtos. Vá em <b>Produtos</b> para cadastrar e depois volte aqui.
              </div>
            `
              : `
              <div class="field">
                <label class="label">Adicionar produto</label>
                <select class="select" id="ordAddProd">
                  <option value="">Selecione um produto...</option>
                  ${products
                    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)} — ${brl(p.preco)}</option>`)
                    .join("")}
                </select>
              </div>

              <div style="height:10px"></div>

              <div class="cartbox" id="ordItems">
                ${renderOrderItems(draft.items || [])}
              </div>

              <div style="height:10px"></div>
              <button class="btn" id="btnAddCustomItem" style="width:100%" type="button">➕ Adicionar item manual</button>
            `
          }
        </section>

        <div style="height:12px"></div>

        <div class="fieldgrid">
          <div class="field">
            <label class="label">Desconto</label>
            <input class="input" id="ordDesconto" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyInput(
              Number(draft.desconto || 0)
            )}" />
          </div>
          <div class="field">
            <label class="label">Acréscimo</label>
            <input class="input" id="ordAcrescimo" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyInput(
              Number(draft.acrescimo || 0)
            )}" />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="fieldgrid">
          <div class="field">
            <label class="label">Sinal recebido</label>
            <input class="input" id="ordSinal" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyInput(
              Number(draft.sinal || 0)
            )}" />
          </div>

          <div class="field">
            <label class="label">Status</label>
            <select class="select" id="ordStatus">
              <option value="aberta" ${draft.status === "aberta" ? "selected" : ""}>Aberta</option>
              <option value="entregue" ${draft.status === "entregue" ? "selected" : ""}>Entregue</option>
              <option value="cancelada" ${draft.status === "cancelada" ? "selected" : ""}>Cancelada</option>
            </select>
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="field">
          <label class="label">Observações</label>
          <input class="input" id="ordObs" type="text" placeholder="Ex: sem lactose, topper, entrega às 18h..." value="${escapeHtml(
            draft.obs || ""
          )}" />
        </div>

        <div style="height:12px"></div>

        <section class="card section" style="background:rgba(255,79,163,0.08);border-color:rgba(255,79,163,0.25)">
          <div class="row" style="border-top:0">
            <div class="kpi"><b>Total</b><span>Com taxa/desconto</span></div>
            <div class="value" id="ordTotal">${brl(totals.totalFinal)}</div>
          </div>
          <div class="row">
            <div class="kpi"><b>Lucro</b><span>Estimado</span></div>
            <div class="value" id="ordLucro" style="color:var(--good)">${brl(totals.lucro)}</div>
          </div>
          <div class="row">
            <div class="kpi"><b>Falta receber</b><span>Total − sinal</span></div>
            <div class="value" id="ordFalta" style="color:var(--warn)">${brl(totals.aReceber)}</div>
          </div>
        </section>

        <div style="height:12px"></div>

        <button class="btn btn--brand" id="btnSaveOrder" style="width:100%" type="button">${
          mode === "edit" ? "Salvar alterações" : "Salvar encomenda"
        }</button>

        ${
          mode === "edit"
            ? `
          <div style="height:8px"></div>
          <button class="btn btn--danger" id="btnDeleteOrder" style="width:100%" type="button">🗑️ Excluir encomenda</button>
        `
            : ""
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  const modal = container.querySelector(".modal");
  const close = () => modal?.remove();

  container.querySelector("#closeOrderModal")?.addEventListener("click", close);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  // money UX
  bindMoneyInputClearOnFocus(container, ["ordDesconto", "ordAcrescimo", "ordSinal"]);

  // state local do modal
  let local = draft;

  const recomputeAndPaint = () => {
    const totalsX = getOrderTotals(local);
    const setText = (id, v) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.textContent = v;
    };
    setText("ordTotal", brl(totalsX.totalFinal));
    setText("ordLucro", brl(totalsX.lucro));
    setText("ordFalta", brl(totalsX.aReceber));
  };

  const renderItemsInto = () => {
    const box = container.querySelector("#ordItems");
    if (!box) return;
    box.innerHTML = renderOrderItems(local.items || []);
  };

  // pagamento pills
  container.querySelectorAll("[data-ordpay]")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const pay = btn.dataset.ordpay || "pix";
      local.pagamento = pay;
      // atualiza pills
      container.querySelectorAll("[data-ordpay]")?.forEach((b) => {
        b.classList.toggle("is-active", b.dataset.ordpay === pay);
        b.setAttribute("aria-pressed", b.dataset.ordpay === pay ? "true" : "false");
      });
      recomputeAndPaint();
    });
  });

  // add product
  container.querySelector("#ordAddProd")?.addEventListener("change", (e) => {
    const sel = e.target;
    const prodId = String(sel.value || "").trim();
    if (!prodId) return;

    const s2 = getState();
    const products2 = Array.isArray(s2.products) ? s2.products : [];
    const p = products2.find((x) => x.id === prodId);
    if (!p) return toast("Produto não encontrado.", "error");

    const exists = (local.items || []).find((it) => it.prodId === prodId);
    if (exists) {
      exists.qty = Number(exists.qty || 0) + 1;
      exists.total = Number(exists.qty || 0) * Number(exists.unitPrice || 0);
      exists.totalCusto = Number(exists.qty || 0) * Number(exists.unitCost || 0);
    } else {
      local.items = Array.isArray(local.items) ? local.items : [];
      local.items.push({
        id: newId(),
        prodId: p.id,
        nome: p.nome,
        qty: 1,
        unitPrice: Number(p.preco || 0),
        unitCost: Number(p.custo || 0),
        total: Number(p.preco || 0),
        totalCusto: Number(p.custo || 0),
        isCustom: false,
      });
    }

    sel.value = "";
    renderItemsInto();
    recomputeAndPaint();
  });

  // add custom item
  container.querySelector("#btnAddCustomItem")?.addEventListener("click", () => {
    local.items = Array.isArray(local.items) ? local.items : [];
    local.items.push({
      id: newId(),
      prodId: null,
      nome: "Item",
      qty: 1,
      unitPrice: 0,
      unitCost: 0,
      total: 0,
      totalCusto: 0,
      isCustom: true,
    });
    renderItemsInto();
    recomputeAndPaint();
  });

  // items actions
  container.addEventListener("click", (e) => {
    const t = e.target;

    const op = t.closest?.("[data-oit-op]");
    if (op) {
      const itemId = op.dataset.oitId;
      const which = op.dataset.oitOp;
      const item = (local.items || []).find((x) => x.id === itemId);
      if (!item) return;

      if (which === "del") {
        local.items = (local.items || []).filter((x) => x.id !== itemId);
        renderItemsInto();
        recomputeAndPaint();
        return;
      }

      const qty = Number(item.qty || 0);
      item.qty = which === "plus" ? qty + 1 : Math.max(1, qty - 1);
      item.total = Number(item.qty || 0) * Number(item.unitPrice || 0);
      item.totalCusto = Number(item.qty || 0) * Number(item.unitCost || 0);

      renderItemsInto();
      recomputeAndPaint();
      return;
    }
  });

  // item edits (nome, preço, custo)
  container.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;

    // cabeçalho
    if (el.id === "ordCliente") local.cliente = safeStr(el.value);
    if (el.id === "ordTel") local.telefone = safeStr(el.value);
    if (el.id === "ordObs") local.obs = safeStr(el.value);

    if (el.id === "ordDesconto") {
      local.desconto = clampMoney(parseMoneyInput(el.value));
      recomputeAndPaint();
    }
    if (el.id === "ordAcrescimo") {
      local.acrescimo = clampMoney(parseMoneyInput(el.value));
      recomputeAndPaint();
    }
    if (el.id === "ordSinal") {
      local.sinal = clampMoney(parseMoneyInput(el.value));
      recomputeAndPaint();
    }

    // items
    const itemId = el.dataset?.oitId;
    const field = el.dataset?.oitField;
    if (itemId && field) {
      const item = (local.items || []).find((x) => x.id === itemId);
      if (!item) return;

      if (field === "nome") {
        item.nome = safeStr(el.value) || "Item";
      }
      if (field === "price") {
        item.unitPrice = clampMoney(parseMoneyInput(el.value));
        item.total = Number(item.qty || 0) * Number(item.unitPrice || 0);
      }
      if (field === "cost") {
        item.unitCost = clampMoney(parseMoneyInput(el.value));
        item.totalCusto = Number(item.qty || 0) * Number(item.unitCost || 0);
      }

      // mantém números atualizados sem re-render total
      recomputeAndPaint();
    }
  });

  // date/status
  container.querySelector("#ordDate")?.addEventListener("change", (e) => {
    local.date = String(e.target.value || todayKey());
  });
  container.querySelector("#ordEntrega")?.addEventListener("change", (e) => {
    local.entrega = String(e.target.value || todayKey());
  });
  container.querySelector("#ordStatus")?.addEventListener("change", (e) => {
    local.status = String(e.target.value || "aberta");
    recomputeAndPaint();
  });

  // salvar
  container.querySelector("#btnSaveOrder")?.addEventListener("click", () => {
    // valida
    local.cliente = safeStr(container.querySelector("#ordCliente")?.value || local.cliente);
    local.telefone = safeStr(container.querySelector("#ordTel")?.value || local.telefone);
    local.obs = safeStr(container.querySelector("#ordObs")?.value || local.obs);
    local.date = safeStr(container.querySelector("#ordDate")?.value || local.date) || todayKey();
    local.entrega = safeStr(container.querySelector("#ordEntrega")?.value || local.entrega) || todayKey();

    const totalsX = getOrderTotals(local);
    if (!Array.isArray(local.items) || local.items.length === 0) {
      return toast("Adicione pelo menos 1 item na encomenda.", "error");
    }
    if (totalsX.totalFinal <= 0) return toast("Total inválido. Ajuste itens/preços.", "error");
    if (local.sinal > totalsX.totalFinal) return toast("Sinal não pode ser maior que o total.", "error");

    commit((st) => {
      ensureOrdersShape(st);
      st.orders = Array.isArray(st.orders) ? st.orders : [];

      const idx = st.orders.findIndex((x) => x.id === local.id);
      if (idx >= 0) st.orders[idx] = local;
      else st.orders.push(local);

      // opcional: quando marcar como entregue, registrar entrada no caixa se ainda não registrou
      // (evita duplicar entrada)
      if (local.status === "entregue") {
        st.cashMoves = Array.isArray(st.cashMoves) ? st.cashMoves : [];
        const already = st.cashMoves.find((m) => m?.note === `Encomenda ${local.id}` && m?.tipo !== "saida");
        if (!already) {
          // se recebeu sinal antes, consideramos que isso pode ter entrado no caixa na hora do sinal (não controlado aqui).
          // aqui registramos a entrada do "restante" (aReceber)
          const rest = Math.max(0, totalsX.totalFinal - Number(local.sinal || 0));
          if (rest > 0) {
            const tipo =
              local.pagamento === "dinheiro" ? "dinheiro" : local.pagamento === "pix" ? "pix" : "cartao";
            st.cashMoves.push({
              id: newId(),
              date: local.date || todayKey(),
              tipo,
              valor: rest,
              createdAt: new Date().toISOString(),
              note: `Encomenda ${local.id}`,
            });
          }
        }
      }
    });

    toast(mode === "edit" ? "Encomenda atualizada ✅" : "Encomenda criada ✅", "success");
    close();
    renderOrders(qs("#viewRoot"));
  });

  // deletar
  container.querySelector("#btnDeleteOrder")?.addEventListener("click", () => {
    if (!confirm("Tem certeza que deseja excluir esta encomenda?")) return;

    commit((st) => {
      ensureOrdersShape(st);
      st.orders = (st.orders || []).filter((x) => x.id !== local.id);
    });

    toast("Encomenda excluída ✅", "success");
    close();
    renderOrders(qs("#viewRoot"));
  });

  // primeira pintura
  renderItemsInto();
  recomputeAndPaint();
}

function renderOrderItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return `<div class="muted" style="font-size:12px">Nenhum item adicionado ainda.</div>`;
  }

  return list
    .map((it) => {
      const nome = safeStr(it.nome) || "Item";
      const qty = Number(it.qty || 1);
      const unitPrice = Number(it.unitPrice || 0);
      const unitCost = Number(it.unitCost || 0);

      return `
        <div class="cartrow" style="align-items:flex-start;gap:10px">
          <div style="min-width:0;flex:1">
            <div style="font-weight:950;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(nome)}
            </div>
            <div class="muted" style="font-size:12px;margin-top:4px">
              Venda: ${brl(unitPrice)} • Custo: ${brl(unitCost)}
            </div>

            <div style="height:10px"></div>

            <div class="fieldgrid" style="grid-template-columns:1fr 1fr;gap:10px">
              <div class="field">
                <label class="label" style="font-size:10px">Nome</label>
                <input class="input" data-oit-id="${escapeHtml(it.id)}" data-oit-field="nome" type="text" value="${escapeHtml(
        nome
      )}" />
              </div>
              <div class="field">
                <label class="label" style="font-size:10px">Preço</label>
                <input class="input" data-oit-id="${escapeHtml(it.id)}" data-oit-field="price" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyInput(
        unitPrice
      )}" />
              </div>
              <div class="field">
                <label class="label" style="font-size:10px">Custo</label>
                <input class="input" data-oit-id="${escapeHtml(it.id)}" data-oit-field="cost" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyInput(
        unitCost
      )}" />
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
            <div class="qty">
              <button class="qbtn" data-oit-op="minus" data-oit-id="${escapeHtml(it.id)}" type="button">−</button>
              <div class="qnum">${qty}</div>
              <button class="qbtn" data-oit-op="plus" data-oit-id="${escapeHtml(it.id)}" type="button">+</button>
            </div>

            <div class="badge" style="font-size:12px">${brl(Number(it.total || qty * unitPrice))}</div>
            <button class="btn btn--small" data-oit-op="del" data-oit-id="${escapeHtml(it.id)}" type="button">🗑️</button>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   ✅ REPORTS (RELATÓRIOS) — COMPLETO
========================================================= */

function renderReports(root) {
  state = getState();
  state.ui = state.ui || {};
  state.ui.reportsRange = state.ui.reportsRange || "month"; // today | month | year
  const range = state.ui.reportsRange;

  const { salesInRange, label } = getSalesByRange(range);

  const faturamento = salesInRange.reduce((a, x) => a + Number(x.totalVenda || 0), 0);
  const custos = salesInRange.reduce((a, x) => a + Number(x.totalCusto || 0), 0);
  const taxas = salesInRange.reduce((a, x) => a + Number(x.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);

  const margem = calcMargin(lucro, faturamento);
  const roi = calcROI(lucro, custos);

  const top = getTopProductsFromSales(salesInRange).slice(0, 10);

  const html = `
    <div class="h1">📈 Relatórios</div>

    <section class="card section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">Resumo financeiro</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(label)}</div>
        </div>
      </div>

      <div style="height:12px"></div>

      <div class="pillrow">
        <button class="pill ${range === "today" ? "is-active" : ""}" data-repr="today" type="button">Hoje</button>
        <button class="pill ${range === "month" ? "is-active" : ""}" data-repr="month" type="button">Mês</button>
        <button class="pill ${range === "year" ? "is-active" : ""}" data-repr="year" type="button">Ano</button>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="stats">
      <div class="card stat">
        <div style="font-size:24px;margin-bottom:8px">💰</div>
        <div class="stat__label">Faturamento</div>
        <div class="stat__value">${brl(faturamento)}</div>
      </div>

      <div class="card stat">
        <div style="font-size:24px;margin-bottom:8px">📉</div>
        <div class="stat__label">Custos</div>
        <div class="stat__value">${brl(custos)}</div>
      </div>

      <div class="card stat">
        <div style="font-size:24px;margin-bottom:8px">💳</div>
        <div class="stat__label">Taxas</div>
        <div class="stat__value">${brl(taxas)}</div>
      </div>

      <div class="card stat">
        <div style="font-size:24px;margin-bottom:8px">✨</div>
        <div class="stat__label">Lucro</div>
        <div class="stat__value">${brl(lucro)}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card">
      <div class="row">
        <div class="kpi"><b>Margem</b><span>Lucro / Faturamento</span></div>
        <div class="badge badge--info">${Number.isFinite(margem) ? (margem * 100).toFixed(1) + "%" : "—"}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>ROI</b><span>Lucro / Custos</span></div>
        <div class="badge badge--good">${Number.isFinite(roi) ? (roi * 100).toFixed(1) + "%" : "—"}</div>
      </div>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">🏆 Produtos mais vendidos</div>
      ${
        top.length === 0
          ? `<div class="muted" style="font-size:12px">Nenhuma venda encontrada nesse período.</div>`
          : `
            <table class="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th style="text-align:right">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                ${top
                  .map(
                    (t) => `
                    <tr>
                      <td>${escapeHtml(t.nome)}</td>
                      <td>${t.qtd}</td>
                      <td style="text-align:right">${brl(t.total)}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          `
      }
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">🧾 Vendas no período</div>
      ${renderSalesTable(salesInRange)}
    </section>
  `;

  root.innerHTML = html;

  if (!reportsBound) {
    reportsBound = true;

    root.addEventListener("click", (e) => {
      if (getState().route !== "reports") return;
      const t = e.target;
      const btn = t.closest?.("[data-repr]");
      if (!btn) return;

      const v = btn.dataset.repr || "month";
      commit((s) => {
        s.ui = s.ui || {};
        s.ui.reportsRange = v;
      });
      renderReports(root);
    });
  }
}

function getSalesByRange(range) {
  const s = getState();
  const sales = Array.isArray(s.sales) ? s.sales : [];
  const tk = todayKey();
  const mk = monthKey();
  const yk = yearKey();

  if (range === "today") {
    return {
      label: `Período: hoje (${fmtDateBR(tk)})`,
      salesInRange: sales.filter((x) => x.date === tk),
    };
  }
  if (range === "year") {
    return {
      label: `Período: ano (${yk})`,
      salesInRange: sales.filter((x) => String(x.date || "").startsWith(yk)),
    };
  }

  return {
    label: `Período: mês (${mk})`,
    salesInRange: sales.filter((x) => String(x.date || "").startsWith(mk)),
  };
}

function getTopProductsFromSales(sales) {
  const map = new Map();
  (sales || []).forEach((sale) => {
    (sale.items || []).forEach((it) => {
      const key = it.id || it.prodId || it.nome;
      const prev = map.get(key) || { nome: it.nome || "Produto", qtd: 0, total: 0 };
      prev.qtd += Number(it.qty || 0);
      prev.total += Number(it.qty || 0) * Number(it.unitPrice || 0);
      map.set(key, prev);
    });
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function renderSalesTable(sales) {
  const list = Array.isArray(sales) ? sales : [];
  if (list.length === 0) {
    return `<div class="muted" style="font-size:12px">Nenhuma venda nesse período.</div>`;
  }

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Pagamento</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .slice()
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
          .map(
            (x) => `
          <tr>
            <td>${escapeHtml(fmtDateBR(x.date))}</td>
            <td>${escapeHtml(x.metodo || "-")}</td>
            <td style="text-align:right">${brl(Number(x.totalVenda || 0))}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   ✅ MORE (AJUSTES) — útil de verdade
========================================================= */

function renderMore(root) {
  state = getState();
  state.auth = state.auth || {};
  state.ui = state.ui || {};

  const mode = state.auth?.mode || "supabase";

  const html = `
    <div class="h1">⚙️ Mais</div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Configurações</div>
      <div class="muted" style="font-size:12px;margin-bottom:14px">Ajustes do app e segurança.</div>

      <div class="row" style="border-top:0">
        <div class="kpi"><b>👤 Sincronização</b><span>${mode === "supabase" ? "Supabase" : mode === "pin" ? "PIN" : "Local"}</span></div>
        <div class="badge badge--info">${getUserId() ? "Conectado" : "Offline"}</div>
      </div>

      <div style="height:10px"></div>

      <button class="btn" id="btnLogout" style="width:100%" type="button">Sair</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnResetLocal" style="width:100%" type="button">Resetar dados locais</button>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">🔐 PIN (opcional)</div>
      <div class="muted" style="font-size:12px;margin-bottom:12px">Se quiser travar o app com um PIN.</div>

      <div class="field">
        <label class="label">Ativar PIN</label>
        <select class="select" id="pinEnabled">
          <option value="nao" ${state.auth?.enabled ? "" : "selected"}>Não</option>
          <option value="sim" ${state.auth?.enabled ? "selected" : ""}>Sim</option>
        </select>
      </div>

      <div class="field mt-12">
        <label class="label">PIN</label>
        <input class="input" id="pinValue" type="password" inputmode="numeric" placeholder="••••" value="${escapeHtml(
          state.auth?.pin || ""
        )}" />
      </div>

      <div style="height:12px"></div>
      <button class="btn btn--brand" id="btnSavePin" style="width:100%" type="button">Salvar PIN</button>
    </section>
  `;

  root.innerHTML = html;

  if (!moreBound) {
    moreBound = true;

    root.addEventListener("click", async (e) => {
      if (getState().route !== "more") return;
      const t = e.target;

      if (t.closest?.("#btnLogout")) {
        try {
          await supabase.auth.signOut();
          toast("Saiu ✅", "success");
        } catch (err) {
          toast("Erro ao sair", "error");
        }
        return;
      }

      if (t.closest?.("#btnResetLocal")) {
        if (!confirm("Isso vai apagar os dados locais deste navegador. Continuar?")) return;

        try {
          localStorage.clear();
        } catch {}

        toast("Dados locais resetados. Recarregando...", "info");
        setTimeout(() => window.location.reload(), 600);
        return;
      }

      if (t.closest?.("#btnSavePin")) {
        const enabled = String(qs("#pinEnabled")?.value || "nao") === "sim";
        const pin = String(qs("#pinValue")?.value || "").trim();

        if (enabled && (!pin || pin.length < 4)) return toast("Defina um PIN de pelo menos 4 dígitos.", "error");

        commit((s) => {
          s.auth = s.auth || {};
          s.auth.mode = "pin";
          s.auth.enabled = enabled;
          s.auth.pin = pin;
          s.auth.unlocked = !enabled; // se desativou, destrava
        });

        toast("PIN atualizado ✅", "success");
        renderMore(root);
        return;
      }
    });
  }
}

/* =========================================================
   MONEY UX
========================================================= */
function bindMoneyInputClearOnFocus(root, ids = []) {
  ids.forEach((id) => {
    const el = root.querySelector(`#${id}`);
    if (!el || !(el instanceof HTMLInputElement)) return;

    el.addEventListener("focus", () => {
      const raw = String(el.value || "").trim();
      const v = parseMoneyInput(raw);

      if (!raw || raw === "0" || raw === "0,0" || raw === "0,00" || v === 0) {
        el.value = "";
        return;
      }
      try {
        el.select();
      } catch {}
    });

    el.addEventListener("blur", () => {
      const raw = String(el.value || "").trim();
      if (!raw) el.value = "0,00";
    });
  });
}

function bindGlobalMoneyUX() {
  const isMoneyInput = (el) => {
    if (!(el instanceof HTMLInputElement)) return false;
    const inputmode = (el.getAttribute("inputmode") || "").toLowerCase();
    const placeholder = String(el.getAttribute("placeholder") || "").trim();
    const type = (el.getAttribute("type") || "").toLowerCase();
    return inputmode === "decimal" || placeholder === "0,00" || type === "number";
  };

  if (window.__dlMoneyUXBound) return;
  window.__dlMoneyUXBound = true;

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!isMoneyInput(el)) return;

    const raw = String(el.value || "").trim();
    const v = parseMoneyInput(raw);

    if (!raw || raw === "0" || raw === "0,0" || raw === "0,00" || v === 0) {
      el.value = "";
      return;
    }

    try {
      el.select();
    } catch {}
  });

  document.addEventListener("focusout", (e) => {
    const el = e.target;
    if (!isMoneyInput(el)) return;

    const raw = String(el.value || "").trim();
    if (!raw) el.value = "0,00";
  });
}

/* =========================================================
   HELPERS (cálculo)
========================================================= */

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

      return {
        ...prod,
        qty: Number(qty || 0),
        unitPrice: Number(prod.preco || 0),
        unitCost: Number(prod.custo || 0),
      };
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

/* =========================================================
   Resumos (home)
========================================================= */

function getTodaySummary() {
  const key = todayKey();
  const s = getState();
  const sales = (s.sales || []).filter((x) => x.date === key);
  const faturamento = sales.reduce((a, x) => a + Number(x.totalVenda || 0), 0);
  const custos = sales.reduce((a, x) => a + Number(x.totalCusto || 0), 0);
  const taxas = sales.reduce((a, x) => a + Number(x.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);
  return { faturamento, custos, taxas, lucro };
}

function getMonthSummary() {
  const key = monthKey();
  const s = getState();
  const sales = (s.sales || []).filter((x) => String(x.date || "").startsWith(key));
  const faturamento = sales.reduce((a, x) => a + Number(x.totalVenda || 0), 0);
  const custos = sales.reduce((a, x) => a + Number(x.totalCusto || 0), 0);
  const taxas = sales.reduce((a, x) => a + Number(x.taxaCartao || 0), 0);
  const lucro = calcProfit(faturamento, custos, taxas);
  return { faturamento, custos, taxas, lucro };
}

function getLast7DaysSummary() {
  const s = getState();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);

    const sales = (s.sales || []).filter((x) => x.date === key);
    const faturamento = sales.reduce((a, x) => a + Number(x.totalVenda || 0), 0);
    const custos = sales.reduce((a, x) => a + Number(x.totalCusto || 0), 0);
    const taxas = sales.reduce((a, x) => a + Number(x.taxaCartao || 0), 0);
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
  const s = getState();
  const orders = (s.orders || []).filter((o) => (o.status || "aberta") === "aberta");
  return orders.reduce((a, o) => a + Math.max(0, getOrderTotals(o).aReceber), 0);
}

function getRemainingDaysInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, lastDay.getDate() - now.getDate());
}

function getCashSummaryForDate(date) {
  const s = getState();
  const moves = (s.cashMoves || []).filter((m) => m.date === date);

  const dinheiro = moves.filter((m) => m.tipo === "dinheiro").reduce((a, m) => a + Number(m.valor || 0), 0);
  const pix = moves.filter((m) => m.tipo === "pix").reduce((a, m) => a + Number(m.valor || 0), 0);
  const cartao = moves.filter((m) => m.tipo === "cartao").reduce((a, m) => a + Number(m.valor || 0), 0);

  const entradasTotal = dinheiro + pix + cartao;
  const saidas = moves.filter((m) => m.tipo === "saida").reduce((a, m) => a + Number(m.valor || 0), 0);
  const saldo = entradasTotal - saidas;

  return { dinheiro, pix, cartao, entradasTotal, saidas, saldo };
}

/* =========================================================
   START
========================================================= */
mount();

/* =========================================================
   PWA / SERVICE WORKER (mantém o seu)
========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const base = new URL("./", window.location.href);
      const swUrl = new URL("sw.js", base).toString();

      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(async (r) => {
            const activeUrl =
              r?.active?.scriptURL || r?.installing?.scriptURL || r?.waiting?.scriptURL || "";
            if (activeUrl && activeUrl !== swUrl) {
              await r.unregister();
            }
          })
        );
      } catch {}

      const reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: "none" });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      try {
        await reg.update();
      } catch {}

      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          }
        });
      });

      setTimeout(() => {
        try {
          reg.update();
        } catch {}
      }, 4000);

      console.log("✅ SW registrado:", swUrl);
    } catch (err) {
      console.warn("⚠️ SW não registrado:", err);
    }
  });
}