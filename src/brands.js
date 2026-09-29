export function brandOf(shop) {
  const n = String(shop?.name || "");
  if (/養心/.test(n)) return "yangxin";
  if (/雅善圓/.test(n)) return "yashanyuan";
  if (/7-?Eleven|統一超商|7.?11/i.test(n)) return "seven";
  if (/美廉社|三商家購/.test(n)) return "simplemart";
  if (/全家|FamilyMart/i.test(n)) return "familymart";
  if (/萊爾富|Hi-?Life/i.test(n)) return "hilife";
  if (/全聯/.test(n)) return "pxmart";
  if (/蝦皮/.test(n)) return "shopee";
  if (/85/.test(n)) return "85c";
  if (/藥局|pharmacy/i.test(n) || shop?.kind === "pharmacy") return "pharmacy";
  return shop?.kind || "shop";
}

export const BRAND = {
  yangxin: { color: "#c4894a", fascia: "#6b4a2c", ink: "#fff6e4", floor: 2 },
  yashanyuan: { color: "#4d7a45", fascia: "#2f4f2c", ink: "#f4f7e8", floor: 1 },
  seven: { color: "#007548", fascia: "#e87722", ink: "#ffffff", floor: 1 },
  simplemart: { color: "#f0c400", fascia: "#d91e18", ink: "#d91e18", floor: 1 },
  familymart: { color: "#009845", fascia: "#00a0e9", ink: "#ffffff", floor: 1 },
  hilife: { color: "#e87722", fascia: "#007548", ink: "#ffffff", floor: 1 },
  pxmart: { color: "#e85d04", fascia: "#c44500", ink: "#ffffff", floor: 1 },
  shopee: { color: "#ee4d2d", fascia: "#ee4d2d", ink: "#ffffff", floor: 1 },
  "85c": { color: "#6b3a2a", fascia: "#4a2418", ink: "#f3e2c8", floor: 1 },
  pharmacy: { color: "#1f8a4d", fascia: "#146338", ink: "#ffffff", floor: 1 },
  convenience: { color: "#2f9e44", fascia: "#1f7a32", ink: "#ffffff", floor: 1 },
  supermarket: { color: "#d4a017", fascia: "#b8860b", ink: "#fff8e8", floor: 1 },
  restaurant: { color: "#b23b32", fascia: "#7a241c", ink: "#fff4e8", floor: 1 },
  cafe: { color: "#8a5a38", fascia: "#5a3a24", ink: "#fff4e8", floor: 1 },
  massage: { color: "#c4894a", fascia: "#6b4a2c", ink: "#fff6e4", floor: 2 },
};

export function brandMeta(shop) {
  const brand = brandOf(shop);
  const meta = BRAND[brand] || BRAND[shop?.kind] || { color: shop?.color || "#3a4a6b", fascia: "#2a2420", ink: "#fff8ea", floor: 1 };
  const floor = Number(shop?.floor) || meta.floor || 1;
  return { brand, floor, color: shop?.color || meta.color, fascia: meta.fascia, ink: meta.ink };
}

export function isChainStore(brand) {
  return ["seven", "simplemart", "familymart", "hilife", "pxmart", "shopee"].includes(brand);
}
