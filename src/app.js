import { loadState, saveState, getDefaultState, newId } from "./state.js";
import { brl, qs, qsa, setTheme } from "./ui.js";
import { calcCardFee, calcProfit } from "./db.js";

let state = loadState();
let chartInstances = {};

function mount() {
  setTheme(state.theme);
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
  qsa(".nav__item").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });
  const hashRoute = (location.hash || "").replace("#", "").trim();
  navigate(hashRoute || state.route || "home", true);
  registerSW();
}

function syncThemeIcon(btnTheme) {
  const icon = btnTheme?.querySelector(".icon");
  if (icon) icon.textContent = state.theme === "light" ? "☀️" : "🌙";
}

function persist() {
  saveState(state);
}

function navigate(route, silent = false) {
  state.route = route;
  persist();
  qsa(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.route === route));
  render(route);
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
  (routes[route] || routes.more)();
}

function renderHome(root) {
  const today = getTodaySummary();
  const openToReceive = getOpenOrdersToReceive();
  const month = getMonthSummary();
  const week = getLast7DaysSummary();
  const meta = Number(state.metaMensal || 0);
  const progresso = meta > 0 ? Math.min(100, (month.lucro / meta) * 100) : 0;
  const faltam = Math.max(0, meta - month.lucro);
  const daysLeft = getRemainingDaysInMonth();
  const mediaNecessaria = daysLeft > 0 ? (faltam / daysLeft) : faltam;
  const cash = getCashSummaryForDate(todayKey());

  const html = `<div class="h1">📊 Painel Inteligente</div>
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
          <div class="muted" style="font-size:12px;margin-top:4px">${state.mesRef || monthKey()}</div>
        </div>
        <button class="btn btn--small" id="btnEditMeta">Editar</button>
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
    <button class="btn btn--brand" id="btnQuickSale">⚡ Fazer venda (balcão)</button>
    <div style="height:8px"></div>
    <button class="btn" id="btnSeedDemo">📊 Inserir dados de teste (demo)</button>`;

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
  return `<div class="card stat">
      <div style="font-size:24px;margin-bottom:8px">${icon}</div>
      <div class="stat__label">${label}</div>
      <div class="stat__value">${value}</div>
    </div>`;
}

function renderSale(root) {
  const products = state.products || [];
  if (products.length === 0) {
    root.innerHTML = `<div class="h1">💳 Venda (Balcão)</div>
      <section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">📦</div>
          <div class="empty-state__title">Nenhum produto cadastrado</div>
          <div class="empty-state__description">Cadastre seus produtos primeiro para começar a vender.</div>
          <button class="btn btn--brand" id="goProducts">Cadastrar produtos</button>
        </div>
      </section>`;
    qs("#goProducts")?.addEventListener("click", () => navigate("products"));
    return;
  }

  const cart = state.ui.saleCart || {};
  const metodo = state.ui.salePay || "pix";
  const desconto = Number(state.ui.saleDiscount || 0);
  const acrescimo = Number(state.ui.saleExtra || 0);
  const recebido = Number(state.ui.saleReceived || 0);
  const totals = computeCartTotals(cart, products, metodo, desconto, acrescimo);
  const falta = metodo === "dinheiro" ? Math.max(0, totals.totalFinal - recebido) : 0;
  const troco = metodo === "dinheiro" ? Math.max(0, recebido - totals.totalFinal) : 0;

  const html = `<div class="h1">💳 Venda (Balcão)</div>
    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">➕ Adicionar produtos</div>
      <div class="productlist">
        ${products.map(p => renderProductAddRow(p, cart)).join("")}
      </div>
    </section>
    <div style="height:12px"></div>
    <section class="card section">
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
        <input type="number" class="input" id="inpDiscount" placeholder="0,00" value="${formatMoneyInput(desconto)}" />
      </div>
      <div class="field mt-12">
        <div class="label">Acréscimo (entrega, etc)</div>
        <input type="number" class="input" id="inpExtra" placeholder="0,00" value="${formatMoneyInput(acrescimo)}" />
      </div>
      ${metodo === "dinheiro" ? `<div class="field mt-12">
          <div class="label">Recebido em dinheiro</div>
          <input type="number" class="input" id="inpRecebido" placeholder="0,00" value="${formatMoneyInput(recebido)}" />
        </div>` : ""}
      <div style="height:12px"></div>
      <div class="card section" style="background:rgba(255,79,163,0.08);border-color:rgba(255,79,163,0.25)">
        <div class="row">
          <div class="kpi"><b>Subtotal</b><span>Produtos</span></div>
          <div class="value">${brl(totals.subtotal)}</div>
        </div>
        <div class="row">
          <div class="kpi"><b>Custo</b><span>Total de custo</span></div>
          <div class="value">${brl(totals.totalCusto)}</div>
        </div>
        <div class="row">
          <div class="kpi"><b>Taxa</b><span>${metodo === "cartao" ? "2.99%" : "Sem taxa"}</span></div>
          <div class="value">${brl(totals.taxa)}</div>
        </div>
        <div class="row">
          <div class="kpi"><b>Desconto</b><span>Aplicado</span></div>
          <div class="value">-${brl(desconto)}</div>
        </div>
        <div class="row">
          <div class="kpi"><b>Acréscimo</b><span>Adicionado</span></div>
          <div class="value">+${brl(acrescimo)}</div>
        </div>
        <div class="carttotal">
          <div class="kpi"><b>Total</b><span>A cobrar</span></div>
          <div class="big" style="color:var(--brand)">${brl(totals.totalFinal)}</div>
        </div>
        <div class="carttotal">
          <div class="kpi"><b>Lucro</b><span>Desta venda</span></div>
          <div class="big" style="color:var(--good)">${brl(totals.lucro)}</div>
        </div>
        ${metodo === "dinheiro" && falta > 0 ? `<div class="carttotal" style="color:var(--warn)">
          <div class="kpi"><b>Falta</b><span>Ainda a receber</span></div>
          <div class="big">${brl(falta)}</div>
        </div>` : ""}
        ${metodo === "dinheiro" && troco > 0 ? `<div class="carttotal" style="color:var(--good)">
          <div class="kpi"><b>Troco</b><span>A devolver</span></div>
          <div class="big">${brl(troco)}</div>
        </div>` : ""}
      </div>
      <div style="height:12px"></div>
      <button class="btn btn--brand" id="btnFinalizeSale" style="width:100%">✅ Finalizar venda</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnClearCart" style="width:100%">🗑️ Limpar carrinho</button>
    </section>`;

  root.innerHTML = html;
  const inpDiscount = qs("#inpDiscount");
  const inpExtra = qs("#inpExtra");
  const inpRecebido = qs("#inpRecebido");

  inpDiscount?.addEventListener("change", () => {
    state.ui.saleDiscount = parseMoneyInput(inpDiscount.value);
    persist();
    renderSale(root);
  });
  inpExtra?.addEventListener("change", () => {
    state.ui.saleExtra = parseMoneyInput(inpExtra.value);
    persist();
    renderSale(root);
  });
  inpRecebido?.addEventListener("change", () => {
    state.ui.saleReceived = parseMoneyInput(inpRecebido.value);
    persist();
    renderSale(root);
  });

  qsa("[data-pay]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.ui.salePay = btn.dataset.pay;
      state.ui.saleReceived = 0;
      persist();
      renderSale(root);
    });
  });

  qs("#btnFinalizeSale")?.addEventListener("click", () => {
    if (Object.keys(cart).length === 0) {
      toast("Carrinho vazio!", "error");
      return;
    }
    if (metodo === "dinheiro" && falta > 0) {
      toast("Falta receber R$ " + brl(falta), "error");
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
      lucro: totals.lucro
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
  });

  qs("#btnClearCart")?.addEventListener("click", () => {
    state.ui.saleCart = {};
    state.ui.saleDiscount = 0;
    state.ui.saleExtra = 0;
    state.ui.saleReceived = 0;
    persist();
    renderSale(root);
  });
}

function renderProductAddRow(product, cart) {
  const qty = cart[product.id] || 0;
  return `<div class="proditem">
      <div class="prodmeta">
        <b>${escapeHtml(product.nome)}</b>
        <span>Venda: ${brl(product.preco)} | Custo: ${brl(product.custo)}</span>
      </div>
      <div class="qty">
        <button class="qbtn" data-prod="${product.id}" data-op="minus">−</button>
        <div class="qnum">${qty}</div>
        <button class="qbtn" data-prod="${product.id}" data-op="plus">+</button>
      </div>
    </div>`;
}

function renderOrders(root) {
  const orders = state.orders || [];
  const html = `<div class="h1">📦 Encomendas</div>
    <section class="card section">
      <button class="btn btn--brand" id="btnNewOrder" style="width:100%">➕ Nova encomenda</button>
    </section>
    <div style="height:12px"></div>
    ${orders.length === 0 ? `<section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <div class="empty-state__title">Nenhuma encomenda</div>
          <div class="empty-state__description">Crie sua primeira encomenda para começar.</div>
        </div>
      </section>` : `<section class="card">
        ${orders.map(o => renderOrderRow(o)).join("")}
      </section>`}`;

  root.innerHTML = html;
  qs("#btnNewOrder")?.addEventListener("click", () => showOrderModal(null, root));
  qsa("[data-order-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const oid = btn.dataset.orderId;
      const action = btn.dataset.action;
      if (action === "edit") {
        showOrderModal(oid, root);
      } else if (action === "delete") {
        if (confirm("Deletar encomenda?")) {
          state.orders = state.orders.filter(o => o.id !== oid);
          persist();
          toast("Deletado ✅", "success");
          renderOrders(root);
        }
      }
    });
  });
}

function renderOrderRow(order) {
  const statusBadge = {
    aberta: "badge--warn",
    entregue: "badge--good",
    cancelada: "badge--bad"
  }[order.status || "aberta"] || "badge--info";
  const items = order.items || [];
  const itemsStr = items.map(i => `${i.qty}x ${i.name}`).join(", ");
  return `<div class="row">
      <div class="kpi">
        <b>${escapeHtml(order.cliente || "Sem nome")}</b>
        <span>${itemsStr || "Sem itens"}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="badge ${statusBadge}">${order.status || "aberta"}</div>
        <button class="btn btn--small" data-order-id="${order.id}" data-action="edit">✏️</button>
        <button class="btn btn--small btn--danger" data-order-id="${order.id}" data-action="delete">🗑️</button>
      </div>
    </div>`;
}

function showOrderModal(orderId, root) {
  const order = orderId ? (state.orders || []).find(o => o.id === orderId) : null;
  const isEdit = !!order;
  const products = state.products || [];
  const itemsById = order?.itemsById || state.ui.orderDraftItems || {};
  const items = cartToItems(itemsById, products);
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const taxa = Number(order?.taxaEntrega || 0);
  const sinal = Number(order?.sinal || 0);
  const total = subtotal + taxa;

  const html = `<div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${isEdit ? "Editar encomenda" : "Nova encomenda"}</div>
          <button class="modal__close" id="closeModal">X</button>
        </div>
        <div class="field">
          <label class="label">Nome do cliente</label>
          <input type="text" class="input" id="inpCliente" placeholder="Ex: Maria Silva" value="${escapeHtml(order?.cliente || "")}" />
        </div>
        <div class="field mt-12">
          <label class="label">WhatsApp (opcional)</label>
          <input type="text" class="input" id="inpWhats" placeholder="11 99999-9999" value="${escapeHtml(order?.whats || "")}" />
        </div>
        <div class="field mt-12">
          <label class="label">Data de retirada</label>
          <input type="date" class="input" id="inpData" value="${order?.dataRetirada || new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="field mt-12">
          <label class="label">Produtos</label>
          <div class="productlist">
            ${products.map(p => {
              const q = itemsById[p.id] || 0;
              return `<div class="proditem">
                  <div class="prodmeta">
                    <b>${escapeHtml(p.nome)}</b>
                    <span>${brl(p.preco)}</span>
                  </div>
                  <div class="qty">
                    <button class="qbtn" data-prod="${p.id}" data-op="minus">−</button>
                    <div class="qnum">${q}</div>
                    <button class="qbtn" data-prod="${p.id}" data-op="plus">+</button>
                  </div>
                </div>`;
            }).join("")}
          </div>
        </div>
        <div class="field mt-12">
          <label class="label">Taxa de entrega</label>
          <input type="number" class="input" id="inpTaxa" placeholder="0,00" value="${formatMoneyInput(taxa)}" />
        </div>
        <div class="field mt-12">
          <label class="label">Sinal</label>
          <input type="number" class="input" id="inpSinal" placeholder="0,00" value="${formatMoneyInput(sinal)}" />
        </div>
        <div class="card section" style="background:rgba(255,79,163,0.08);border-color:rgba(255,79,163,0.25);margin-top:12px">
          <div class="row">
            <div class="kpi"><b>Subtotal</b></div>
            <div class="value">${brl(subtotal)}</div>
          </div>
          <div class="row">
            <div class="kpi"><b>Taxa entrega</b></div>
            <div class="value">${brl(taxa)}</div>
          </div>
          <div class="carttotal">
            <div class="kpi"><b>Total</b></div>
            <div class="big" style="color:var(--brand)">${brl(total)}</div>
          </div>
          <div class="carttotal">
            <div class="kpi"><b>Sinal</b></div>
            <div class="value">${brl(sinal)}</div>
          </div>
          <div class="carttotal">
            <div class="kpi"><b>Restante</b></div>
            <div class="big" style="color:var(--warn)">${brl(total - sinal)}</div>
          </div>
          <div class="carttotal">
            <div class="kpi"><b>Lucro estimado</b></div>
            <div class="big" style="color:var(--good)">${brl(calcProfit(total, totalCusto, 0))}</div>
          </div>
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
        <button class="btn btn--brand" id="btnSaveOrder" style="width:100%">Salvar encomenda</button>
        ${isEdit ? `<div style="height:8px"></div><button class="btn btn--danger" id="btnDeleteOrder" style="width:100%">Deletar encomenda</button>` : ""}
      </div>
    </div>`;

  const container = qs("#modalContainer");
  container.innerHTML = html;
  const modal = qs(".modal");
  const closeBtn = qs("#closeModal");
  closeBtn?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  qsa("[data-op]").forEach(btn => {
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
    const cliente = qs("#inpCliente").value.trim();
    const whats = qs("#inpWhats").value.trim();
    const dataRetirada = qs("#inpData").value;
    const taxaEntrega = parseMoneyInput(qs("#inpTaxa").value);
    const sinal = parseMoneyInput(qs("#inpSinal").value);
    const status = qs("#selStatus").value;

    if (!cliente) {
      toast("Preencha o nome do cliente", "error");
      return;
    }
    if (Object.keys(itemsById).length === 0) {
      toast("Adicione pelo menos um produto", "error");
      return;
    }

    const items = cartToItems(itemsById, products);
    const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
    const total = subtotal + taxaEntrega;

    if (isEdit) {
      const idx = state.orders.findIndex(o => o.id === orderId);
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
          lucroEstimado: calcProfit(total, totalCusto, 0)
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
        lucroEstimado: calcProfit(total, totalCusto, 0)
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
      state.orders = state.orders.filter(o => o.id !== orderId);
      persist();
      modal.remove();
      toast("Encomenda deletada ✅", "success");
      renderOrders(root);
    }
  });
}

function renderProducts(root) {
  const products = state.products || [];
  const html = `<div class="h1">Produtos</div>
    <section class="card section">
      <button class="btn btn--brand" id="btnNewProduct" style="width:100%">Novo produto</button>
    </section>
    <div style="height:12px"></div>
    ${products.length === 0 ? `<section class="card section">
        <div class="empty-state">
          <div class="empty-state__icon">Sem produtos</div>
          <div class="empty-state__title">Nenhum produto</div>
          <div class="empty-state__description">Crie seu primeiro produto para começar a vender.</div>
        </div>
      </section>` : `<section class="card">
        ${products.map(p => renderProductRow(p)).join("")}
      </section>`}`;

  root.innerHTML = html;
  qs("#btnNewProduct")?.addEventListener("click", () => showProductModal(null, root));
  qsa("[data-prod-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pid = btn.dataset.prodId;
      const action = btn.dataset.action;
      if (action === "edit") {
        showProductModal(pid, root);
      } else if (action === "delete") {
        if (confirm("Deletar produto?")) {
          state.products = state.products.filter(p => p.id !== pid);
          persist();
          toast("Produto deletado ✅", "success");
          renderProducts(root);
        }
      }
    });
  });
}

function renderProductRow(product) {
  const margin = calcMarginPercentLocal(product.preco, product.custo);
  return `<div class="row">
      <div class="kpi">
        <b>${escapeHtml(product.nome)}</b>
        <span>Venda: ${brl(product.preco)} | Custo: ${brl(product.custo)} | Margem: ${margin}%</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn--small" data-prod-id="${product.id}" data-action="edit">Editar</button>
        <button class="btn btn--small btn--danger" data-prod-id="${product.id}" data-action="delete">Deletar</button>
      </div>
    </div>`;
}

function showProductModal(productId, root) {
  const product = productId ? state.products.find(p => p.id === productId) : null;
  const isEdit = !!product;

  const html = `<div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">${isEdit ? "Editar produto" : "Novo produto"}</div>
          <button class="modal__close" id="closeModal">X</button>
        </div>
        <div class="field">
          <label class="label">Nome do produto</label>
          <input type="text" class="input" id="inpNome" placeholder="Ex: Bolo no pote" value="${escapeHtml(product?.nome || "")}" />
        </div>
        <div class="fieldgrid mt-12">
          <div class="field">
            <label class="label">Preco de venda</label>
            <input type="number" class="input" id="inpPreco" placeholder="0,00" value="${formatMoneyInput(product?.preco || 0)}" />
          </div>
          <div class="field">
            <label class="label">Custo unitario</label>
            <input type="number" class="input" id="inpCusto" placeholder="0,00" value="${formatMoneyInput(product?.custo || 0)}" />
          </div>
        </div>
        <div class="card section" style="background:rgba(46,229,157,0.08);border-color:rgba(46,229,157,0.25);margin-top:12px">
          <div class="row">
            <div class="kpi"><b>Margem</b><span>Lucro por unidade</span></div>
            <div class="value" id="marginDisplay">0%</div>
          </div>
        </div>
        <div style="height:12px"></div>
        <button class="btn btn--brand" id="btnSaveProduct" style="width:100%">Salvar produto</button>
        ${isEdit ? `<div style="height:8px"></div><button class="btn btn--danger" id="btnDeleteProduct" style="width:100%">Deletar produto</button>` : ""}
      </div>
    </div>`;

  const container = qs("#modalContainer");
  container.innerHTML = html;
  const modal = qs(".modal");
  const closeBtn = qs("#closeModal");
  closeBtn?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  const inpPreco = qs("#inpPreco");
  const inpCusto = qs("#inpCusto");
  const marginDisplay = qs("#marginDisplay");

  function updateMargin() {
    const preco = parseMoneyInput(inpPreco.value);
    const custo = parseMoneyInput(inpCusto.value);
    const margin = calcMarginPercentLocal(preco, custo);
    marginDisplay.textContent = margin + "%";
  }

  inpPreco?.addEventListener("input", updateMargin);
  inpCusto?.addEventListener("input", updateMargin);
  updateMargin();

  qs("#btnSaveProduct")?.addEventListener("click", () => {
    const nome = qs("#inpNome").value.trim();
    const preco = parseMoneyInput(qs("#inpPreco").value);
    const custo = parseMoneyInput(qs("#inpCusto").value);

    if (!nome) {
      toast("Preencha o nome do produto", "error");
      return;
    }
    if (!Number.isFinite(preco) || preco <= 0) {
      toast("Preco invalido", "error");
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      toast("Custo invalido", "error");
      return;
    }

    if (isEdit) {
      const idx = state.products.findIndex(p => p.id === productId);
      if (idx >= 0) {
        state.products[idx] = { ...product, nome, preco, custo };
      }
    } else {
      state.products.push({
        id: newId(),
        nome,
        preco,
        custo,
        createdAt: new Date().toISOString()
      });
    }

    persist();
    modal.remove();
    toast(`Produto ${isEdit ? "atualizado" : "criado"} ✅`, "success");
    renderProducts(root);
  });

  qs("#btnDeleteProduct")?.addEventListener("click", () => {
    if (confirm("Deletar produto?")) {
      state.products = state.products.filter(p => p.id !== productId);
      persist();
      modal.remove();
      toast("Produto deletado ✅", "success");
      renderProducts(root);
    }
  });
}

function renderReports(root) {
  const month = getMonthSummary();
  const week = getLast7DaysSummary();
  const topProducts = getTopProducts(5);

  const html = `<div class="h1">Relatorios</div>
    <section class="card section">
      <div style="font-weight:900;margin-bottom:10px">Grafico: Faturamento vs Lucro (7 dias)</div>
      <div class="chart-container">
        <canvas id="chartWeek"></canvas>
      </div>
    </section>
    <div style="height:12px"></div>
    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Resumo do mes</div>
      <div class="row">
        <div class="kpi"><b>Faturamento</b></div>
        <div class="value">${brl(month.faturamento)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>Custo total</b></div>
        <div class="value">${brl(month.custos)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>Taxas</b></div>
        <div class="value">${brl(month.taxas)}</div>
      </div>
      <div class="row">
        <div class="kpi"><b>Lucro real</b></div>
        <div class="value" style="color:var(--good)">${brl(month.lucro)}</div>
      </div>
    </section>
    <div style="height:12px"></div>
    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Top 5 produtos</div>
      ${topProducts.length === 0 ? `<div class="muted">Sem vendas ainda</div>` : `
        ${topProducts.map((p, i) => `
          <div class="row">
            <div class="kpi">
              <b>${i + 1}. ${escapeHtml(p.nome)}</b>
              <span>${p.qty} vendidos | Lucro: ${brl(p.lucro)}</span>
            </div>
            <div class="value">${brl(p.revenue)}</div>
          </div>
        `).join("")}
      `}
    </section>
    <div style="height:12px"></div>
    <section class="card section">
      <div style="font-weight:900;margin-bottom:8px">Ultimas vendas</div>
      <table class="table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Metodo</th>
            <th>Venda</th>
            <th>Lucro</th>
          </tr>
        </thead>
        <tbody>
          ${(state.sales || []).slice(-10).reverse().map(s => `
            <tr>
              <td>${s.date}</td>
              <td>${s.metodo}</td>
              <td>${brl(s.totalVenda)}</td>
              <td style="color:var(--good)">${brl(s.lucro)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>`;

  root.innerHTML = html;

  setTimeout(() => {
    const ctx = qs("#chartWeek");
    if (ctx && window.Chart) {
      if (chartInstances.week) chartInstances.week.destroy();
      const labels = week.map(w => w.dia);
      const faturamento = week.map(w => w.faturamento);
      const lucro = week.map(w => w.lucro);

      chartInstances.week = new window.Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Faturamento",
              data: faturamento,
              borderColor: "rgba(255, 79, 163, 0.8)",
              backgroundColor: "rgba(255, 79, 163, 0.1)",
              tension: 0.4,
              fill: true,
              pointRadius: 5,
              pointBackgroundColor: "rgba(255, 79, 163, 1)"
            },
            {
              label: "Lucro",
              data: lucro,
              borderColor: "rgba(46, 229, 157, 0.8)",
              backgroundColor: "rgba(46, 229, 157, 0.1)",
              tension: 0.4,
              fill: true,
              pointRadius: 5,
              pointBackgroundColor: "rgba(46, 229, 157, 1)"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: state.theme === "light" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)",
                font: { weight: "bold" }
              }
            }
          },
          scales: {
            y: {
              ticks: {
                color: state.theme === "light" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)",
                callback: (v) => "R$ " + (v / 1000).toFixed(1) + "k"
              },
              grid: {
                color: state.theme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"
              }
            },
            x: {
              ticks: {
                color: state.theme === "light" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"
              },
              grid: {
                color: state.theme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"
              }
            }
          }
        }
      });
    }
  }, 100);
}

function renderMore(root) {
  root.innerHTML = `<div class="h1">Mais</div>
    <section class="card section">
      <button class="btn" id="btnClearAll" style="width:100%">Limpar todos os dados</button>
      <div style="height:8px"></div>
      <button class="btn" id="btnAbout" style="width:100%">Sobre o Doce Lucro</button>
    </section>`;

  qs("#btnClearAll")?.addEventListener("click", () => {
    if (confirm("Tem certeza? Isso vai deletar TODOS os dados!")) {
      if (confirm("Confirmacao final: deletar tudo mesmo?")) {
        state = getDefaultState();
        persist();
        toast("Dados apagados ✅", "success");
        renderMore(root);
      }
    }
  });

  qs("#btnAbout")?.addEventListener("click", () => {
    toast("Doce Lucro v1.0 - Lucro real em segundos", "info");
  });
}

function showExportModal() {
  const html = `<div class="modal">
      <div class="modal__content">
        <div class="modal__header">
          <div class="modal__title">Exportar dados</div>
          <button class="modal__close" id="closeModal">X</button>
        </div>
        <button class="btn btn--brand" id="btnExportCSV" style="width:100%;margin-bottom:8px">Exportar CSV</button>
        <button class="btn" id="btnExportJSON" style="width:100%;margin-bottom:8px">Exportar JSON</button>
        <button class="btn" id="btnExportPDF" style="width:100%">Exportar PDF</button>
      </div>
    </div>`;

  const container = qs("#modalContainer");
  container.innerHTML = html;
  const modal = qs(".modal");
  const closeBtn = qs("#closeModal");
  closeBtn?.addEventListener("click", () => modal.remove());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  qs("#btnExportCSV")?.addEventListener("click", () => {
    const csv = generateCSV();
    downloadFile(csv, "doce-lucro-vendas.csv", "text/csv");
    toast("CSV exportado ✅", "success");
    modal.remove();
  });

  qs("#btnExportJSON")?.addEventListener("click", () => {
    const json = JSON.stringify(state, null, 2);
    downloadFile(json, "doce-lucro-backup.json", "application/json");
    toast("JSON exportado ✅", "success");
    modal.remove();
  });

  qs("#btnExportPDF")?.addEventListener("click", () => {
    toast("PDF preparado para download", "info");
    modal.remove();
  });
}

function generateCSV() {
  const sales = state.sales || [];
  let csv = "Data,Metodo,Venda,Custo,Taxa,Lucro\n";
  for (const s of sales) {
    csv += `${s.date},${s.metodo},${s.totalVenda},${s.totalCusto},${s.taxaCartao},${s.lucro}\n`;
  }
  return csv;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function radioPill(name, value, label, checked) {
  return `<button class="pill" type="button" data-pay="${value}" style="${checked ? "background:rgba(255,79,163,0.2);border-color:rgba(255,79,163,0.5)" : ""}">${label}</button>`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function getRemainingDaysInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

function getTodaySummary() {
  const today = todayKey();
  const sales = (state.sales || []).filter(s => s.date === today);
  let faturamento = 0, custos = 0, taxas = 0, lucro = 0;
  for (const s of sales) {
    faturamento += Number(s.totalVenda || 0);
    custos += Number(s.totalCusto || 0);
    taxas += Number(s.taxaCartao || 0);
    lucro += Number(s.lucro || 0);
  }
  return { faturamento, custos, taxas, lucro };
}

function getMonthSummary() {
  const month = monthKey();
  const sales = (state.sales || []).filter(s => (s.date || "").startsWith(month));
  let faturamento = 0, custos = 0, taxas = 0, lucro = 0;
  for (const s of sales) {
    faturamento += Number(s.totalVenda || 0);
    custos += Number(s.totalCusto || 0);
    taxas += Number(s.taxaCartao || 0);
    lucro += Number(s.lucro || 0);
  }
  return { faturamento, custos, taxas, lucro };
}

function getLast7DaysSummary() {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const sales = (state.sales || []).filter(s => s.date === dateStr);
    let faturamento = 0, custos = 0, lucro = 0;
    for (const s of sales) {
      faturamento += Number(s.totalVenda || 0);
      custos += Number(s.totalCusto || 0);
      lucro += Number(s.lucro || 0);
    }
    result.push({
      dia: dateStr.slice(5),
      date: dateStr,
      faturamento,
      custos,
      lucro
    });
  }
  return result;
}

function getTopProducts(limit = 5) {
  const products = state.products || [];
  const sales = state.sales || [];
  const productStats = {};
  for (const s of sales) {
    for (const item of (s.items || [])) {
      if (!productStats[item.id]) {
        productStats[item.id] = { qty: 0, revenue: 0, lucro: 0 };
      }
      productStats[item.id].qty += item.qty;
      productStats[item.id].revenue += item.qty * item.unitPrice;
      productStats[item.id].lucro += item.qty * (item.unitPrice - item.unitCost);
    }
  }
  return products
    .map(p => ({
      ...p,
      ...productStats[p.id]
    }))
    .filter(p => p.qty > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function computeCartTotals(cart, products, metodo, desconto, acrescimo) {
  let subtotal = 0, totalCusto = 0;
  for (const [prodId, qty] of Object.entries(cart)) {
    const p = products.find(x => x.id === prodId);
    if (p) {
      subtotal += qty * p.preco;
      totalCusto += qty * p.custo;
    }
  }
  const taxa = calcCardFee(subtotal, metodo);
  const totalFinal = subtotal + taxa + acrescimo - desconto;
  const lucro = totalFinal - totalCusto - taxa;
  return { subtotal, totalCusto, taxa, totalFinal, lucro };
}

function cartToItems(cart, products) {
  const items = [];
  for (const [prodId, qty] of Object.entries(cart)) {
    const p = products.find(x => x.id === prodId);
    if (p) {
      items.push({
        id: prodId,
        name: p.nome,
        qty,
        unitPrice: p.preco,
        unitCost: p.custo
      });
    }
  }
  return items;
}

function renderWeekTable(week) {
  const rows = week.map(w => `
    <tr>
      <td>${w.dia}</td>
      <td>${brl(w.faturamento)}</td>
      <td>${brl(w.custos)}</td>
      <td style="color:var(--good)">${brl(w.lucro)}</td>
    </tr>
  `).join("");

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Dia</th>
          <th>Venda</th>
          <th>Custo</th>
          <th>Lucro</th>
        </tr>
      </thead>
      <tbody>${rows || ""}</tbody>
    </table>
  `;
}

function getOpenOrdersToReceive() {
  const open = (state.orders || []).filter(o => (o.status || "aberta") === "aberta");
  return open.reduce((acc, o) => acc + (Number(o.total || 0) - Number(o.sinal || 0)), 0);
}

function getCashSummaryForDate(dateStr) {
  const sales = (state.sales || []).filter(s => s.date === dateStr);
  let dinheiro = 0, pix = 0, cartao = 0;
  for (const s of sales) {
    const v = Number(s.totalVenda || 0);
    if (s.metodo === "dinheiro") dinheiro += v;
    else if (s.metodo === "pix") pix += v;
    else if (s.metodo === "cartao") cartao += v;
  }
  const entradasTotal = dinheiro + pix + cartao;
  const saidas = (state.cashMoves || [])
    .filter(m => m.date === dateStr && m.type === "out")
    .reduce((a, m) => a + Number(m.value || 0), 0);
  const saldo = entradasTotal - saidas;
  return { dinheiro, pix, cartao, entradasTotal, saidas, saldo };
}

function seedProductsOnly() {
  state.products = [
    { id: newId(), nome: "Bolo no pote", preco: 12, custo: 5, createdAt: new Date().toISOString() },
    { id: newId(), nome: "Brigadeiro (cx 10)", preco: 18, custo: 7, createdAt: new Date().toISOString() },
    { id: newId(), nome: "Torta fatia", preco: 10, custo: 4, createdAt: new Date().toISOString() }
  ];
  persist();
}

function seedDemo() {
  if ((state.products || []).length === 0) seedProductsOnly();
  const cart = {};
  cart[state.products[0].id] = 2;
  cart[state.products[1].id] = 1;
  const totals = computeCartTotals(cart, state.products, "dinheiro", 0, 0);
  state.sales.push({
    id: newId(),
    date: todayKey(),
    createdAt: new Date().toISOString(),
    metodo: "dinheiro",
    items: cartToItems(cart, state.products),
    desconto: 0,
    acrescimo: 0,
    recebido: 50,
    troco: Math.max(0, 50 - totals.totalFinal),
    totalVenda: totals.totalFinal,
    totalCusto: totals.totalCusto,
    taxaCartao: totals.taxa,
    lucro: totals.lucro
  });
  const oCart = {};
  oCart[state.products[2].id] = 3;
  const items = cartToItems(oCart, state.products);
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const totalCusto = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  state.orders.push({
    id: newId(),
    createdAt: new Date().toISOString(),
    status: "aberta",
    cliente: "Cliente Demo",
    whats: "",
    dataRetirada: new Date().toISOString().slice(0, 10),
    taxaEntrega: 5,
    sinal: 10,
    itemsById: oCart,
    items,
    total: subtotal + 5,
    totalCusto,
    lucroEstimado: calcProfit(subtotal + 5, totalCusto, 0)
  });
  state.cashMoves.push({
    id: newId(),
    date: todayKey(),
    type: "out",
    desc: "Compra de ingredientes",
    value: 15,
    createdAt: new Date().toISOString()
  });
  persist();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, type = "info") {
  let el = document.querySelector(".dl-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "dl-toast";
    document.body.appendChild(el);
  }
  el.className = `dl-toast dl-toast--${type}`;
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add("is-visible"));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

function parseMoneyInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replaceAll(".", "").replace(",", ".")
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyInput(n) {
  const val = Number(n || 0);
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clampMoney(v, min, max) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function calcMarginPercentLocal(preco, custo) {
  const p = Number(preco || 0);
  const c = Number(custo || 0);
  if (!(p > 0)) return 0;
  return Math.round(((p - c) / p) * 100);
}

async function registerSW() {
  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js");
    }
  } catch {
    // ok
  }
}

mount();
