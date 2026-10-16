# 塔科夫助手 Tarkov Helper

逃离塔科夫任务助手，安卓 App + 可安装网页版。所有游戏数据运行时实时从 [tarkov.dev](https://tarkov.dev) 社区接口获取，游戏更新后不用改代码。

## 功能

- **任务**：按状态（可接 / 未解锁 / 已完成）、商人、地图筛选，支持搜索任务名、目标描述和物品名，可只看 Kappa / 灯塔商人任务。
- **任务详情**：交易商、地图、等级要求、经验、每个任务目标（需要的物品、FIR 标记、需要的钥匙）、前置任务、完成后解锁、奖励、Wiki 链接。
- **进度打勾**：整个任务或单个目标都能打勾。把一个任务标记完成时，会自动把它的前置任务链一起标记（方便赛季中途开始用）。可接任务会根据你的等级、阵营和已完成任务自动计算。
- **地图**：基于 tarkov.dev 的交互地图坐标，标出任务目标点（到达、标记/放置、任务物品可能位置、击杀区域）和撤离点；可切换卫星图 / 示意图；任务详情里点“在地图上查看”会直接定位。
- **任务物品清单**：汇总未完成任务需要上交或放置的物品，区分 FIR，用 +/− 记录已准备的数量。
- **价格与兑换**：搜索任意物品，查看跳蚤 24h 均价、最低挂单、48h 涨跌、每格价值、卖给各商人的价格、购买渠道（含商人等级和任务解锁）、可兑换获得的配方、可用于哪些兑换。
- **其他**：中 / 英文切换，PvP / PvE 数据切换，USEC / BEAR，进度导出导入，离线时使用上次缓存的数据。

## 方式一：GitHub 自动编译 APK（推荐，不用装 Android Studio）

1. 在 GitHub 新建一个仓库（例如 `tarkov-helper`），把这个文件夹全部推上去：
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/tarkov-helper.git
   git push -u origin main
   ```
2. 推送后 Actions 会自动运行（约 5 分钟）。完成后在仓库 **Releases** 页面下载 `tarkov-helper.apk`，手机上打开安装（需要允许“安装未知来源应用”）。

以后改了代码再 push 一次，就会生成新的 APK。

## 方式二：本地用 Android Studio 编译

需要 Node.js 22+、JDK 21、Android Studio（带 Android SDK 36）。

```bash
npm install
npm run sync              # 复制网页资源到安卓工程
npx cap open android      # 用 Android Studio 打开，点 Run 装到手机
```

或命令行：`cd android && ./gradlew assembleDebug`，APK 在 `android/app/build/outputs/apk/debug/`。

## 在电脑上预览网页版

```bash
npm install && npm run vendor
npx http-server www -p 8080
```
然后浏览器打开 http://localhost:8080 。

## 目录

```
www/                网页 App（安卓 App 也是用它）
  index.html
  css/app.css
  js/app.js         界面与逻辑
  js/api.js         tarkov.dev GraphQL 查询 + 离线缓存
  js/i18n.js        中英文界面文字
  js/maps-config.js 交互地图坐标参数
  sw.js             网页版离线缓存
android/            Capacitor 生成的安卓工程
.github/workflows/  自动编译 APK、部署网页
```

## 数据与版权

- 任务、地图坐标、物品价格来自 tarkov.dev 公开 API；地图底图来自 tarkov.dev 资源服务器。
- `js/maps-config.js` 的地图参数取自 [the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev)（GPL-3.0）。
- 玩家自制工具，与 Battlestate Games 无关。
