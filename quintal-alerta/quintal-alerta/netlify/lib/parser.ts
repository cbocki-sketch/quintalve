import { load } from "cheerio";

export const BASE = "https://quintalbutia.com.br";

export interface Parsed {
  title: string;
  date: string;
  lotes: string;
  /** true = há ingresso comprável; false = não há; null = não deu para saber (nunca gera alerta) */
  available: boolean | null;
  source: string;
  productId: string | null;
}

/** Lista as páginas de evento (produtos WooCommerce) encontradas na agenda. */
export function parseAgenda(html: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $('a[href*="/product/"]').each((_, a) => {
    try {
      const u = new URL($(a).attr("href") ?? "", BASE);
      if (!u.hostname.endsWith("quintalbutia.com.br")) return;
      u.search = "";
      u.hash = "";
      urls.add(u.toString());
    } catch {
      /* link inválido */
    }
  });
  return [...urls];
}

/** Lê uma página de evento: título, data, lotes e disponibilidade real de compra. */
export function parseProduct(html: string): Parsed {
  const $ = load(html);
  const title = ($("h1.product_title").first().text() || $("h1").first().text()).trim();
  const body = $("body").text().replace(/\s+/g, " ");

  const dm = body.match(/Data:\s*([a-zçã]+)\s+(\d{1,2}),\s*(\d{4})/i);
  const date = dm ? `${dm[2]} de ${dm[1].toLowerCase()} de ${dm[3]}` : "";

  const desc = $("#tab-description, .woocommerce-product-details__short-description")
    .text()
    .replace(/\s+/g, " ");
  const lotes = [...desc.matchAll(/(?:\b(\p{L}{3,20}):\s*)?LOTE\s*(?:N[º°o]\s*)?(\d+|[ÚU]NICO)/giu)]
    .map((m) => `${m[1] ?? ""} lote ${m[2]}`.trim())
    .sort()
    .join(" | ");

  const productId =
    $("form.variations_form, form.cart").first().attr("data-product_id") ||
    $('[name="add-to-cart"]').first().attr("value") ||
    $('link[rel="shortlink"]').attr("href")?.match(/[?&]p=(\d+)/)?.[1] ||
    $("body").attr("class")?.match(/postid-(\d+)/)?.[1] ||
    null;

  let available: boolean | null = null;
  let source = "none";

  // 1) Produto variável (Masculino/Feminino): JSON de variações do WooCommerce
  const raw = $("form.variations_form").first().attr("data-product_variations");
  if (raw && raw !== "false") {
    try {
      const vars = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (Array.isArray(vars)) {
        available = vars.some(
          (v) =>
            v.is_in_stock === true &&
            v.is_purchasable !== false &&
            v.variation_is_active !== false &&
            v.variation_is_visible !== false &&
            v.max_qty !== 0,
        );
        source = "variations";
      }
    } catch {
      /* JSON ilegível: cai para os próximos sinais */
    }
  }

  // 2) Sinais da página
  if (available === null) {
    const outOfStock = $(".stock.out-of-stock").length > 0;
    const btn = $("form.cart button.single_add_to_cart_button, form.cart button[name='add-to-cart']");
    if (outOfStock) {
      available = false;
      source = "out-of-stock";
    } else if (!$("form.variations_form").length && btn.length) {
      available = !btn.is(".disabled, [disabled]");
      source = "button";
    } else if (!$("form.cart").length && title && $("body.single-product").length) {
      // página completa de produto sem formulário de compra = não comprável
      available = false;
      source = "no-buy-form";
    }
  }
  return { title, date, lotes, available, source, productId };
}
