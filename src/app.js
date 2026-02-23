import { loadState, saveState, getDefaultState, newId } from "./state.js";
import { brl, qs, qsa, setTheme } from "./ui.js";
import { calcCardFee, calcProfit, calcMargin, calcROI } from "./db.js";

let state = normalizeState(loadState());

/* =========================================================
   CORE
========================================================= */
function mount() {
  setTheme(state.theme || "dark");

  const btnTheme = qs("#btnTheme");
  syncThemeIcon(btnTheme);

  btnTheme?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    persist();
    setTheme(state.theme);
    syncThemeIcon(btnTheme);
  });

  const btnExport = qs("#btnExport");
  btnExport?.addEventListener("click", () => showExportModal());

  window.addEventListener("hashchange", () => {
    const r = (location.hash || "").replace("#", "").trim();
    if (r) navigate(r, true);
  });

  qsa(".nav__item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });

  const hashRoute = (location.hash || "").replace("#", "").trim();
  navigate(hashRoute || state.route || "home", true);

  registerSW();
}

function normalizeState(s) {
  const base = getDefaultState();
  const merged = {
    ...base,
    ...(s || {}),
    ui: { ...base.ui, ...((s && s.ui) || {}) },
  };

  merged.products = Array.isArray(merged.products) ? merged.products : [];
  merged.sales = Array.isArray(merged.sales) ? merged.sales : [];
  merged.orders = Array.isArray(merged.orders) ? merged.orders : [];
  merged.cashMoves = Array.isArray(merged.cashMoves) ? merged.cashMoves : [];

  merged.ui.saleCart = merged.ui.saleCart && typeof merged.ui.saleCart === "object" ? merged.ui.saleCart : {};
  merged.ui.orderDraftItems =
    merged.ui.orderDraftItems && typeof merged.ui.orderDraftItems === "object" ? merged.ui.orderDraftItems : {};

  merged.theme = merged.theme === "light" ? "light" : "dark";
  merged.route = merged.route || "home";
  merged.metaMensal = Number.isFinite(Number(merged.metaMensal)) ? Number(merged.metaMensal) : 3000;
  merged.mesRef = merged.mesRef || monthKey();

  merged.ui.salePay = merged.ui.salePay || "pix";
  merged.ui.saleDiscount = Number(merged.ui.saleDiscount || 0);
  merged.ui.saleExtra = Number(merged.ui.saleExtra || 0);
  merged.ui.saleReceived = Number(merged.ui.saleReceived || 0);

  return merged;
}

function persist() {
  state = normalizeState(state);
  saveState(state);
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
    <div style="height:8px"></div>
    <button class="btn" id="btnSeedDemo" type="button">📊 Inserir dados de teste (demo)</button>
  `;

  root.innerHTML = html;

  qs("#btnQuickSale")?.addEventListener("click", () => navigate("sale"));

  qs("#btnSeedDemo")?.addEventListener("click", () => {
    seedDemo();
    toast("Dados demo inseridos ✅", "success");
    renderHome(root);
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
   SALE (Balcão)  ✅ Sem re-render no input + sem type=number
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

  // captura foco/cursor antes de re-render
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

  // bind único (event delegation) — só uma vez
  if (!saleBound) {
    saleBound = true;

    root.addEventListener("click", (e) => {
      if (state.route !== "sale") return;

      const t = e.target;

      // pagamento
      const payBtn = t.closest?.("[data-pay]");
      if (payBtn) {
        state.ui.salePay = payBtn.dataset.pay || "pix";
        state.ui.saleReceived = 0;
        persist();
        renderSale(root);
        return;
      }

      // +/- carrinho
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

      // finalizar
      if (t.closest?.("#btnFinalizeSale")) {
        finalizeSale(root);
        return;
      }

      // limpar
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

    // inputs (delegation)
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

    // ao sair do campo: re-render (pra aplicar máscara/mostrar falta/troco certinho)
    root.addEventListener("blur", (e) => {
      if (state.route !== "sale") return;
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.id === "inpDiscount" || el.id === "inpExtra" || el.id === "inpRecebido") {
        renderSale(root);
      }
    }, true);

    root.addEventListener("change", (e) => {
      if (state.route !== "sale") return;
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.id === "inpDiscount" || el.id === "inpExtra" || el.id === "inpRecebido") {
        renderSale(root);
      }
    });
  }

  // restaura foco/cursor depois do re-render
  restoreFocusState(focusSnap);
}

function debounceSaleRecalc(root) {
  clearTimeout(saleInputDebounce);
  saleInputDebounce = setTimeout(() => {
    // atualiza SOMENTE os números na tela (sem re-render)
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

  // reconstruir só o bloco de falta/troco (pequeno, não atrapalha digitação)
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
  const troco = metodo === "dinheiro" ? Math.max(0, recebido - totals.totalFinal) : 0;

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
    troco,
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
    });
  });
}

function renderOrderRow(order) {
  const status = order.status || "aberta";
  const statusIcon = status === "entregue" ? "✅" : status === "cancelada" ? "❌" : "⏳";

  return `
    <div class="row">
      <div class="kpi">
        <b>${escapeHtml(order.cliente || "Sem nome")}</b>
        <span>${statusIcon} ${escapeHtml(status)} | Total: ${brl(order.total || 0)} | Lucro: ${brl(order.lucroEstimado || 0)}</span>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn--small" data-order-id="${order.id}" data-action="edit" type="button">Editar</button>
        <button class="btn btn--small btn--danger" data-order-id="${order.id}" data-action="delete" type="button">Deletar</button>
      </div>
    </div>
  `;
}

function showOrderModal(orderId, root) {
  const products = state.products || [];
  const order = orderId ? state.orders.find((o) => o.id === orderId) : null;
  const isEdit = !!order;

  const itemsById = isEdit ? order.itemsById || {} : state.ui.orderDraftItems || {};

  const items = cartToItems(itemsById, products);
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);

  const taxaEntregaBase = Number(order?.taxaEntrega || 0);
  const sinalBase = Number(order?.sinal || 0);
  const total = subtotal + taxaEntregaBase;

  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${isEdit ? "Editar encomenda" : "Nova encomenda"}</div>
          <button class="modal__close" id="closeModal" type="button">X</button>
        </div>

        <div class="field">
          <label class="label">Nome do cliente</label>
          <input type="text" class="input" id="inpCliente" placeholder="Ex: Maria Silva" value="${escapeHtml(order?.cliente || "")}" />
        </div>

        <div class="field mt-12">
          <label class="label">WhatsApp (opcional)</label>
          <input type="text" class="input" id="inpWhats" placeholder="Ex: 11999999999" value="${escapeHtml(order?.whats || "")}" />
        </div>

        <div class="field mt-12">
          <label class="label">Data de retirada</label>
          <input type="date" class="input" id="inpData" value="${escapeHtml(order?.dataRetirada || "")}" />
        </div>

        <div class="field mt-12">
          <label class="label">Taxa de entrega</label>
          <input type="text" inputmode="decimal" class="input" id="inpTaxa" placeholder="0,00" value="${formatMoneyInput(taxaEntregaBase)}" />
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
          <input type="text" inputmode="decimal" class="input" id="inpSinal" placeholder="0,00" value="${formatMoneyInput(sinalBase)}" />
        </div>

        <div class="carttotal">
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
            <option value="aberta" ${(order?.status || "aberta") === "aberta" ? "selected" : ""}>Aberta</option>
            <option value="entregue" ${order?.status === "entregue" ? "selected" : ""}>Entregue</option>
            <option value="cancelada" ${order?.status === "cancelada" ? "selected" : ""}>Cancelada</option>
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

  const modal = qs(".modal");
  qs("#closeModal")?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  qsa("[data-op]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prodId = btn.dataset.prod;
      const op = btn.dataset.op;
      const q = itemsById[prodId] || 0;

      itemsById[prodId] = op === "plus" ? q + 1 : Math.max(0, q - 1);
      if (itemsById[prodId] === 0) delete itemsById[prodId];

      state.ui.orderDraftItems = itemsById;
      persist();
      showOrderModal(orderId, root);
    });
  });

  qs("#btnSaveOrder")?.addEventListener("click", () => {
    const cliente = (qs("#inpCliente")?.value || "").trim();
    const whats = (qs("#inpWhats")?.value || "").trim();
    const dataRetirada = qs("#inpData")?.value || "";
    const taxaEntrega = parseMoneyInput(qs("#inpTaxa")?.value || "0");
    const sinal = parseMoneyInput(qs("#inpSinal")?.value || "0");
    const status = qs("#selStatus")?.value || "aberta";

    if (!cliente) return toast("Preencha o nome do cliente", "error");
    if (Object.keys(itemsById).length === 0) return toast("Adicione pelo menos um produto", "error");

    const items = cartToItems(itemsById, products);
    const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
    const total = subtotal + taxaEntrega;

    if (isEdit) {
      const idx = state.orders.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        state.orders[idx] = {
          ...order,
          cliente,
          whats,
          dataRetirada,
          taxaEntrega,
          sinal,
          status,
          itemsById,
          items,
          total,
          totalCusto,
          lucroEstimado: calcProfit(total, totalCusto, 0),
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
        items,
        total,
        totalCusto,
        lucroEstimado: calcProfit(total, totalCusto, 0),
      });
    }

    state.ui.orderDraftItems = {};
    persist();
    modal.remove();
    toast(`Encomenda ${isEdit ? "atualizada" : "criada"} ✅`, "success");
    renderOrders(root);
  });

  qs("#btnDeleteOrder")?.addEventListener("click", () => {
    if (confirm("Tem certeza que quer deletar esta encomenda?")) {
      state.orders = state.orders.filter((o) => o.id !== orderId);
      persist();
      modal.remove();
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
   PRODUCTS
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
          <input type="text" class="input" id="inpNome" placeholder="Ex: Bolo no pote" value="${escapeHtml(product?.nome || "")}" />
        </div>

        <div class="fieldgrid mt-12">
          <div class="field">
            <label class="label">Preço de venda</label>
            <input type="text" inputmode="decimal" class="input" id="inpPreco" placeholder="0,00" value="${formatMoneyInput(product?.preco || 0)}" />
          </div>

          <div class="field">
            <label class="label">Custo unitário</label>
            <input type="text" inputmode="decimal" class="input" id="inpCusto" placeholder="0,00" value="${formatMoneyInput(product?.custo || 0)}" />
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

  const modal = qs(".modal");
  qs("#closeModal")?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  const inpPreco = qs("#inpPreco");
  const inpCusto = qs("#inpCusto");
  const marginDisplay = qs("#marginDisplay");

  const updateMargin = () => {
    const preco = parseMoneyInput(inpPreco?.value || "0");
    const custo = parseMoneyInput(inpCusto?.value || "0");
    const margin = Math.round(calcMargin(preco, custo));
    marginDisplay.textContent = `${margin}%`;
  };

  inpPreco?.addEventListener("input", updateMargin);
  inpCusto?.addEventListener("input", updateMargin);
  updateMargin();

  qs("#btnSaveProduct")?.addEventListener("click", () => {
    const nome = (qs("#inpNome")?.value || "").trim();
    const preco = parseMoneyInput(qs("#inpPreco")?.value || "0");
    const custo = parseMoneyInput(qs("#inpCusto")?.value || "0");

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
    modal.remove();
    toast(`Produto ${isEdit ? "atualizado" : "criado"} ✅`, "success");
    renderProducts(root);
  });

  qs("#btnDeleteProduct")?.addEventListener("click", () => {
    if (confirm("Deletar produto?")) {
      state.products = state.products.filter((p) => p.id !== productId);
      persist();
      modal.remove();
      toast("Produto deletado ✅", "success");
      renderProducts(root);
    }
  });
}

/* =========================================================
   REPORTS
========================================================= */
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

/* =========================================================
   MORE
========================================================= */
function renderMore(root) {
  const html = `
    <div class="h1">⚙️ Mais</div>

    <section class="card section">
      <button class="btn btn--brand" id="btnExportData" style="width:100%" type="button">📥 Exportar dados (JSON)</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnImportData" style="width:100%" type="button">📤 Importar dados (JSON)</button>
      <div style="height:8px"></div>
      <button class="btn btn--danger" id="btnClearData" style="width:100%" type="button">🗑️ Limpar todos os dados</button>
    </section>

    <div style="height:12px"></div>

    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">ℹ️ Sobre</div>
      <div class="row">
        <div class="kpi"><b>Doce Lucro</b><span>v1.0.1</span></div>
      </div>
      <div class="row">
        <div class="kpi"><b>Armazenamento</b><span>Local (offline)</span></div>
      </div>
    </section>
  `;

  root.innerHTML = html;

  qs("#btnExportData")?.addEventListener("click", () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `doce-lucro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    toast("Dados exportados ✅", "success");
  });

  qs("#btnImportData")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(String(event.target.result || "{}"));
          state = normalizeState({ ...state, ...imported });
          persist();
          toast("Dados importados ✅", "success");
          renderMore(root);
        } catch (err) {
          toast("Erro ao importar arquivo", "error");
        }
      };

      reader.readAsText(file);
    };

    input.click();
  });

  qs("#btnClearData")?.addEventListener("click", () => {
    if (confirm("⚠️ Tem certeza? Isso vai DELETAR TODOS os dados!")) {
      state = normalizeState(getDefaultState());
      persist();
      toast("Dados limpos ✅", "success");
      renderMore(root);
    }
  });
}

/* =========================================================
   EXPORT MODAL
========================================================= */
function showExportModal() {
  const html = `
    <div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">📊 Exportar relatório</div>
          <button class="modal__close" id="closeModal" type="button">X</button>
        </div>

        <div class="field">
          <label class="label">Escolha o formato</label>
          <button class="btn btn--brand" id="btnExportJSON" style="width:100%;margin-bottom:8px" type="button">📥 JSON (Backup)</button>
          <button class="btn" id="btnExportCSV" style="width:100%" type="button">📊 CSV (Excel)</button>
        </div>
      </div>
    </div>
  `;

  const container = qs("#modalContainer");
  container.innerHTML = html;

  const modal = qs(".modal");
  qs("#closeModal")?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  qs("#btnExportJSON")?.addEventListener("click", () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `doce-lucro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    toast("Dados exportados ✅", "success");
    modal.remove();
  });

  qs("#btnExportCSV")?.addEventListener("click", () => {
    const sales = state.sales || [];
    const rows = [
      ["Data", "Método", "Faturamento", "Custo", "Taxa", "Lucro"].join(","),
      ...sales.map((s) =>
        [
          String(s.date || ""),
          String(s.metodo || ""),
          Number(s.totalVenda || 0),
          Number(s.totalCusto || 0),
          Number(s.taxaCartao || 0),
          Number(s.lucro || 0),
        ].join(",")
      ),
    ];

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `doce-lucro-vendas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    toast("Relatório exportado ✅", "success");
    modal.remove();
  });
}

/* =========================================================
   HELPERS
========================================================= */
function radioPill(_name, value, label, checked) {
  return `
    <button
      class="pill"
      data-pay="${escapeHtml(value)}"
      type="button"
      style="${checked ? "background:rgba(255,79,163,0.2);border-color:rgba(255,79,163,0.5)" : ""}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text ?? "").replace(/[&<>"']/g, (m) => map[m]);
}

// ✅ robusto: "12,50", "12.50", "1.234,56", "1,234.56"
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
    if (lastComma > lastDot) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
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
  return {
    id: el.id || null,
    start: el.selectionStart,
    end: el.selectionEnd,
  };
}

function restoreFocusState(snap) {
  if (!snap || !snap.id) return;
  const el = document.getElementById(snap.id);
  if (!el || !(el instanceof HTMLInputElement)) return;
  try {
    el.focus();
    if (typeof snap.start === "number" && typeof snap.end === "number") {
      el.setSelectionRange(snap.start, snap.end);
    }
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
    {
      id: newId(),
      date: today,
      createdAt: new Date().toISOString(),
      metodo: "dinheiro",
      items: [
        { nome: "Brigadeiro (pote)", preco: 15, custo: 4, qty: 3, unitPrice: 15, unitCost: 4 },
        { nome: "Cupcake", preco: 8, custo: 2.5, qty: 5, unitPrice: 8, unitCost: 2.5 },
      ],
      desconto: 5,
      acrescimo: 0,
      recebido: 75,
      troco: 5,
      totalVenda: 70,
      totalCusto: 24.5,
      taxaCartao: 0,
      lucro: 45.5,
    },
  ];

  persist();
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// start
mount();