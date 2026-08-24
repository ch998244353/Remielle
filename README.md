# 蕾米埃尔桌宠

蕾米埃尔是一个 Windows x64 桌面宠物：支持待机、点击、消息和拖动动作，可显示 Codex 剩余额度，也可选接收经过安全清洗的 Codex 桌面任务通知。

> **[下载 0.4.0 Beta](https://github.com/ch998244353/Remielle/releases/tag/v0.4.0-beta.1)**
>
> 发布页同时提供一键安装器、便携版和 `SHA256SUMS.txt`。

当前版本：`0.4.0-beta.1`。Codex 桌面通知仍是 Beta；在更多真实桌面任务完成验收前，不视为正式稳定功能。

## 选择下载版本

| 文件 | 适合谁 | 行为 |
| --- | --- | --- |
| `Remielle-Setup-0.4.0-beta.1.exe`（蕾米埃尔一键安装器） | 希望一键安装的用户 | 安装到当前用户，创建桌面和开始菜单快捷方式，安装后启动，可从 Windows 设置卸载 |
| `Remielle-Portable-0.4.0-beta.1.exe`（蕾米埃尔便携版） | 希望免安装或放在 U 盘的用户 | 单文件直接运行，不创建卸载入口 |
| `SHA256SUMS.txt` | 所有用户 | 用于核对下载文件是否完整 |

本项目暂未购买 Windows 代码签名证书。Windows SmartScreen 可能显示“未知发布者”；请只从本仓库 Release 下载，并先核对 SHA-256，不要从不明镜像运行。

## 首次运行

首次运行以本机尚无有效 `position.json` 为准。原生向导提供两个选项：

1. **一键启用 Codex 通知**：安装或修复蕾米埃尔自己的 Hook，不覆盖其他 Hook。
2. **暂不启用**：直接进入普通桌宠，之后仍可从托盘的“Codex 通知”启用。

选择启用后，必须：

1. 完全退出 Codex 桌面应用，包括后台进程。
2. 重新打开 Codex。
3. 在 Codex CLI 输入 `/hooks`，审核并信任“蕾米埃尔桌宠通知”。

非托管 Hook 会运行本机命令，Codex 不会替你自动信任；请阅读本仓库的 `src/codex-hook.js` 后自行决定。Hook 官方说明见 [OpenAI Hooks 文档](https://learn.chatgpt.com/docs/hooks)。

## 使用方法

- 单击人物：待机时播放约 3 秒点击动作，同时查询 Codex 剩余额度；其他动作播放时只查询额度。
- 拖动人物：待机开始拖动会播放拿起、保持和放下动作；其他人物动作期间仍可移动窗口，但不会覆盖当前动作。
- 右键人物：停止交互、人物翻转、信息方向、人物和信息窗口五档缩放、模拟消息、回到屏幕内。
- 右键托盘：显示/隐藏、停止交互、启用或停用 Codex 通知、退出。
- 气泡消息：每条显示 6 秒；会根据屏幕空间自动换边，鼠标可穿透透明区域。

额度查询会临时启动 PATH 中的 `codex.exe app-server`，只读取官方额度响应中的使用比例和重置时间；不会创建对话或读取认证文件。若 Codex CLI 不在 PATH 中，会显示暂时无法获取额度。

## 通知与隐私边界

Bridge v1 只允许固定事件和白名单字段进入本地 Named Pipe：

- 任务开始：最多 256 字符的规范化开头。
- 命令：仅保留允许的程序和安全子命令，如 `npm test`、`npm run build`、`git status`。
- 文件操作：只保留文件 basename，不传完整目录和补丁内容。
- 常见工具：映射为搜索、读取、测试、构建、修改、CodeGraph、OpenAI 文档、GitHub 或子智能体等类型。
- 审批：只传安全操作摘要。
- 结束：只传截断并规范化的最后回复摘要。

完整 `prompt`、`tool_input`、命令参数、工具输出、模型字段、transcript、认证数据和完整路径不会进入 Pipe。转发器只连接本机 Named Pipe，不开放网络端口；桌宠停止运行时会快速无操作退出。

本机配置位于 `%APPDATA%\蕾米埃尔\position.json`。蕾米埃尔安装的 Hook 转发器位于同一 Electron userData 目录；Codex Hook 配置位于 `%CODEX_HOME%\hooks.json`（未设置 `CODEX_HOME` 时通常在 `%USERPROFILE%\.codex`）。

## 校验 SHA-256

在下载目录打开 PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\Remielle-Setup-0.4.0-beta.1.exe'
Get-FileHash -Algorithm SHA256 -LiteralPath '.\Remielle-Portable-0.4.0-beta.1.exe'
```

结果应与同一 Release 中的 `SHA256SUMS.txt` 完全一致。

## 开发与构建

需要 Windows x64、Node.js 24 和 npm：

```powershell
npm ci
npm test
npm start
npm run build
```

`npm run build` 同时生成中文文件名的 NSIS 安装器和 Portable 单文件版。GitHub 会清理 Release 资产名中的非 ASCII 前缀，因此工作流上传等内容的 `Remielle-*` 副本，并保留中文显示标签；二进制内容不变。运行素材位于 `assets/processed/`，原始动作素材保留在 `动作视频/`，因此可以复现构建；不要重新编码或删除原始素材。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| Hook 已启用但没有通知 | 完全重启 Codex，再在 CLI 输入 `/hooks` 审核信任；“配置已写入”不代表当前任务已加载 |
| 只显示基础通知 | 从托盘执行“Codex 通知 → 启用/修复”，重启 Codex，让新版转发器生效；旧 Bridge 消息会继续显示通用文案 |
| 无法获取额度 | 确认 `codex.exe` 在 PATH 中且账号可用；失败提示会在 6 秒后消失 |
| 人物跑出屏幕 | 右键人物选择“回到屏幕内” |
| SmartScreen 拦截 | 从 GitHub Release 重新下载，核对 SHA-256；本项目不伪造数字签名 |
| 想完全停用通知 | 托盘选择“Codex 通知 → 停用”；只移除蕾米埃尔自己的 Hook |

## 许可证

本仓库中的代码、角色图片和动作素材统一采用 [MIT License](LICENSE)，版权归 `ch998244353`。提交问题请使用 [GitHub Issues](https://github.com/ch998244353/Remielle/issues)。
