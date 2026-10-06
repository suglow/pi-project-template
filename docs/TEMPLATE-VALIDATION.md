# 模板验证记录

验证日期：2026-10-05。

远程初始化更新验证：2026-10-06。

## 远程入口新增验证

- 两组脚本测试合计 28 项通过，0 项失败。
- 将独立 Node/BAT 入口复制到没有模板文件的临时目录后执行；Bash 从标准输入执行。
- 通过本机临时 HTTP 服务实际运行 curl 下载后安装流程；HTTP 404 时不会执行安装。
- 验证默认保留已有文件、显式替换前备份、重复执行不变、gitignore 追加不重复。
- 验证 Git 子目录定位根目录、非 Git 目录拒绝、目录冲突和符号链接在写入前拒绝。
- 验证全局配置必须显式选择、dry-run 不改项目或全局、全局预检失败不改项目。
- `node scripts/build-installers.mjs --check` 验证三个自包含入口与源文件一致。

文档已经使用 suglow/pi-project-template 的真实仓库路径。真实 GitHub Raw 入口验证在首次推送后执行；本机 HTTP curl 传输验证已通过。

## 已执行

- `node --test tests/configure-models.test.mjs`：13 项通过，0 项失败。
- 在 Windows 实际调用 BAT，以及通过 Git Bash 调用 Bash 脚本；工作目录与脚本目录不同，路径包含空格。
- 验证新建配置、合并已有 provider、保留其他模型、备份原始字节、重复运行不重复写入、同名模型去重。
- 验证 JSON 注释和 BOM、错误 JSON/结构保护、自定义目录优先级、服务地址校验、dry-run 无写入。
- 使用已安装 Pi 0.87.1 的真实配置加载器验证 models 样例、项目 settings、按模型压缩设置和四个提示命令。
- 模型样例与之前通过 Pi 实际请求构造器检查的 R9700 配置一致。
- `node --check scripts/configure-models.mjs` 和 Git 暂存差异格式检查通过。

所有脚本写入测试只使用临时测试目录，没有修改实际 Pi 用户配置，没有请求真实模型服务。

## 尚未执行

- Linux/macOS 原生环境执行；Bash 入口已在 Git Bash 验证。
- 真实 R9700 服务启动、模型输出质量、截图识别、多图历史及长会话性能。
