# 通用 Agent 项目模板

用于每个新 Git 项目的起点：复用 Agent 工作规则、项目资料、任务恢复方式，以及适配 R9700 的 Pi 配置。没有预设业务语言、框架、目录结构或包管理工具。

## 推荐：通过 GitHub Raw 配置当前 Git 工程

模板仓库：[suglow/pi-project-template](https://github.com/suglow/pi-project-template)。下方命令使用 `main`；也可以改成固定标签或提交 SHA。进入要配置的工程目录，无需克隆模板仓库。尚未建库时先执行 `git init -b main`。

Linux / macOS / WSL / Git Bash，可直接运行：

```bash
curl -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.sh | bash
```

也可以先下载，只有下载成功才执行；这能在下载失败时明确停止：

```bash
curl -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.sh -o "${TMPDIR:-/tmp}/pi-install-project.sh" && bash "${TMPDIR:-/tmp}/pi-install-project.sh"
```

预览和同时配置本机全局模型：

```bash
curl -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.sh | bash -s -- --dry-run
curl -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.sh | bash -s -- --global-models --base-url http://192.168.1.20:18982/v1
```

Windows PowerShell 使用真实的 `curl.exe`：

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.bat -o "$env:TEMP\pi-install-project.bat"
if ($LASTEXITCODE -eq 0) { & "$env:TEMP\pi-install-project.bat" }
```

Windows CMD：

```bat
curl.exe -fsSL https://raw.githubusercontent.com/suglow/pi-project-template/main/scripts/install-project.bat -o "%TEMP%\pi-install-project.bat" && call "%TEMP%\pi-install-project.bat"
```

下载后的 BAT 可加相同参数，例如 `--dry-run` 或 `--global-models --agent-dir "D:\pi-agent"`。同时提供 `install-project.mjs`，下载后可以直接通过 Node 运行。

### 远程初始化行为

- 自动找到当前 Git 工程根目录；从工程子目录运行也安装到根目录。
- 新增 AGENTS.md、PROJECT.md、`.pi` 配置和提示命令，以及独立的全局模型配置脚本、模型样例与少量通用项目文件。
- 保留业务 README、已有 Git 分支、远程地址、提交记录和暂存区；不会提交、推送或执行 git init。
- 默认已有不同内容的文件显示 `SKIP` 并保留；相同内容显示 `MATCH`。要采用模板版本，可显式使用 `--overwrite`，旧文件先备份到 `.pi/template-backups/时间-标识/`。
- `.gitignore` 只追加一个有标记的小段，忽略个人状态、本地 Pi 目录和模板备份；不替换已有忽略规则。已有 gitignore 被修改时也会备份。
- `--dry-run` 只预览，不改项目或全局配置。`--global-models` 会先预检全局配置，再安装项目文件并执行模型配置。
- 单个脚本已嵌入全部模板内容，不再次从 GitHub 下载文件；任意位置下载后均可执行。安装需要 Git 和 Node.js 22.19+，全程无需额外依赖安装。
- 默认不修改本机全局 Pi 配置。传 `--global-models` 时，模型配置按既有备份、合并规则处理。项目文件中已有的模型设置仍默认保留。

若磁盘或权限在写入过程中失败，部分文件可能已经安装；按打印的结果及备份核对后重试。文件/目录冲突、符号链接及全局配置格式问题在写入前检查。

| 远程入口参数 | 含义 |
|---|---|
| `--dry-run` | 预览项目安装；有全局选项时同时预检模型配置 |
| `--overwrite` | 备份并替换模板管理范围内的同名文件 |
| `--project-dir DIR` | 从指定目录定位 Git 根目录 |
| `--global-models` | 明确选择同时设置全局 models.json |
| `--base-url URL` | 全局服务地址，需同时传 --global-models |
| `--agent-dir DIR` | 全局 Pi 目录，需同时传 --global-models |
| `--help` | 查看帮助 |

### 更新模板后的发布步骤

三个 install-project 入口是生成文件。修改 Agent 规则、模型样例、项目配置、提示文件或安装逻辑后，从模板仓库根目录运行：

```text
node scripts/build-installers.mjs
node scripts/build-installers.mjs --check
node --test tests/configure-models.test.mjs tests/install-project.test.mjs
```

再将源文件和生成的入口一起提交上传。`--check` 可以检测下载入口是否仍包含旧模板。普通业务项目不需要生成器；业务项目中复制的 AGENTS.md 等不会因模板更新而自动改变。

## 维护和发布模板

模板默认分支为 `main`。使用自己的 Git 身份提交更新；本仓库不预设业务项目许可证。

修改源文件后，先重新生成入口并运行检查，再提交推送：

```text
node scripts/build-installers.mjs
node scripts/build-installers.mjs --check
node --test tests/configure-models.test.mjs tests/install-project.test.mjs
git add .
git commit -m "Update project template"
git push -u origin main
```

如果本机还没配置作者，先在本仓库设置自己的 `git config user.name "你的名字"` 和 `git config user.email "你的邮箱"`。从源码 ZIP 建库时还需要初始化 Git，并配置自己的远程仓库地址。

也可在 GitHub 将它标记为 Template repository，以后用 “Use this template” 创建独立项目。发布前按自己的用途选择并补充许可证。

## 每次新项目

```text
git clone https://github.com/suglow/pi-project-template.git my-project
cd my-project
git remote rename origin template
git remote add origin YOUR_NEW_PROJECT_REPOSITORY_URL
```

克隆会保留模板历史。以上命令将原地址保留为 `template`，新项目的 `origin` 指向新的空 GitHub 仓库，避免把业务改动推回模板。

随后：

1. 修改本 README，填写 `PROJECT.md` 中与当前任务相关的项目事实。
2. 按技术栈添加源码、依赖配置和实际验证命令；检查 `.gitignore` 是否符合项目需求。
3. 在需要运行 Pi 的机器上执行下方模型配置脚本。已经配置过、地址不变的机器无需每个项目重复设置。
4. 在项目根目录运行 `pi`，信任自己准备的项目配置，输入 `/project-start 你的任务`。
5. 用自己的 Git 身份提交业务改动，再向新项目的 `origin` 推送。

本模板以标准文件名 **AGENTS.md** 提供统一规则。Pi 自动发现它；其他 Agent 按各自的规则加载机制使用，不能保证所有工具都自动识别同一文件。

## 目录与用途

```text
AGENTS.md                        通用工作约定，不含机器参数
PROJECT.md                       新项目的目标、结构、命令和约束
.pi/settings.json                项目默认模型、推理和压缩设置
.pi/APPEND_SYSTEM.md             Pi 追加提示，保留默认系统提示
.pi/STATE.example.md             任务状态模板
.pi/prompts/                     项目启动、保存、恢复、检查命令
config/pi/models.r9700.json      可提交的机器配置样例，仅含占位 API key
scripts/configure-models.sh      Linux / macOS / WSL / Git Bash 入口
scripts/configure-models.bat     Windows CMD / PowerShell 入口
scripts/configure-models.mjs     两种入口共用的配置合并实现
scripts/install-project.sh      curl 下载或通过管道执行的项目初始化入口
scripts/install-project.bat     Windows 下载后执行的初始化入口
scripts/install-project.mjs     自包含 Node 初始化入口
scripts/build-installers.mjs    模板维护者生成三个入口
scripts/project-installer-core.mjs 初始化逻辑的源文件
tests/configure-models.test.mjs  配置脚本的离线测试
tests/install-project.test.mjs   远程入口、冲突保护和 curl 下载测试
docs/DECISIONS.md                重要取舍的记录格式
.github/PULL_REQUEST_TEMPLATE.md 通用 PR 说明模板
.editorconfig / .gitattributes   编辑习惯和跨平台换行
```

`.pi/STATE.md` 是本地任务进度，默认不提交；首次 `/project-start` 时由 Agent 根据示例建立。它是提示约定，不是自动保存插件。压缩前先 `/project-save`，再 `/compact`；恢复用 `/project-resume`。模板中没有尚未开始的业务计划或编造的测试结果。

## 配置本机全局 models.json

需要 **Node.js 22.19 或更新版本**；它也是当前 Pi 安装的运行时要求。脚本本身不安装依赖、不下载权重、不启动模型服务，也不修改全局 settings.json、auth.json 或项目规则。

Linux / macOS / WSL / Git Bash：

```bash
bash scripts/configure-models.sh --dry-run
bash scripts/configure-models.sh
```

Windows PowerShell：

```powershell
.\scripts\configure-models.bat --dry-run
.\scripts\configure-models.bat
```

Windows CMD：

```bat
scripts\configure-models.bat --dry-run
scripts\configure-models.bat
```

脚本能从任意工作目录通过完整路径调用。BAT 与 Bash 参数相同：

| 参数 | 用途 |
|---|---|
| `--base-url URL` | 两个模型入口共用的 API 根地址，例如 `http://192.168.1.20:18982/v1` |
| `--agent-dir DIR` | 显式指定 Pi 用户配置目录，脚本在其下写 models.json |
| `--dry-run` | 只报告目标和动作，不创建目录、备份或配置文件 |
| `--help` | 查看帮助 |

远程推理服务示例：

```bash
bash scripts/configure-models.sh --base-url http://192.168.1.20:18982/v1
```

```bat
scripts\configure-models.bat --base-url http://192.168.1.20:18982/v1
```

配置目录按 **命令行 `--agent-dir` → 环境变量 `PI_CODING_AGENT_DIR` → 当前用户 `~/.pi/agent`** 的优先级选择。Windows 默认通常为 `%USERPROFILE%\.pi\agent`。Windows 与 WSL 是不同的用户环境，分别运行脚本时可能配置不同目录。

### 合并和备份行为

- 没有 models.json 时创建；已有配置时先校验，再备份原始字节到同目录的 `models.json.bak-时间-随机标识`。
- 保留其他 provider、根层字段，以及本模板 provider 下其他模型 ID。只管理 `paiton`、`paiton-fast` 的连接字段、兼容字段和各自 `Qwen3.8` 模型条目；同名模型条目使用样例整体替换。
- 重复运行且配置相同，不写文件、不生成额外备份。
- 支持 UTF-8 BOM 和 JSON 注释；更新后输出格式化的标准 JSON，原有注释保留在备份中。已有坏 JSON、异常结构或非普通文件时停止，不覆盖。
- 成功写入前通过同目录临时文件准备内容，再替换目标。若读取后发现文件发生变化则停止；执行期间避免同时手工编辑或让其他进程写这个文件。
- 控制台不打印配置内容或密钥。运行后在 Pi 打开 `/model` 重读配置，或重新启动 Pi。

恢复时退出正在修改配置的进程，检查备份路径，将需要的备份复制回 models.json。例如 PowerShell：

```powershell
Copy-Item -LiteralPath '实际备份完整路径' -Destination '实际 models.json 完整路径'
```

样例 API key 是 `local`，适用于无鉴权的本地 Paiton 服务。需要鉴权时在本机修改，真实凭据不要提交到模板仓库。备份也留在用户配置目录，不放进业务 Git 仓库。

## Pi 与 R9700 配置

默认以 **R9700 32GB、单人一个 session、代码开发兼顾截图** 为目标：

| 配置 | 默认 |
|---|---|
| 部署模型 | Qwen3.8 27B W3A4 3-bit + DFlash2 |
| 服务地址 | `http://127.0.0.1:18982/v1` |
| 上下文，含输入与输出 | 245000 tokens |
| 单轮生成预算，含思考 | 16384 tokens |
| 压缩预留 / 近期保留 | 32768 / 32768 tokens |
| 常规开发入口 | `paiton/Qwen3.8`，默认 medium |
| 快速修改入口 | `paiton-fast/Qwen3.8`，固定 off |

两个入口指向同一个服务、同一个真实模型 ID，使用不同采样参数；不用加载第二份模型。开发入口支持 off/low/medium/xhigh；选 off 时采样仍是 thinking 配方，想用 non-thinking 配方则选择快速入口。

配置沿用本机 **Pi 0.87.1** 已验证的字段。该版本未实现 main 文档中的 samplingParamsByThinkingLevel，因此通过两个入口分开采样。模型声明中的快速入口仍使用 reasoning=true 以执行模板兼容逻辑，但禁用了全部思考档位，并明确发送 enable_thinking=false。

使用别的模型时，修改 `config/pi/models.r9700.json` 的模型元数据和 `.pi/settings.json` 的默认项，或提供自己的模型样例和安装逻辑。通用 AGENTS.md 与业务 PROJECT.md 无需依赖 R9700。

### Shell 的跨平台使用

项目设置不强制指定 shell 工具，沿用本机 Pi 的工具选择。Linux、WSL 或已配置 Bash 的 Windows 可直接运行 `pi`。原生 Windows 如果要使用 PowerShell 工具：

```text
pi --tools read,powershell,edit,write,grep,find,ls
```

也可在本机 Pi 的全局 settings.json 设置 defaultTools，或在当前项目的 `.pi/settings.json` 增加该字段。模型配置脚本不会替你变更 shell 选择。

### 服务端配套命令

在推理主机的 Paiton 仓库根目录，按官方说明准备权重、缓存目录和 PAITON 环境变量后运行：

```bash
bash models/Qwen3.8-MXFP4-DFlash2/run-3bit.sh \
  --mode long \
  --vision \
  --thinking off \
  --detach
```

这需要官方部署环境，不能当作普通 Windows BAT 模型启动命令使用。Pi 请求可以覆盖服务器默认思考关闭。跨机器使用时保证 API 地址可达；默认服务绑定 127.0.0.1，必要时采用端口转发。

压缩边界约为超过 212232 tokens，这是估算触发条件，无法保证下一次大工具输出不超过服务端限制。大量读取前可先保存状态并压缩。截图历史、多图行为、速度和长会话稳定性仍需在实际服务验证。

## 检查模板脚本

```text
node --test tests/configure-models.test.mjs tests/install-project.test.mjs
```

测试仅使用临时测试目录，不修改真实 Pi 用户目录，不连接模型服务。本机 Windows 已验证 Bash（Git Bash）和 BAT 两个入口，覆盖新建、合并、备份、重复运行、坏配置保护、目录优先级、远程地址和含空格路径。

## 参考

- [Pi 配置目录](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md)
- [Pi 模型与兼容端点](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)
- [Pi 项目设置](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)
- [Paiton Qwen3.8 部署说明](https://github.com/Eliovp-BV/paiton-vllm-plugin/blob/main/models/Qwen3.8-MXFP4-DFlash2/README.md)
- [Qwen3.8 官方模型卡](https://huggingface.co/Qwen/Qwen3.8-27B)

通过 ZIP 获取源码时不包含 `.git`；上传前先执行 `git init -b main`，再按首次上传步骤提交。
