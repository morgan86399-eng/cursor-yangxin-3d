# Cursor 版來源

- Pull request: https://github.com/morgan8639-design/shenxinling-website/pull/5
- Branch: `cursor/yangxin-3d-map-3c71`
- Imported commit: `4cc34bd2f6e6010b27d8fc348470931b826c1075`
- 整合原則：保留 Cursor 版 Three.js 地圖與第一人稱移動，田地只使用現有 `/api/xintian/*` 狀態，不建立第二套存檔。
- 2.5D 招牌樓：街面可在 HUD 切換「寫實立面／混合／2.5D 招牌樓」。預設混合，50 公尺內維持既有近景，較遠處用程序化立面。參考 [鎮撫街 GTA 預覽](https://morgan86399-eng.github.io/zhenfu-gta-preview/)。這層是示意窗格與招牌帶，不是實景街廓。
