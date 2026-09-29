# 養心 3D 地圖（鎮撫街46號 · 200 公尺）

獨立專案，**不會取代** 惠宇網站既有的種心田（`game.html`）。之後可整包搬到養心站。

中心：桃園市桃園區鎮撫街46號，範圍往外 200 公尺。地板與屋頂貼國土測繪正射影像；建物輪廓以國土測繪 BUILDX 分戶為主、OSM 具名建築為輔。46 號是 2 層透天。第一視角近地用正射原色重建瀝青質感。

## 本機

```bash
cd yangxin-3d
npm install
npm run fetch-map
npm run fetch-buildx
npm run fetch-shops
npm run dev
```

瀏覽器打開終端機顯示的本機網址。

- 環繞檢視：拖曳旋轉、滾輪縮放
- 第一視角：點「第一視角」後 WASD 走路、空白鍵跳躍、Shift 跑步、滑鼠轉頭；撞到建物會被擋住，Esc 離開
- 出生點在鎮撫街 46 號店面正前方，朝向「養心推拿」招牌

```bash
npm test
npm run test:e2e
```

## 要改地圖時

- [`public/data/map-config.json`](public/data/map-config.json)：中心座標、半徑、眼高、走路速度
- [`public/data/edits.json`](public/data/edits.json)：依 OSM id 改某一棟的高度、顏色、名稱
- [`public/data/shops.json`](public/data/shops.json)：招牌名稱、顏色、座標；或改 `tools/bake-shops.mjs` 的店家清單後再 `npm run fetch-shops`
- 路網或建物過舊：再跑 `npm run fetch-map` 與 `npm run fetch-buildx`
- 只重拉地板正射影像：`npm run fetch-ground`
- 只重拉分戶建物框：`npm run fetch-buildx`

## 出處

- 地圖資料 © OpenStreetMap contributors（ODbL）
- 正射影像：內政部國土測繪中心 WMTS PHOTO2；若抓取失敗則改用 Esri World Imagery
- 建物框：內政部國土測繪中心 WMTS BUILDX
- 招牌店名：OSM 標註＋鎮撫街公開店家／公司登記，僅供地圖還原，不代表營業狀態
