# YING PLAY · 方案 B · MacCMS 风格最终版

本项目按“方案 B”实现：Cloudflare Pages + Pages Functions + D1，不需要 PHP/MySQL 服务器。

产品结构以用户提供的 MacCMS V10 为参照：影视、分类、搜索、详情、播放、播放线路、播放集、后台管理、站点设置；前台采用现代影院风，并保留 MacCMS V10 模板目录语义。MacCMS 本身采用 PHP+MySQL、模板分离和 `template/default/html/vod/{type,detail,play}.html` 等结构，本项目将这些产品概念映射到 Cloudflare D1/Functions。

## 部署
1. 在 Cloudflare 创建 Pages 项目并上传 `public/`。
2. 创建 D1 数据库。
3. D1 Console 执行 `schema.sql`。
4. Pages Settings → Functions/Bindings → D1，绑定变量名 `DB`。
5. Pages Settings → Environment variables，新增 `ADMIN_SECRET`，使用随机长字符串。
6. 重新部署。
7. 打开 `/api/health`，应返回 `ok:true`。
8. 打开 `/admin.html`，首次用至少 3 位用户名 + 6 位密码创建管理员。

## MacCMS 风格映射
- `template/default/html/index/index.html` → 前台首页
- `template/default/html/vod/type.html` → 分类/筛选
- `template/default/html/search/index.html` → 搜索
- `template/default/html/vod/detail.html` → 详情
- `template/default/html/vod/play.html` → 播放
- `application/admin` 的 CMS 管理思路 → `/admin.html`
- VOD / source / episode 数据模型 → D1 `videos / sources / episodes`

## 主题
`themes/` 提供三套视觉主题槽位：YING Cinema、YING Glass、YING Minimal。
`maccms-reference/` 保存从用户提供的 MacCMS V10 源码中提取的原生模板目录结构，作为开发参考，不是 Cloudflare 运行时 PHP 模板。

## 合规
只录入和播放你拥有合法使用权或授权的内容及播放源。
