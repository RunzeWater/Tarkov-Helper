# 塔科夫助手 Tarkov Helper

逃离塔科夫任务助手，安卓 App + 可安装网页版（iPad / iPhone 用网页版添加到主屏幕），多台设备之间可以自动同步进度。所有游戏数据在运行时从 [tarkov.dev](https://tarkov.dev) 的公开数据文件（json.tarkov.dev，和 tarkov.dev 官网用的同一份）下载，游戏更新后不用改代码。

## 功能

- **任务**：按状态（要做 / 可接 / 未解锁 / 已完成）、商人、地图、商人等级（LL1–4）筛选，支持搜索任务名、目标描述和物品名，可只看 Kappa / 灯塔商人任务。
- **商人等级（LL1–4）**：1.1 版本后大部分支线任务按商人等级解锁。在“设置 → 商人等级”填好各商人的 LL，“可接”就会按你的等级和商人等级计算；任务列表每行都标出 LL，等级不够的标成橙色。
- **任务详情**：交易商、地图、等级要求、经验、每个任务目标（需要的物品、FIR 标记、需要的钥匙）、商人等级要求、前置任务、完成后解锁、奖励、Wiki 链接。经验值会和英文 Wiki 对一遍：tarkov.dev 的数字没跟上版本时，以 Wiki 为准并标出“Wiki”。
- **要做的任务**：在任务列表里点“＋ 要做”选出这次要做的任务，地图切到“要做”就只标出这些任务的位置，任务名直接标在点旁边；点任务点可以看目标说明和 Wiki 上的位置图片，并直接把这个目标标记完成；地图右上角的清单按钮列出所有要做任务的目标，可一键定位。
- **进度打勾**：整个任务或单个目标都能打勾。把一个任务标记完成时，会自动把它的前置任务链一起标记（方便赛季中途开始用）。可接任务会根据你的等级、阵营和已完成任务自动计算。
- **地图**：标出任务目标点（到达、标记/放置、任务物品可能位置、击杀区域）、撤离点和转移点，并用中文标出标志性建筑和地点（“地标”按钮可开关，缩小时自动隐藏会互相遮挡的名字）。底图可选：
  - **社区地图**（默认）：借用 HK 玩家 Kenny#2085 的互动地图（sites.google.com/view/interactivemap）上的玩家绘制地图，带建筑、楼层和房间号。任务点和撤离点是按 tarkov.dev 坐标换算到图上的，误差一般几米（灯塔约 20 米）。工厂的四层画在同一张图上，点位会自动放到对应楼层；实验室可以切换三层；海关可选简单 / 详细两种画法。
  - **卫星图 / 示意图**：tarkov.dev 的地图，坐标最准；示意图可按楼层查看。
  高分辨率屏幕自动加载更清晰的图块；可全屏查看（返回键退出）；任务详情里点“在地图上查看”会直接定位。
- **撤离点详情**：点地图上的撤离点名称（或右上角的撤离点列表）查看阵营、需要启动的开关、付费撤离的费用、转移目的地，以及来自英文 Wiki 的实景图片、是否常开、是否一次性、条件和备注；图片可全屏缩放查看。
- **任务物品清单**：汇总未完成任务需要上交或放置的物品，区分 FIR，用 +/− 记录已准备的数量。
- **价格与兑换**：搜索任意物品，查看跳蚤 24h 均价、最低挂单、48h 涨跌、每格价值、卖给各商人的价格、购买渠道（含商人等级和任务解锁）、可兑换获得的配方、可用于哪些兑换。
- **主线剧情**：任务页顶部切到“主线剧情”，列出 1.0 的 10 个章节（塔科夫之旅、陨落星辰、门票，加 7 个调查章节）和四个结局的条件。每章写明开启方式、每一步去哪张地图做什么、奖励和注意事项，步骤可以打勾（会同步），点地图标签直接打开那张地图。tarkov.dev 没有主线数据，这部分整理自 Wiki 和社区攻略（2026 年 10 月），以游戏内为准。
- **多设备同步**：在“设置 → 多设备同步”填一个只带 gist 权限的 GitHub 令牌，进度（已完成任务、目标、要做、物品数量、玩家等级、商人 LL、阵营）就存进你 GitHub 账号下一个不公开的 Gist。手机和 iPad 连同一个 GitHub 账号即可，打开 App、切回 App、修改进度后自动同步，开着时每分钟检查一次。每条进度都记着修改时间，两边同时改、离线改都能正确合并（取消打勾也会同步过去）。
- **其他**：中 / 英文切换，PvP / PvE 数据切换，USEC / BEAR，进度导出导入（包括要做的任务和商人等级），离线时使用上次缓存的数据。

## 方式一：GitHub 自动编译 APK（推荐，不用装 Android Studio）

1. 在 GitHub 新建一个仓库（例如 `tarkov-helper`），把这个文件夹全部推上去：
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/tarkov-helper.git
   git push -u origin main
   ```
2. 推送后 Actions 会自动运行（约 5 分钟）。完成后在仓库 **Releases** 页面下载 `tarkov-helper.apk`，手机上打开安装（需要允许“安装未知来源应用”）。

以后改了代码再 push 一次，就会生成新的 APK。仓库里带了固定的调试签名（`android/app/debug.keystore`），所以新 APK 可以直接覆盖安装，进度不会丢。

## iPad / iPhone：网页版添加到主屏幕

不需要 Mac，也不需要苹果开发者账号。

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（私有仓库需要 GitHub Pro，学生包免费；或者把仓库设为公开）。
2. 确认仓库里有 `.github/workflows/pages.yml`。之后每次推送到 `main`，Actions 里的 “Deploy web version” 都会把 `www/` 发布到 `https://<你的用户名>.github.io/<仓库名>/`。如果它在第 1 步之前就运行过并失败了，在 Actions 页面点 **Run workflow** 重新运行一次。
3. iPad 上用 **Safari** 打开这个网址 → 分享按钮 → **添加到主屏幕**。之后从主屏幕图标打开，就是全屏 App 的样子，能离线使用缓存的数据。
4. 在 iPad 和手机上都打开“设置 → 多设备同步”，连接同一个 GitHub 账号。

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
  js/api.js         读取 json.tarkov.dev 数据文件、翻译、离线缓存
  js/i18n.js        中英文界面文字
  js/maps-config.js 交互地图坐标参数和地标（tarkov.dev）
  js/hk-maps.js     社区地图图块地址、换算参数和作者
  js/landmarks.js   地标中文名
  js/sync.js        多设备同步（GitHub Gist）
  js/story.js       主线章节与结局（中英文，手工整理）
  sw.js             网页版离线缓存
android/            Capacitor 生成的安卓工程
.github/workflows/  自动编译 APK、部署网页
```

## 数据与版权

- 任务、地图坐标、物品价格与兑换来自 tarkov.dev 公开数据文件（json.tarkov.dev）；卫星图和示意图来自 tarkov.dev 资源服务器。
- 社区地图的图块在运行时从 Kenny#2085 的公开仓库 github.com/kinkenny93/TarkovInteractiveMap 读取（不打包进 App）。地图作者：海关 Monkimonkimonk / Glory4Lyfe，森林 / 储备站 / 灯塔 / 街区 / 海岸线 Jindouz（海岸线基于 Monkimonkimonk），工厂 / 立交桥 / 迷宫 Re3mr（CC BY-NC-SA 4.0），中心区 xTycho（CC BY-NC-SA 4.0），实验室 Logiwonk。仓库本身没有写授权条款，公开分发 App 前最好先在作者的 Discord 打个招呼。
- 任务位置图片、撤离点图片和部分经验值来自英文 Wiki（escapefromtarkov.fandom.com，CC BY-SA）。
- `js/maps-config.js` 的地图参数取自 [the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev)（GPL-3.0）。
- 同步数据只存在你自己 GitHub 账号下的 Gist 里；令牌只保存在各自的设备上，不会出现在导出的进度文本里。
- 玩家自制工具，与 Battlestate Games 无关。
