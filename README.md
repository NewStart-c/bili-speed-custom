# bili-speed-custom

为 B 站播放器添加自定义倍速预设、任意数值输入与快捷键，并全局记忆播放速度。基于 Manifest V3，适用于 Chrome 与 Edge。

> 给 B 站加更多倍速选项，并记住你的选择。

## 功能

- **更多预设**：在原生倍速菜单中追加 2.5x、3.0x、3.5x、4.0x。
- **任意倍速**：输入 0.0625x – 16x 之间的任意数值，按回车立即生效。
- **快捷键**：`Shift + 1` / `Shift + 2` / `Shift + 3` 快速切换为 1x / 2x / 3x。
- **全局记忆**：倍速保存在浏览器本地，打开新的视频页面时自动恢复。
- **原生体验**：直接集成在 B 站播放器控制栏的“倍速”菜单中，没有额外悬浮按钮。
- **SPA 兼容**：页面切换或播放器重建后，自定义菜单项会自动重新注入。

## 安装

1. 克隆或下载本仓库：

   ```bash
   git clone git@github.com:NewStart-c/bili-speed-custom.git
   ```

2. 打开浏览器的扩展管理页面：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`

3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的项目根目录。
5. 打开任意 B 站视频页面即可使用。

## 使用

1. 将鼠标移到播放器底部的“倍速”按钮上，展开倍速菜单。
2. 选择新增的预设，或在输入框中输入倍速后按 `Enter`。
3. 也可以使用快捷键 `Shift + 1` / `Shift + 2` / `Shift + 3`。
4. 选择会自动保存，下次打开 B 站视频时自动应用。

## 支持范围

- 浏览器：Chrome / Edge（Manifest V3）
- 页面：
  - `https://www.bilibili.com/video/*`
  - `https://www.bilibili.com/bangumi/play/*`

## 项目结构

```text
.
├── manifest.json       # 扩展清单（Manifest V3）
├── content.js          # 核心逻辑：注入菜单、设置倍速、记忆与快捷键
├── injected.css        # 菜单项与输入框样式
├── icon.svg            # 图标源文件
├── icons/              # 16 / 48 / 128 尺寸扩展图标
└── make-icons.html     # 图标生成辅助页面
```

## 开发说明

- 项目为纯 JavaScript 实现，无需构建步骤。
- 修改代码后，在扩展管理页面点击“重新加载”，并刷新 B 站页面。
- 扩展仅使用 `storage` 权限和 `www.bilibili.com` 站点权限；倍速数据只保存在本地，不会上传或收集任何信息。

## 反馈

欢迎提交 Issue 或 Pull Request。
