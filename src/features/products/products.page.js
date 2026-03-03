import { qs, qsa, brl } from "../../ui.js";
import { calcMargin, calcROI } from "../../db.js";
import { newId } from "../../state.js";
import { getState, persist } from "../../core/store.js";
import { escapeHtml, parseMoneyInput, formatMoneyInput, toast } from "../../utils/helpers.js";

export function renderProducts(root) {
  const state = getState();
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
          const s = getState();
          s.products = (s.products || []).filter((p) => p.id !== pid);
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
  const state = getState();
  const product = productId ? (state.products || []).find((p) => p.id === productId) : null;
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

    const s = getState();
    if (isEdit) {
      const idx = (s.products || []).findIndex((p) => p.id === productId);
      if (idx >= 0) s.products[idx] = { ...product, nome, preco, custo };
    } else {
      (s.products || []).push({ id: newId(), nome, preco, custo });
    }

    persist();
    modal?.remove();
    toast(`Produto ${isEdit ? "atualizado" : "criado"} ✅`, "success");
    renderProducts(root);
  });

  container.querySelector("#btnDeleteProduct")?.addEventListener("click", () => {
    if (confirm("Deletar produto?")) {
      const s = getState();
      s.products = (s.products || []).filter((p) => p.id !== productId);
      persist();
      modal?.remove();
      toast("Produto deletado ✅", "success");
      renderProducts(root);
    }
  });
}