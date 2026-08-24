# 蕾米埃尔桌宠：项目分析书与 Agent 交接

| 项目项 | 当前值 |
| --- | --- |
| 最后更新 | 2026-08-24 |
| 当前版本 | 0.4.0-beta.1 |
| 项目目录 | `<仓库根目录>` |
| 公开仓库 | `https://github.com/ch998244353/Remielle`（`main`） |
| 许可证 | MIT；代码与全部角色素材统一适用 |
| 技术栈 | Electron 43、原生 JavaScript、HTML/CSS、Node.js 内置模块 |
| 运行入口 | `package.json` → `src/main.js` |
| 当前构建物 | `dist/蕾米埃尔-Setup-0.4.0-beta.1.exe`、`dist/蕾米埃尔-Portable-0.4.0-beta.1.exe` |
| 自动测试 | 42/42 PASS（2026-08-24 重新验证） |
| 文档定位 | 唯一架构、接口、验证和交接事实源 |

下一位 Agent 不需要寻找旧设计书、旧验收截图或先前对话；先读本文，再用 CodeGraph 定位任务涉及的符号，最后只读取被点名的源码和测试。

## 1. 项目目标与真实边界

蕾米埃尔是一个开源的 Windows x64 Electron 桌宠。人物动作、任意时刻拖动、气泡、托盘、独立缩放和外观已经完成；0.3.0 增加了单击额度查询、无闪媒体切换和按下时状态决定的拖动动作锁；0.4.0 Beta 缩短气泡到头部的距离、增加安全通知摘要和首次运行向导，并同时发行 NSIS 与 Portable。

| 能力或边界 | 当前设计 |
| --- | --- |
| 桌宠交互 | 待机、单击、消息、拖动拿起/保持/放下；物理拖动始终可用 |
| 外观 | 人物与气泡独立五档缩放、人物镜像、气泡左右偏好、多屏约束 |
| Codex 通知 | 用户主动安装并审核信任的四类 lifecycle Hook，经隐藏 PowerShell 清洗和本机 Named Pipe 传入 |
| Codex 额度 | 单击时临时启动 PATH 中的 `codex.exe app-server`，只调用 `account/rateLimits/read` |
| 非聊天客户端 | 没有输入框、历史面板、计划面板或审批按钮 |
| 隐私边界 | 只从 Hook 输入生成任务开头与安全操作摘要；不把完整提示词、完整工具输入、命令参数、工具输出、完整路径、模型、认证信息或 transcript 送入 Pipe |
| 审批边界 | 不自动允许或拒绝权限；审批仍在 Codex 原界面完成 |
| App Server 边界 | 不创建、恢复或读取 Thread/Turn；成功、失败或 8 秒超时后终止临时进程 |
| Hook 适用范围 | 用户级 Hook 也可能接收 CLI/IDE 任务事件，不保证只来自桌面 UI |
| 当前任务定义 | 最近产生合法 Hook 事件的 `sessionId`，不是视觉上的前台窗口 |
| 明确不伪造 | Hosted WebSearch、完整计划、流式思考、精确失败或中断原因 |

官方资料：

- Hooks：<https://learn.chatgpt.com/docs/hooks>
- Hook 审核与信任：<https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks>
- Codex App Server：<https://learn.chatgpt.com/docs/app-server>
- Codex 术语表：<https://learn.chatgpt.com/docs/glossary>

## 2. 当前交付状态

| 交付项 | 状态 | 事实 |
| --- | --- | --- |
| 技术实现 | 完成 | Electron 原生 JavaScript；无前端框架、网络服务或新增运行时依赖 |
| 窗口 | 完成 | 人物与气泡均为无边框透明窗口，`skipTaskbar: true`；气泡使用 `screen-saver` 置顶层级并保持鼠标穿透 |
| 菜单 | 完成 | 托盘保留安全入口；人物右键承载外观、缩放、模拟消息与回屏 |
| 拖动动作锁 | 完成 | 物理拖动始终可用；只有待机起始手势进入拿起、保持、放下 |
| 非待机互斥 | 完成 | 锁定期间消息只更新 6 秒气泡，不覆盖、重启或补播人物动作 |
| 媒体切换 | 完成 | 目标首帧或图片绘制就绪后原子切换；过期回调无效；不交叉淡化 |
| 单击动作 | 完成 | 2 倍速播放，约 3.02 秒 |
| 气泡 | 完成 | 独立五档缩放；消息、额度和失败提示最后一次显示后 6000ms 隐藏 |
| 气泡到头部距离 | 完成 | 气泡与头部分处人物两端时内移人物宽度四分之一；同侧仍保持 4 DIP 边界间隔 |
| 额度查询 | 完成 | 待机单击同时播放动作并查询；非待机单击只查询；并发复用 |
| Codex 通知链路 | 已实现 | Hook 安装/卸载、备份、转发、Pipe、清洗、双槽调度和渲染均已实现 |
| 安全通知摘要 | 已实现 | Bridge v1 可选 `detailText`；任务开头、安全命令、basename、审批和结束摘要均由 PowerShell 在 Pipe 前生成 |
| 首次运行向导 | 已实现 | 无有效 `position.json` 时原生选择启用或跳过；结束即保存位置；启用后要求完全重启并在 `/hooks` 审核信任 |
| 自动测试 | 通过 | `npm test`：42/42 PASS |
| 本地构建 | 通过 | NSIS 与 Portable 均已生成，ASAR 内容边界已复核；GitHub Release 下载复核尚未完成 |
| 桌面快捷方式 | 待切换 | 新 Release 下载复核后切换到 0.4.0 Beta，再将旧 0.3.0 移入回收站 |
| 开发态实机 | 通过 | 2026-08-24 已验证拖动锁、消息、点击、取消、位置保存、额度、菜单、缩放和计时 |

| 正式验收事实 | 状态 |
| --- | --- |
| 2026-08-23 桌面 app-server 17:14 已启动，Hook 21:55 才写入，旧任务未执行新增 Hook | 已定位 |
| `~/.codex/hooks.json` 有效，Hook 为 `[x]`、`Trust: Trusted` | 已确认 |
| 普通 Codex CLI 的真实 `UserPromptSubmit` 会运行 Hook | 已确认 |
| 桌面安装包内置 `codex.exe 0.149.0-alpha.4.1` 的新进程会运行同一 Hook | 已确认 |
| Hook → PowerShell → Named Pipe → 桌宠消息窗口 | 已确认 |
| 完全退出并重开 Codex 桌面应用后，在真实桌面任务中收到通知 | 待用户确认 |
| 生命周期通知总体验收 | `PARTIAL`，不得写正式完成 |

官方文档明确要求非托管 Hook 按当前定义哈希审核并信任，但没有明确承诺 `hooks.json` 会被已运行的桌面任务热加载。“完全退出并重开”是基于本机启动时间、配置写入时间和新进程对照实验得到的诊断结论。

## 3. 架构分层、职责与关键流程

| 层或组件 | 主要职责 | 输入 | 输出或副作用 | 所有者 |
| --- | --- | --- | --- | --- |
| Electron 主进程 | 单实例、窗口、菜单、托盘、IPC、拖动、气泡、持久化、Codex 生命周期 | renderer IPC、Hook Pipe、用户菜单、屏幕变化 | 移动窗口、保存配置、推送消息、启动/终止临时子进程 | `src/main.js` |
| 人物 preload | renderer 的唯一窄能力门面 | 经过类型检查的参数和回调 | 固定 IPC；不暴露 Node、文件或进程能力 | `src/preload.js` |
| 人物 renderer | DOM 指针事件、状态机驱动、媒体切换、通知回执 | 指针、主进程事件 | 状态事件、拖动 IPC、气泡请求 | `src/renderer/*` |
| 纯领域层 | 人物状态与屏幕几何，不依赖 Electron | 状态事件、尺寸、坐标和工作区 | 新状态、规范化文本、受限坐标 | `src/domain/*` |
| 气泡窗口 | 安全显示文本与实际左右落点 | `bubble:update` | 文本 DOM 和尾巴方向 | `src/bubble/*`、`src/bubble-preload.js` |
| 媒体控制器 | 保留旧画面直到目标首帧/图片就绪 | 人物状态 | 原子媒体可见性切换 | `src/renderer/media-controller.js` |
| Hook 配置层 | 安装、修复、卸载和备份用户 Hook | 用户菜单、`hooks.json` | 原子更新配置和转发脚本 | `src/codex-hook.js` |
| Hook 运行桥 | 白名单提取并快速写入本机 Pipe | Codex lifecycle JSON | 单行 UTF-8 JSON；失败时快速无操作退出 | 自动生成 PowerShell + `src/codex-notifications.js` |
| 通知协调器 | 校验、映射、节流、双槽与会话切换 | 合法 Pipe 消息和 renderer 回执 | 有界桌宠通知 | `src/codex-notifications.js` |
| 额度客户端 | 临时 App Server JSONL 握手与格式化 | renderer 单击 | 一条额度/失败气泡，随后终止子进程 | `src/codex-rate-limit.js` |
| 配置存储 | 兼容读取和串行原子保存 | 位置和视觉偏好 | Electron userData 下的 `position.json` | `src/position-store.js` |
| 首次运行协调 | 以有效配置是否存在为唯一判断，串联选择、启用结果与位置保存 | `savedPosition` 与注入回调 | 只首轮显示；不增加配置版本或状态文件 | `src/first-run.js`、`src/main.js` |
| 构建与发布层 | 测试、素材校验、NSIS/Portable 打包、标签自动 Release | 源码、处理后素材、锁文件、Git 标签 | 两个 EXE、`SHA256SUMS.txt` 与 Pre-release/Release | `package.json`、`scripts/*`、`.github/workflows/release.yml` |

| 关键流程 | 入口 | 核心路径 | 完成条件 |
| --- | --- | --- | --- |
| 应用启动 | 快捷方式、安装版或 Portable | `main.js` → 配置 → 双窗口/托盘 → Hook/Pipe → 首次向导 → renderer | 待机媒体可播放后显示人物；首次向导结束即保存位置 |
| 拖动 | `pointerdown/move/up/cancel` | renderer → 状态机 → preload → main → 几何约束 → 持久化 | 松手立即保存；人物动作按资格锁运行 |
| 本地消息 | 人物菜单 | main → `message:local` → `showMessage()` → 气泡/可选人物动作 | 气泡显示并重置 6 秒计时 |
| Codex 通知 | lifecycle Hook | PowerShell → Named Pipe → 校验/调度 → renderer → 回执 | 当前槽收到回执，协调器继续派发 |
| 额度查询 | 单击人物 | renderer → `codex:rate-limit` → App Server JSONL → 气泡 | 返回格式化结果或统一失败文案并清理进程 |
| Hook 安装 | 托盘菜单 | main → 配置校验/备份 → 原子写入 → 启动 Pipe | 文件状态符合当前 handler；不等于当前任务已加载 |
| 发布 | `v*` 标签或本地 `npm run build` | `npm ci` → 测试 → electron-builder → ASAR/哈希检查 → GitHub Release | Beta 标签为 Pre-release；稳定标签为正式 Release |

## 4. 程序启动流程

```text
桌面快捷方式 / 安装版 / Portable EXE
  → package.json: main = src/main.js
  → requestSingleInstanceLock()
  → bootstrap()
  → 读取 Electron userData 与 CODEX_HOME
  → 加载 position.json 和视觉偏好
  → 创建人物窗口、气泡窗口、托盘
  → 检查 Hook 配置
  → Hook 已配置时启动 Named Pipe
  → 没有有效 position.json 时显示首次运行向导并保存当前位置
  → renderer 待机视频可播放后显示人物
```

关键行为：

- 第二次启动不会创建第二只桌宠，只会把已有角色恢复到屏幕内并显示。
- 人物窗口基准内容尺寸为 432×300 DIP；气泡为 328×160 DIP，二者分别按自己的五档缩放值计算。
- 启动时 `停止交互` 总是关闭；位置、人物缩放、气泡缩放、镜像和气泡优先侧从 `position.json` 恢复。
- 有效 `position.json` 是首次向导的唯一跳过条件；不增加 onboarding 字段或单独状态文件。
- 显示器移除或分辨率变化时，人物会重新限制到可见工作区并保存位置。

## 5. 人物交互与渲染流程

```text
pointerdown / move / up / cancel
  → renderer.js
  → pet-machine.js 动作状态与独立拖动手势
  → preload.js 的窄 IPC
  → main.js 使用 Electron screen 计算绝对拖动位置
  → window-geometry.js 限制到当前显示器工作区
  → 松手立即由 position-store.js 原子保存
```

人物状态：

- `idle`：呼吸循环。
- `click`：待机时在 6 DIP 内松手触发，视频以 2 倍速播放。
- `message`：收到本地或 Codex 消息。
- `dragPickup`：从待机开始的手势超过 6 DIP 后播放拿起。
- `dragHold`：拿起结束且仍按住时显示静态保持帧。
- `dragRelease`：正常松手、取消或停止交互后播放放下，结束回到待机。

| 当前状态 | 进入条件 | 期间规则 | 退出条件与下一状态 |
| --- | --- | --- | --- |
| `idle` | 启动完成或任一动作正常结束 | 循环播放；允许单击、消息动画和待机起始拖动资格 | 合法单击 → `click`；消息 → `message`；合格拖动 → `dragPickup` |
| `click` | 从 `idle` 按下，移动不超过 6 DIP 后松手 | 2 倍速播放；消息只更新气泡；拖动只移动窗口 | 媒体结束 → `idle` |
| `message` | `idle` 收到合法本地或 Codex 消息 | 当前动作锁定；后续消息只更新气泡 | 媒体结束 → `idle` |
| `dragPickup` | 从 `idle` 按下并超过 6 DIP，越界时仍为 `idle` | 物理拖动同步进行；消息只更新气泡 | 媒体结束且仍按住 → `dragHold`；松手/取消/停止交互 → `dragRelease` |
| `dragHold` | `dragPickup` 播放结束且仍按住 | 显示静态保持帧；物理拖动继续 | 松手、取消或停止交互 → `dragRelease` |
| `dragRelease` | 合格拖动松手、取消或停止交互 | 播放放下；位置在进入前已立即保存 | 媒体结束 → `idle` |

| 状态机输入 | 参数 | 作用 | 关键返回或约束 |
| --- | --- | --- | --- |
| `pointerDown` | 无 | 锁定本次手势的单击与拖动动画资格 | 资格只由按下瞬间状态决定 |
| `pointerMove` | `{ dx, dy }` | 使用 `Math.hypot(dx, dy) > 6` 判定拖动 | 精确保留 6 DIP 内单击阈值 |
| `pointerUp` | 无 | 结束手势；按资格进入 `click` 或 `dragRelease` | renderer 始终立即发送 `drag:end` |
| `pointerCancel` | 无 | 取消手势；合格拖动安全进入放下 | 不触发额度查询 |
| `mediaEnded` | 无 | 推进当前人物动作 | 只处理与当前可见媒体一致的结束事件 |
| `showMessage(input)` | 任意输入 | 校验、合并空白、按 Unicode code point 限制 50 字 | `{ accepted, text?, animate?, reason? }`；只有当前 `idle` 时 `animate=true` |
| `getSnapshot()` | 无 | 提供 renderer 所需最小状态 | `{ state, dragging }` |

按下瞬间记录整次手势是否有资格播放拖动动作。只有按下时为 `idle`，并且越过阈值时仍为 `idle`，才进入 `dragPickup`；非待机按下后即使原动作提前结束，本次手势也不会中途补播拿起。点击或消息动作期间拖动时，原动作照常播放，结束后即使仍在拖动也直接回待机；松手不播放放下。所有拖动松手都立即结束主进程拖动并保存位置，不等待放下视频。

媒体切换由 `media-controller.js` 统一处理视频和静态保持帧。除首次待机显示外，旧媒体保持当前最后画面；目标视频提交首帧或保持图片完成加载并进入下一绘制帧后再一次性切换可见性。每次切换递增序号，因此快速状态变化产生的旧回调不能覆盖新状态；不做交叉淡化。

锁定交互时人物窗口鼠标穿透。若锁定发生在待机起始的拖动中，renderer 会发送 `pointerCancel`、进入 `dragRelease` 并立即结束主进程拖动会话；未移动手势和从非待机开始的拖动不额外触发放下。取消手势不查询额度。

## 6. 接口契约与信任边界

运行时没有对外网络 API。所谓“接口”是 context-isolated preload 门面、Electron IPC、纯模块函数、Named Pipe 消息和本地配置；renderer 不直接获得 Node.js、文件系统、认证文件或子进程能力。

### 人物 preload：`globalThis.petApi`

| 方法 | 对应 IPC | 参数 / 返回值 | 校验与用途 |
| --- | --- | --- | --- |
| `startDrag(x, y)` | `drag:start` → main | 两个有限数值；无返回 | preload 和 main 双重校验坐标；main 还校验发送者及交互锁 |
| `moveDrag()` | `drag:move` → main | 无参数；无返回 | main 校验人物 webContents 和有效拖动会话，位置取 Electron 当前绝对光标 |
| `endDrag()` | `drag:end` → main | 无参数；无返回 | main 校验发送者；仅实际移动后原子保存位置 |
| `requestCodexRateLimit()` | `codex:rate-limit` ⇄ main | `Promise<string>` | main 校验发送者；并发复用；成功或统一失败文案均返回字符串并显示气泡 |
| `showBubble(text)` | `bubble:show` → main | 字符串；无返回 | preload 校验类型；main 要求非空且最多 50 code points |
| `hideBubble()` | `bubble:hide` → main | 无参数；无返回 | main 校验发送者并清理计时器 |
| `reportNotification(id, status)` | `codex:notification-result` → main | `id` 最多 64 字符；`status` 为 `accepted/busy/empty` | preload 白名单校验；协调器据此确认当前通知 |
| `notifyIdle()` | `character:idle` → main | 无参数；无返回 | main 校验发送者；兼容协调器 idle 通知，不作为消息派发门禁 |
| `onNotification(callback)` | `codex:notification` ← main | 回调接收 `{ id, text }`；返回取消订阅函数 | 非函数返回空取消函数；renderer 再校验字段类型 |
| `onAppearance(callback)` | `character:appearance` ← main | 回调接收 `{ mirrored }`；返回取消订阅函数 | renderer 只接受严格布尔镜像语义 |
| `onInteractionLocked(callback)` | `character:interaction-locked` ← main | 回调接收布尔值；返回取消订阅函数 | preload 将非 `true` 归一为 `false` |
| `onMessage(callback)` | `message:local` ← main | 回调接收文本；返回取消订阅函数 | 本地模拟消息入口，仍经过状态机文本边界 |

人物 preload 还会在待机媒体达到可播放状态后自动发送一次 `character:ready`。主进程收到后才同步外观、鼠标穿透状态并显示人物窗口；这不是 renderer 可任意调用的 `petApi` 方法。

### 气泡 preload：`globalThis.bubbleApi`

| 方法 | 对应 IPC | 参数 / 返回值 | 校验与用途 |
| --- | --- | --- | --- |
| `onUpdate(callback)` | `bubble:update` ← main | 回调接收 `{ text, side }`；返回取消订阅函数 | 只接受字符串文本以及 `left/right`；气泡 renderer 只写 `textContent` 和 `dataset.side` |

### IPC 通道总表

| 通道 | 方向 | 载荷或返回 | 主进程行为 |
| --- | --- | --- | --- |
| `drag:start` | 人物 → main | `{ x, y }` | 建立以指针与窗口起点组成的拖动会话 |
| `drag:move` | 人物 → main | 无 | 按当前光标和显示器工作区移动窗口、同步气泡 |
| `drag:end` | 人物 → main | 无 | 结束会话；实际移动时立即保存 |
| `bubble:show` | 人物 → main | 文本 | 显示气泡并重置 6000ms 计时器 |
| `bubble:hide` | 人物 → main | 无 | 清理计时器并隐藏气泡 |
| `codex:rate-limit` | 人物 ⇄ main | `Promise<string>` | 查询或复用额度请求，显示并返回结果 |
| `codex:notification-result` | 人物 → main | `{ id, status }` | 确认协调器当前通知并继续派发 |
| `character:idle` | 人物 → main | 无 | 通知协调器人物处于待机；当前实现不依赖它排队 |
| `character:ready` | preload → main | 无 | 首次显示人物并发送设置 |
| `codex:notification` | main → 人物 | `{ id, text }` | 派发 Codex 生命周期短通知 |
| `character:appearance` | main → 人物 | `{ mirrored }` | 同步全部人物媒体镜像 |
| `character:interaction-locked` | main → 人物 | 布尔值 | 同步鼠标穿透；必要时取消当前手势 |
| `message:local` | main → 人物 | 文本 | 模拟消息，renderer 决定是否播放人物消息动作 |
| `bubble:update` | main → 气泡 | `{ text, side }` | 更新安全文本和实际尾巴方向 |

### Named Pipe 桥接协议

| 字段 | 必需 | 约束 | 用途 |
| --- | --- | --- | --- |
| `version` | 是 | 当前协议版本 | 拒绝未知协议 |
| `sessionId` | 是 | 非空、受限长度字符串 | 识别最近活动任务并切换双槽 |
| `turnId` | 是 | 非空、受限长度字符串 | 标识当前 turn |
| `event` | 是 | `UserPromptSubmit/PreToolUse/PermissionRequest/Stop` | 映射桌宠短消息 |
| `toolName` | 否 | 受限长度字符串 | `PreToolUse` 的通用工具类别文案 |
| `detailText` | 否 | 最多 256 UTF-16 code units | PowerShell 在 Pipe 前生成的任务预览或安全操作摘要；旧 Bridge 可缺失 |
| `finalText` | 否 | 当前转发器最多 256 字符；解析上限 2048 | `Stop` 的规范化最后回复摘要，最终仍限 50 code points |
| `sentAt` | 是 | 合法时间值 | 事件时间信息 |

每条 Pipe 消息是单行 UTF-8 JSON，总长度不超过 8192 bytes。未知字段、未知事件、坏 JSON、空 ID、超长字段和无换行超长残留都会被丢弃；消息内容不会被当作命令执行。

### Codex App Server JSONL

| 顺序 | 请求或响应 | 只使用的内容 | 处理 |
| --- | --- | --- | --- |
| 1 | `initialize`，`id: 0` | 固定 `clientInfo` | 启动握手 |
| 2 | `id: 0` 响应 | 只检查成功或错误 | 成功后发送 `initialized` |
| 3 | `account/rateLimits/read`，`id: 1` | 无业务参数 | 请求当前账户额度 |
| 4 | `id: 1` 响应 | `rateLimits.primary.usedPercent`、`resetsAt` | 校验、限制 0–100、按本地时区格式化 |
| 任意 | 无关通知 | 不读取业务内容 | 忽略 |
| 完成/失败 | 进程生命周期 | 无 | 关闭 readline/stdin，移除监听并终止子进程 |

## 7. 气泡、缩放和外观

- 气泡优先侧保存在 `bubbleSide`，取值 `left` 或 `right`；优先侧空间不足时自动换边。
- `placeBubble()` 同时接收 `mirrored`。气泡与头部在人物窗口同侧时保持原 4 DIP 边界间隔；分处两端时向人物内侧移动人物宽度四分之一。432 DIP 基准宽度时内移 108 DIP，头部距离约从 220 DIP 缩短为 110 DIP（96 DPI 下约 2.9 厘米）。
- 气泡尾巴由实际落点决定，不机械跟随偏好值。
- 人物缩放档位：`0.5 / 0.75 / 1 / 1.25 / 1.5`。
- 气泡缩放档位独立保存在 `bubbleScale`：`0.5 / 0.75 / 1 / 1.25 / 1.5`；旧配置缺失时默认为 `1`。
- 人物缩放以人物脚底中心为锚点，然后校正到屏幕内；气泡缩放同步改变窗口、白色气泡、尾巴和文字，并重新计算左右落点与屏幕边界。
- 镜像作用于全部人物视频和拖动保持图片，不镜像气泡。
- 自动换边、五档缩放、工作区限制和尾巴方向仍按最终落点计算；气泡窗口保持鼠标穿透，透明重叠区域不阻挡拖动。
- 气泡在 Windows 上使用 Electron `screen-saver` always-on-top 层级，高于普通网页和普通置顶窗口；它不可聚焦，不抢走当前输入焦点。
- 消息先合并空白，再限制为最多 50 个 Unicode code points；超长文本以省略号结束。
- 每次显示消息、额度或失败提示都会重置一个 6000ms 计时器；到期、手动隐藏和退出都会清理计时器并隐藏窗口。

### 单击额度查询

```text
renderer 单击
  → preload: requestCodexRateLimit()
  → main 复用当前进行中请求，或临时启动 codex.exe app-server
  → initialize → initialized → account/rateLimits/read
  → 只读取 rateLimits.primary.usedPercent 与 resetsAt
  → 本地时区格式化并显示 6 秒
  → 成功、失败、超时或退出时终止子进程
```

剩余比例按 `100 - usedPercent` 计算并限制到 0–100，文案为 `Codex 剩余 76%，8月30日 02:13 重置`。协议行解析会忽略无关通知；坏响应、进程错误和 8 秒超时统一显示 `暂时无法获取 Codex 剩余额度`。该流程不开放端口，不读取 Codex 对话、认证文件或模型内容，也不依赖 Hook 是否启用。

## 8. Codex 接入：安装阶段

真正首次运行（`loadPosition()` 返回 `null`）先显示 Electron 原生向导：“一键启用 Codex 通知”复用下面的安装/修复流程；“暂不启用”直接进入普通桌宠。启用成功后原生对话框明确要求完全重启 Codex，并在 Codex CLI 使用 `/hooks` 审核信任；启用失败显示错误并允许之后从托盘重试。无论选择、成功或失败，向导结束都立刻用现有原子保存逻辑写入当前位置，因此有效配置的升级用户不会重复看到向导。

用户在 Windows 通知区域找到蕾米埃尔小图标，右键选择：

```text
Codex 通知 → 启用/修复
```

执行顺序：

1. `main.js` 调用 `installCodexHooks()`。
2. `codex-hook.js` 定位用户级 `CODEX_HOME/hooks.json`；未设置 `CODEX_HOME` 时使用 `%USERPROFILE%\.codex\hooks.json`。
3. 先解析并验证已有 JSON。JSON 无效时拒绝覆盖。
4. 删除旧的蕾米埃尔 handler，再为四个事件各写入一个当前 handler，保证幂等。
5. 若要修改已有 `hooks.json`，先在同目录创建带时间戳和 UUID 的备份。
6. 在 Electron `userData` 中原子写入 `codex-hook-forwarder.ps1`。
7. 启动本机 Named Pipe 服务。
8. 托盘中的“已配置”只表示文件和脚本符合预期，不代表当前 Codex 进程已加载，也不代表信任状态可由桌宠自行判断。

四个 Hook 都是：

- `type: command`
- `async: true`
- `timeout: 2`
- Windows 命令使用 `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden`
- 状态标记：`蕾米埃尔桌宠 Codex 通知`

停用时只移除带上述标记的 handler 和蕾米埃尔转发脚本，保留其他用户 Hook；修改已有配置前同样备份。

## 9. Codex 接入：运行阶段

```text
Codex lifecycle event
  → 隐藏 PowerShell 从 stdin 读取事件 JSON
  → 只提取允许字段并限制长度
  → 连接 \\.\pipe\remiel-desktop-pet-codex-v1（150 ms）
  → 每条消息写成一行 UTF-8 JSON
  → codex-notifications.js 再次校验
  → 通知映射与双槽调度
  → main.js 发送 codex:notification
  → renderer.js 调用 showMessage()
  → 返回 accepted + animate；锁定时 animate=false
  → renderer 回传 accepted / empty
  → 气泡窗口显示文本
```

桥接消息唯一允许字段：

```text
version, sessionId, turnId, event, toolName?, detailText?, finalText?, sentAt
```

PowerShell 只保留规范化的任务开头、安全命令程序/子命令、文件 basename、常见工具类别、审批摘要和截断的最后回复摘要。明确禁止把完整提示词、完整 `tool_input`、命令参数、补丁/文件内容、工具输出、完整路径、模型字段、transcript、账户和认证数据送入 Pipe。总消息不超过 8192 bytes；未知字段、未知事件、坏 JSON、空 ID、超长字段直接丢弃且不执行任何内容。桌宠未运行时 PowerShell 最多尝试连接 150 ms，然后输出空对象并以 0 退出，不阻塞或改变 Codex。

通知映射：

| Hook | 桌宠消息 |
| --- | --- |
| `UserPromptSubmit` | 优先显示 `新任务：` 加规范化任务开头；旧消息回退 `Codex 开始处理任务` |
| `PreToolUse` | 优先显示安全 `detailText`：命令、搜索、读取、测试、构建、修改、CodeGraph、OpenAI 文档、GitHub、子智能体等；旧消息按 `toolName` 回退 |
| `PermissionRequest` | 优先显示 `等待确认：` 加安全操作摘要；旧消息回退 `Codex 正在等待你的确认` |
| `Stop` | `Codex 已结束：` 加最后回复摘要；没有摘要时只显示结束 |

调度规则：

- 普通进度最多每 3 秒展示一次。
- 队列只有一个 `ordinary` 槽和一个 `critical` 槽；新消息覆盖同槽旧消息，不建立无界队列。
- `critical` 优先于 `ordinary`。
- 人物动作忙碌不会阻止通知派发；renderer 按接收瞬间状态决定播放消息动作或只更新气泡，当前回执后立即尝试下一个槽位。
- 新 `sessionId` 到来时视为最近活动任务，清空上一任务未展示的两个槽。

## 10. `/hooks` 为什么看不到蕾米埃尔图标

`/hooks` 是 Codex CLI 的 Hook 管理界面，不是桌面宠物的聊天入口，也不是插件商店。

第一层只列事件名称、Installed 和 Active 数量，因此不会出现蕾米埃尔图标或名字。正确检查方式：

1. 在终端启动 `codex`。
2. 输入 `/hooks`。
3. 用方向键选中 `PreToolUse` 或 `UserPromptSubmit`，按 Enter。
4. 第二层会显示 `Hook 1`，应看到：
   - `[x]`
   - `Source: User config - ~\.codex\hooks.json`
   - 命令路径包含 `蕾米埃尔\codex-hook-forwarder.ps1`
   - `Mode: Async`
   - `Trust: Trusted`
5. Esc 返回，使用 `/exit` 离开 CLI。日常对话仍在 Codex 桌面应用中进行。

官方规则是：非托管 command Hook 在运行前必须按 Hook 定义的当前哈希审核并信任；Hook 有任何变更都可能需要重新审核。

## 11. 桌面端首次启用与故障排查

首次启用后：

1. 保持桌宠运行。
2. 在 Codex 桌面应用中按 `Ctrl+Q` 完全退出应用；不要只关闭当前标签。
3. 重新打开 Codex 桌面应用。
4. 第一次验收优先创建新的本地任务，发送“测试桌宠通知”。
5. 观察开始、工具、等待确认和结束通知。

如果仍无通知，按以下顺序排查，不要立刻改架构：

1. 托盘 `Codex 通知` 状态是否为“配置已写入”；若为“需要修复”则点“启用/修复”。
2. `/hooks` 第二层的脚本路径、`[x]` 和 `Trust: Trusted` 是否正确。
3. 当前是否为本机 Codex 任务；不要用云任务结果证明本地 Hook。
4. `~/.codex/hooks.json` 和 Electron userData 是否是当前进程实际使用的路径。
5. Named Pipe `\\.\pipe\remiel-desktop-pet-codex-v1` 是否存在。
6. 先用人物右键菜单“模拟收到消息”区分渲染问题和 Hook 问题。
7. 再用真实新 Codex 进程触发 `UserPromptSubmit`；不要只伪造 JSON 就宣称 Codex 接入成功。
8. 只有新进程真实 Hook 可用、桌面 GUI 不可用时，才调查桌面 app-server 的配置加载和任务来源。

禁止采用的“修复”：

- 不轮询或解析 Codex transcript、rollout、日志数据库来读取聊天内容。
- 不截屏识别当前 Codex 窗口。
- 不开放 TCP 端口。
- 不用独立 App Server 创建另一个 Thread 后冒充桌面当前任务。
- 不绕过 Hook 信任，不自动审批。

## 12. 持久化和机器外部文件

`position.json` 位于 Electron userData，默认通常为：

```text
%APPDATA%\蕾米埃尔\position.json
```

结构：

```json
{
  "version": 1,
  "x": 100,
  "y": 100,
  "scale": 1,
  "bubbleScale": 1,
  "mirrored": false,
  "bubbleSide": "right"
}
```

缺失、损坏或越界字段分别回退到默认值；保存使用同目录临时文件加原子替换，并串行化同一路径的连续写入。

| 字段 | 类型 / 合法值 | 缺失或损坏时 | 所有者 |
| --- | --- | --- | --- |
| `version` | 当前为整数 `1` | 按兼容读取，不用它绕过字段校验 | `position-store.js` |
| `x` | 有限数值 | 使用主进程传入的可见默认位置 | 主进程拖动与屏幕恢复 |
| `y` | 有限数值 | 使用主进程传入的可见默认位置 | 主进程拖动与屏幕恢复 |
| `scale` | `0.5/0.75/1/1.25/1.5` | `1` | 人物缩放 |
| `bubbleScale` | `0.5/0.75/1/1.25/1.5` | `1`，兼容 0.2.0 以前配置 | 气泡独立缩放 |
| `mirrored` | 布尔值 | `false` | 全部人物媒体镜像 |
| `bubbleSide` | `left/right` | `right` | 气泡优先侧；实际落点仍可自动换边 |

项目目录之外的接入文件：

| 路径 | 用途 |
| --- | --- |
| `%CODEX_HOME%\hooks.json`；未设置时通常为 `%USERPROFILE%\.codex\hooks.json` | 用户级 Codex Hook 配置；可能还包含其他用户 Hook |
| `%APPDATA%\蕾米埃尔\codex-hook-forwarder.ps1` | 自动生成的隐藏转发器 |
| `%APPDATA%\蕾米埃尔\position.json` | 桌宠位置和视觉偏好，也是首次运行判断依据 |
| `%USERPROFILE%\Desktop\蕾米埃尔.lnk` | NSIS 安装版或当前正式验证版本的启动快捷方式 |

任何 Agent 修改 `hooks.json` 时必须保留其他 handler；文件非法时不得覆盖。不要把这些机器文件复制进项目或发布包。

## 13. 每个第一方文件的职责

### 根目录

| 文件 | 职责 |
| --- | --- |
| `AGENTS.md` | 下一位 Agent 的最短入口和不可破坏边界 |
| `README.md` | 面向下载用户的中文入口：下载、首次运行、隐私、菜单、SmartScreen、开发和排障 |
| `LICENSE` | MIT 许可证；覆盖仓库代码与角色素材 |
| `.gitattributes` | 文本换行与图片、视频、图标、EXE 二进制属性 |
| `.github/workflows/release.yml` | Windows + Node 24 自动测试、双目标构建、SHA-256 与 GitHub Release；Action 固定完整 SHA |
| `项目交接/蕾米埃尔桌宠-统一项目解析与Agent交接.md` | 唯一长期架构、运行、Codex 接入、验收和交接事实源 |
| `package.json` | 版本、Electron 主入口、测试/启动/构建命令和 electron-builder 发布清单 |
| `package-lock.json` | 锁定 Electron 与 electron-builder 的完整开发依赖版本；根版本应与 `package.json` 同步 |
| `.gitignore` | 排除依赖、CodeGraph 数据、验证产物和发布产物 |

### `src/`

| 文件 | 职责 |
| --- | --- |
| `src/main.js` | Electron 主进程总装配：单实例、两个窗口、托盘和人物菜单、IPC、拖动、气泡计时、额度请求编排、屏幕约束、偏好保存、Hook 状态和 Named Pipe 生命周期 |
| `src/first-run.js` | 首次运行协调：只以有效配置是否存在判断，确保选择、启用失败和结果提示后都保存位置；通过注入回调保持可测 |
| `src/codex-rate-limit.js` | 临时 App Server JSONL 客户端：初始化、额度读取、校验与本地时区格式化，以及成功/失败/超时/退出清理 |
| `src/codex-hook.js` | Hook 配置边界：解析校验、幂等安装、安全卸载、备份、原子写入、带 BOM 的隐藏 PowerShell 安全摘要转发器和状态检查 |
| `src/codex-notifications.js` | Pipe 输入边界：严格消息解析、可选 `detailText` 与旧消息回退、最近会话切换、双槽队列、3 秒节流、不依赖人物 idle 的派发和 Pipe 分帧服务器 |
| `src/position-store.js` | `position.json` 读取、人物与气泡独立五档缩放白名单、旧配置默认值、串行原子保存 |
| `src/preload.js` | 人物 renderer 的唯一窄 IPC 门面，包含 `requestCodexRateLimit(): Promise<string>`；不暴露 Node、文件、认证、Hook 配置或进程启动能力 |
| `src/bubble-preload.js` | 气泡 renderer 的只读更新 IPC，只允许合法文本和左右落点 |
| `src/domain/pet-machine.js` | 与 Electron 无关的纯状态机：待机/点击/消息/拿起/保持/放下、按下时资格锁、可中断物理拖动和 50 code point 文本规范化 |
| `src/domain/window-geometry.js` | 与 Electron 无关的纯几何：缩放尺寸、脚底中心锚定、拖动、多屏恢复、工作区限制，以及结合镜像/头部侧的气泡内移和换边 |
| `src/renderer/index.html` | 人物窗口 DOM、CSP 和待机/单击/消息/拿起/保持/放下六种人物媒体绑定 |
| `src/renderer/style.css` | 人物透明画布、状态显示和镜像样式 |
| `src/renderer/media-controller.js` | 视频首帧或静态图片绘制准备后原子切换、过期回调门禁和单击 2 倍速 |
| `src/renderer/renderer.js` | DOM 事件、动作锁与媒体控制器驱动、始终可用的物理拖动、单击额度请求、消息气泡和通知回执 |
| `src/bubble/index.html` | 独立气泡窗口 DOM、CSP 和窗口标题 |
| `src/bubble/style.css` | 气泡外观以及根据实际左右落点切换的尾巴 |
| `src/bubble/renderer.js` | 把主进程送来的文本和落点写入安全 DOM |

### `test/`

| 文件 | 高价值回归范围 |
| --- | --- |
| `test/pet-machine.test.js` | 待机拖动完整链路、非待机资格锁、提前结束、松手/取消、锁定消息、单击阈值和文本规范化 |
| `test/media-controller.test.js` | 视频首帧与静态保持帧前保留旧画面、过期切换无效和单击 2 倍速 |
| `test/window-geometry.test.js` | 镜像与信息方向四组合、头部内移、自动换边、五档缩放、脚底锚定、多屏恢复和拖动坐标 |
| `test/position-store.test.js` | 气泡五档缩放、旧配置兼容、损坏回退、原子保存和连续写入 |
| `test/codex-rate-limit.test.js` | App Server JSONL 初始化、额度解析和格式化、无关消息、坏响应、超时与进程清理 |
| `test/codex-hook.test.js` | Hook 幂等安装、备份、保留其他 Hook、非法 JSON、快速退出，以及真实 PowerShell 对任务预览、安全命令、basename、审批和敏感字段的 Pipe 边界 |
| `test/codex-notifications.test.js` | `detailText`/旧消息兼容、Pipe 分包、多消息、坏/超长载荷、50 字限制、锁定时派发、回执续发、双槽、节流和会话切换 |
| `test/first-run.test.js` | 临时 userData/CODEX_HOME 下的启用、跳过、失败、位置保存与已有配置不重复向导 |
| `test/renderer-contract.test.js` | 六种运行媒体与保持图片镜像、托盘/人物菜单、6000ms 气泡计时，以及额度窄 IPC 不泄露能力 |

### 素材与脚本

| 路径 | 职责 |
| --- | --- |
| `动作视频/打哈欠.mp4` | 单击动作原素材 |
| `动作视频/害羞.mp4` | 拖动拿起、保持和放下的共同原素材 |
| `动作视频/呼吸.mp4` | 待机循环原素材 |
| `动作视频/转头.mp4` | 收到消息动作原素材 |
| `动作视频/主视图.png` | 应用图标原素材 |
| `assets/processed/idle.webm` | 去绿幕、裁剪后的待机运行素材 |
| `assets/processed/click.webm` | 去绿幕、裁剪后的单击运行素材 |
| `assets/processed/message.webm` | 去绿幕、裁剪后的消息运行素材 |
| `assets/processed/drag-pickup.webm` | 从待机开始拖动时的拿起运行素材 |
| `assets/processed/drag-hold.png` | 拿起结束且仍按住时的静态保持帧 |
| `assets/processed/drag-release.webm` | 待机起始拖动正常松手或取消后的放下素材 |
| `assets/processed/app.ico` | 托盘和 EXE 图标 |
| `scripts/process-assets.ps1` | 校验原素材哈希后调用 FFmpeg 重新生成全部运行素材，再调用验证脚本 |
| `scripts/verify-assets.ps1` | 使用哈希与 ffprobe 验证素材集合、编码、尺寸、帧率、透明通道，并按需重建临时 `artifacts/` 证据 |

### 生成目录和发布物

| 路径 | 职责与处理规则 |
| --- | --- |
| `node_modules/` | npm 安装的第三方开发依赖；不进入 Agent 阅读范围，损坏时用锁文件重装 |
| `.codegraph/` | 生成的结构索引；用于导航，不手工编辑，不视为产品源码 |
| `dist/蕾米埃尔-Setup-0.4.0-beta.1.exe` | 当前本地 NSIS 单击安装器；当前用户安装、桌面/开始菜单快捷方式、卸载入口、安装后启动 |
| `dist/蕾米埃尔-Portable-0.4.0-beta.1.exe` | 当前本地免安装单文件版 |
| `dist/蕾米埃尔-Portable-0.3.0.exe` | 发布切换前的临时回滚基线；GitHub Release 下载复核后移入回收站 |
| `artifacts/` | 可再生成的临时素材验证输出；不是事实源，不提交 Git |
| `dist/win-unpacked/`、`dist/builder-debug.yml`、`dist/*.blockmap`、`dist/latest.yml` | electron-builder 可再生成中间物；ASAR 验证完成后清理，不提交 Git |

项目目录不再保留 0.1.0、0.2.0 发布包。0.3.0 只在 0.4.0 Beta 发布复核期间临时保留；切换成功后不再作为项目当前发布物。不要从回收站内容推断项目现状。

electron-builder 本地仍生成计划中的中文文件名。GitHub 会移除 Release 资产名的非 ASCII 前缀，因此自动发布先复制为 `Remielle-Setup-<version>.exe` 和 `Remielle-Portable-<version>.exe`，并为两个资产设置中文显示标签；二进制内容与中文本地构建物相同，`SHA256SUMS.txt` 使用实际可下载文件名。

## 14. 修改入口、开发、测试和发布步骤

### 修改入口速查表

| 修改目标 | 首要入口 | 必查协作边界 | 高价值验证 |
| --- | --- | --- | --- |
| 人物动作或拖动规则 | `src/domain/pet-machine.js` | `renderer.js` 只在状态真正变化时切媒体；按下瞬间资格不可漂移 | `pet-machine.test.js`、`renderer-contract.test.js` |
| 动作切换或播放速度 | `src/renderer/media-controller.js` | 旧画面必须保留到目标画面提交；过期回调不能生效 | `media-controller.test.js` |
| 人物媒体绑定或镜像 | `src/renderer/index.html`、`style.css` | 六种运行媒体都必须绑定并镜像，气泡不能被镜像 | `renderer-contract.test.js` |
| 位置、缩放或多屏 | `src/domain/window-geometry.js` | 人物脚底中心锚点；气泡同头侧 4 DIP、异头侧内移四分之一人物宽度；最终工作区限制 | `window-geometry.test.js` |
| 配置字段 | `src/position-store.js` | 白名单、旧配置默认值、同目录原子替换和连续写入串行化 | `position-store.test.js` |
| 菜单、托盘或窗口生命周期 | `src/main.js` | 托盘保留解锁兜底；人物菜单即时生成；窗口保持安全选项 | `renderer-contract.test.js` |
| 气泡显示或计时 | `src/main.js`、`src/bubble/*` | 文本只写 `textContent`；每次显示重置 6000ms；隐藏和退出清理计时器 | `renderer-contract.test.js`、`window-geometry.test.js` |
| 额度查询 | `src/codex-rate-limit.js` | preload 保持唯一窄接口；不创建 Thread/Turn；所有路径终止子进程 | `codex-rate-limit.test.js`、`renderer-contract.test.js` |
| 首次运行向导 | `src/first-run.js`、`src/main.js` | 只以有效 `position.json` 判断；不新增状态；三种结果都保存；信任仍由用户审核 | `first-run.test.js`、`renderer-contract.test.js` |
| Codex Hook 安装/摘要 | `src/codex-hook.js` | 非法 JSON 不覆盖；保留其他 handler；修改前备份；完整敏感输入不得进入 Pipe | `codex-hook.test.js` |
| Codex 通知协议或调度 | `src/codex-notifications.js` | Bridge v1 可选 `detailText`、旧消息兼容、8192 bytes、双槽、3 秒节流、最近会话 | `codex-notifications.test.js`、`codex-hook.test.js` |
| 素材处理 | `scripts/process-assets.ps1` | 只有用户明确要求才运行；不得删除或重编码原素材；先校验固定哈希 | `scripts/verify-assets.ps1` |
| 正式发布 | `package.json`、`.github/workflows/release.yml` | 版本与锁文件同步；Action 固定 SHA；最小 `contents: write`；Beta 标签必须 Pre-release | 完整 `npm test`、素材验证、ASAR、安装/Portable 启动、Release 回下载 SHA-256 |

下一位 Agent 的标准顺序：

1. 读根 `AGENTS.md` 和本文。
2. 运行 `codegraph status`；结构问题用 CodeGraph 定位，不递归扫依赖或二进制目录。
3. 运行 `npm test` 建立当前基线。
4. 只读取任务涉及的源码和对应测试。
5. 行为变更先补一个能失败的高价值测试，再做最小根因修改。
6. 运行聚焦测试，再运行完整 `npm test`。
7. 非发布任务到此停止；不要为了“完整”生成新规划、截图或安装包。
8. 发布任务才更新 `package.json` 与锁文件版本，然后运行 `npm run build`。
9. 构建前若当前 Portable 正在运行，Windows 会锁住目标 EXE；只退出蕾米埃尔桌宠，不要在 Agent 回复途中强制退出 Codex 桌面应用。
10. 构建后检查 ASAR 只包含 `src/**/*`、`assets/processed/**/*` 和 `package.json`，验证 NSIS 快捷方式/卸载入口和 Portable 启动并记录两个 EXE 哈希。
11. 标签工作流执行 `npm ci → npm test → npm run build`，使用 runner 自带 `gh` 和 `GH_TOKEN` 发布两个 EXE 与 `SHA256SUMS.txt`；带 `-` 的标签标记 Pre-release。
12. 从 GitHub Release 重新下载三个文件并复算哈希后，才更新本机快捷方式并移除旧版。
13. 发生架构、接口、路径、验收状态或发布物变化时，更新本文；不要新增平行文档。

常用命令：

```powershell
npm test
npm start
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\verify-assets.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\process-assets.ps1
```

`process-assets.ps1` 需要系统 PATH 中存在 `ffmpeg` 和 `ffprobe`，且原素材哈希必须完全匹配；除非用户明确要求重新处理人物素材，否则不要运行。

## 15. 安全与不可变基线

原素材 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `动作视频/打哈欠.mp4` | `B6494584B6734DE4B22349B6F7B5CB2F0C039046EC6398764D5E33CD71F80005` |
| `动作视频/害羞.mp4` | `D121E5CCCEB388038D187F6EC251FD1FD042E7B1DD10D3716100559EA04C2DDF` |
| `动作视频/呼吸.mp4` | `56DE1C3423F86794588FB7E09EE2ECD559C998416EF20981D67A5B50D3F023BE` |
| `动作视频/主视图.png` | `C84900094D5F8F8D84839E60D6A069DCD4B4F002B103599202135B98F6B813EB` |
| `动作视频/转头.mp4` | `0E37CC7939BD864520136C6AEAF252F8645119A2B3F23CB401B814AD3A9DDFE1` |

当前发布物：

| 文件 | SHA-256 |
| --- | --- |
| `dist/蕾米埃尔-Setup-0.4.0-beta.1.exe`（本地构建） | `335492D2BD45926195C3EF82453FD357AABB6B8487AE874BFE2B48DCEABEB5DD` |
| `dist/蕾米埃尔-Portable-0.4.0-beta.1.exe`（本地构建） | `6440013348C39B7660B76388AD911965B06DD99650AAF02B4DC0AF3AD4E05FF1` |
| `dist/蕾米埃尔-Portable-0.3.0.exe`（发布切换前临时保留） | `D2EA488C113A79C39EFA9EE77FC9AFFD040F8D7B61B17CA7380C310EBCF346E2` |

GitHub Actions 构建不保证与本机 Electron-builder 输出逐字节一致；Release 的公开权威哈希以同一 Release 附带并经回下载复核的 `SHA256SUMS.txt` 为准。任何素材或发布任务都应先复算相关哈希。不要把完整用户提示词、工具输入输出、认证数据、真实 hooks.json、Hook 备份、测试 userData 或本机日志打进 ASAR/EXE。

## 16. 交接结论

当前架构的最短正确理解是：

```text
安全的纯状态机和几何函数
  + Electron 两窗口/托盘外壳
  + 原生首次运行向导
  + 单击时临时只读额度的 App Server 客户端
  + 用户主动安装的 Codex Hook
  + 隐藏 PowerShell 安全摘要清洗器
  + 本机 Named Pipe
  + 有界通知调度
  + GitHub Actions 双目标预发布
```

额度查询已经通过真实 `codex.exe app-server` 成功路径验证，但它与生命周期 Hook 相互独立。生命周期通知下一步仍是让用户完全重启 Codex 桌面应用并做真实本地任务验收；只有该验收仍失败时，才根据第 11 节逐层定位。保留现有隐私边界，不用 transcript 轮询，也不用 App Server 创建 Thread 来冒充桌面当前任务。
