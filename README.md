# bili-speed-custom

为 B 站播放器添加自定义倍速预设、任意数值输入与快捷键，并全局记忆播放速度。基于 Manifest V3，适用于 Chrome 与 Edge。

> 给 B 站加更多倍速选项，并记住你的选择。当前版本：**2.0.0**。

## 功能

- **可编辑预设**：默认追加 2.5x、3.0x、3.5x、4.0x，可在设置页增删、排序，最多 12 个。
- **任意倍速**：输入 0.0625x – 16x 之间的数值，回车立即生效；支持 `1,5` 逗号小数、非法值提示与范围限制。
- **快捷键**：`Shift + 1` / `Shift + 2` / `Shift + 3` 快速切换为 1x / 2x / 3x，使用物理键位，兼容不同键盘布局。
- **全局记忆**：倍速保存在浏览器本地，打开新的视频页面时自动恢复；点 B 站原生倍速菜单也会被记住。
- **SPA / 换源恢复**：切集、切 P、换清晰度后自动恢复目标倍速；播放器重建时自动重新注入菜单项。
- **原生体验**：直接集成在 B 站播放器控制栏的“倍速”菜单中，没有额外悬浮按钮。
- **Popup 控制面板**：不展开视频菜单也能快速改速、恢复 1x、启用/暂停扩展。
- **设置页**：管理预设、默认倍速、微调步长，导入/导出/恢复默认设置。
- **本地优先**：不联网、不收集数据，设置只保存在 `chrome.storage.local`。

## 安装

### 普通用户（推荐）

1. 打开仓库的 [Releases](https://github.com/NewStart-c/bili-speed-custom/releases) 页面，下载最新的 `bili-speed-custom-v*.zip`。
2. 解压到一个固定目录。
3. 打开浏览器扩展管理页面：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
4. 开启“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择解压后的目录（其中应包含 `manifest.json`）。

### 从源码构建

```bash
git clone git@github.com:NewStart-c/bili-speed-custom.git
cd bili-speed-custom
npm ci
npm run build
```

构建产物在 `dist/`。在扩展管理页面选择“加载已解压的扩展程序”，**选择 `dist/` 目录**（不是仓库根目录）。

开发时可以使用：

```bash
npm run watch       # 监听源码变化并重新构建
npm run typecheck   # TypeScript 类型检查
npm run test:unit   # Vitest 单元测试
npm run test:e2e    # Playwright E2E（需要先 npm run build）
npm run package     # 生成 release/bili-speed-custom-v*.zip
npm run verify      # typecheck + 单元测试 + 构建
```

E2E 需要安装 Chromium：

```bash
npx playwright install chromium
```

## 使用

1. 将鼠标移到播放器底部的“倍速”按钮上，展开倍速菜单。
2. 选择预设，或在输入框中输入倍速后按 `Enter`；`−` / `+` 按设置的步长微调，`1x` 快速复位。
3. 也可以使用快捷键 `Shift + 1` / `Shift + 2` / `Shift + 3`。
4. 点击浏览器工具栏中的扩展图标，可以打开 Popup 快速改速或暂停扩展。
5. 选择会自动保存，下次打开 B 站视频时自动应用。

> **提示**：B 站播放器没有针对超高倍速优化，超过 3x 后可能出现音画不同步、卡顿或声音异常，请按需使用。

## 支持范围

- 浏览器：Chrome / Edge（Manifest V3）
- 页面：
  - `https://www.bilibili.com/video/*`
  - `https://www.bilibili.com/bangumi/play/*`

## 项目结构

```text
.
├── manifest.json          # 扩展清单源文件（构建时注入 package.json 版本号）
├── src/
│   ├── content/           # 内容脚本：播放器、菜单、生命周期
│   ├── background/        # Service Worker：安装/启动时迁移设置
│   ├── popup/             # 工具栏 Popup
│   ├── options/           # 设置页
│   └── shared/            # 类型、常量、倍速工具、存储
├── injected.css           # 注入到 B 站的菜单样式
├── icons/                 # 16 / 48 / 128 图标
├── scripts/               # 构建与打包脚本
├── tests/                 # Vitest 单元测试 + Playwright E2E
└── docs/ROADMAP.md        # 后续功能路线图
```

> 仓库根目录的 `content.js`、`content.txt`、`manifest.txt` 是 v1.x 的历史副本，不参与 v2 构建，可后续清理。

## 数据与隐私

扩展仅使用 `storage` 权限和 `www.bilibili.com` 站点权限。倍速、预设和开关状态只保存在本地浏览器中，不会上传或收集任何信息。详见 [privacy.md](privacy.md)。

## 已知限制

- B 站播放器 DOM 会随版本变化；如果菜单注入失效，请提交 Issue 并附上浏览器版本。
- 当前为全局记忆；按视频、分 P、合集、UP 主、分区记忆在后续版本提供，见 [docs/ROADMAP.md](docs/ROADMAP.md)。
- 与 Bilibili-Evolved 等倍速脚本同时使用时，双方都会向原生菜单注入选项；本项目会尽量去重并与原生菜单共存。

## 反馈

欢迎提交 Issue 或 Pull Request。
