# Quayloom 部署

## 运行环境

需要 Node.js 24+。构建机使用锁定版本的 pnpm 安装依赖并执行 `type`、`lint` 和 `build`。生产运行文件包括构建后的 `dist/`、`server/`、`package.json`、`LICENSE`、`LICENSES/` 和 `NOTICE.md`；发布时还须保留与运行版本一致的对应源码 ZIP，并配置其受控下载入口。后端没有第三方 npm 运行依赖。不要把源码工作目录或数据目录作为静态目录暴露；公开源码应使用经过筛选、不含凭据的归档。

原生运行默认绑定 `127.0.0.1:3210`。使用反代时保留准确的 Host 和 Origin；`PUBLIC_ORIGIN` 必须是浏览器可见的完整源，例如 `https://chat.example.com`，不带末尾斜杠和路径。HTTP 只能用于可信环境，并设置 `COOKIE_SECURE=false`；公网推荐 HTTPS 和 `COOKIE_SECURE=true`。

## Docker / 1Panel

仓库提供多阶段 Dockerfile 与通用 `compose.yaml` 模板。在 1Panel 中导入完整项目并构建 `quayloom:local`，再创建容器编排；仅复制 compose 文件不够。设置 `PUBLIC_ORIGIN`、初始密码、挂载路径和持久卷后再运行。

容器以非 root `node` 用户运行；模板限制内存与 CPU、丢弃 capabilities、启用 no-new-privileges，并将监听端口仅绑定到宿主机回环地址。迁移旧绑定目录时只调整本项目专用目录的权限，禁止广泛 chmod。

首次初始化通过 `ADMIN_PASSWORD` 或只读挂载的 `ADMIN_PASSWORD_FILE` 提供 12–1024 字符密码；二者不能同时设置。未设置时，服务器在首次终端输出一次随机密码。密码不要写入 compose、镜像或 Git。已建库后，配置的密码必须匹配现有密码，修改环境变量不会自动重置。

## 子路径

以 `/Quayloom` 为例：构建参数 `APP_BASE_PATH=/Quayloom`，运行时 `BASE_PATH=/Quayloom`，两者必须一致。`PUBLIC_ORIGIN` 只写源，例如 `https://chat.example.com`。

```nginx
location = /Quayloom { return 308 /Quayloom/; }
location ^~ /Quayloom/ {
    proxy_pass http://127.0.0.1:3210;
    proxy_set_header Host $http_host;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 660s;
    client_max_body_size 40m;
}
```

`proxy_pass` 末尾不能带 `/`，反代必须保留完整路径。根路径部署使用相同配置的 `location /`。Cookie 仅适用于配置的 BASE_PATH，根路径 API 不会绕过子路径授权。

## 会话和权限

生成由服务器后台任务持有，HTTP 轮询连接断开不取消上游。使用者点击停止或授权失效才取消；服务器重启不自动重发未完成任务。任务最长十分钟。部署升级会中断当时仍在运行的任务，最好安排维护窗口。

管理员可以管理供应商、读取使用码原文，并通过只读接口查看使用码的服务端对话。普通使用码只能读写本身份会话和使用获准模型；不能调用管理接口。对话正文不是端到端加密，数据库和备份必须按敏感资料保护。不要记录 Authorization、Cookie、请求体或环境密钥。

## 备份、升级和回滚

一个数据目录仅允许一个进程，禁止多副本共享 SQLite；不要打开第二个 SQLite 客户端读取正在运行的生产库。

1. 先完成独立构建，保留旧镜像引用、编排和环境配置。
2. 通过部署管理器停止且仅停止本项目，确认数据库不再运行。
3. 整体备份 `data/`、密码文件、原编排和主密钥。若使用 `STUDIO_MASTER_KEY`，独立备份相同的 32 字节 Base64 密钥。
4. 保留原挂载、密码和密钥，原位更新镜像，不创建第二个实例占用同一数据库。
5. 检查实际健康、登录、供应商配置、数据迁移和反代；部署 API 接受请求不代表升级已完成。
6. 回滚时配套恢复该版本兼容的数据备份，不承诺数据库可直接降级；不要删除唯一备份。

0.3 新增按身份隔离的持久会话和任务表。旧供应商、使用码、额度、管理员密码、主密钥与手动历史快照保留。浏览器旧历史在相应身份打开新版时迁移，已有服务器数据优先。浏览器附件原件仍需独立保留；数据库备份不包含这些本机文件。

丢失或换错主密钥会导致启动失败，无法恢复加密供应商密钥或使用码。不要用新建数据库掩盖主密钥问题。

## 密码重置

先停止服务，设置 `RESET_ADMIN_PASSWORD`，执行 `node --env-file-if-exists=.env server/reset-password.mjs`，清除重置变量，并同步更新原密码文件或配置后再启动。重置撤销已有登录；后台任务的取消应通过正常停止或授权管理处理。

## 源码分发与发布边界

Quayloom 自有代码默认按 AGPL-3.0-only 提供，上游 MIT 与其他第三方权利分别保留。完整条款见 [LICENSE](../LICENSE)，上游 MIT 原文见 [MIT-chat-demo.txt](../LICENSES/MIT-chat-demo.txt)，来源与边界见 [NOTICE](../NOTICE.md)。

网络用户通过页面“源码”入口获取运行版本对应源码，API 为 `GET /api/source.zip`；子路径示例为 `/Quayloom/api/source.zip`，支持无登录下载。Docker 与 APK 交付附带匹配的源码归档，Android 还可将内置源码保存到设备。发布前检查 GET/HEAD、反代路径、归档内容及版本一致性，不把示例地址当成已部署事实。不要求现在创建 GitHub 仓库，且不能用未来计划中的仓库代替当前版本的源码提供。

公开范围包含修改、构建、安装与运行所需的应用源码、锁文件、构建配置、许可和使用文档。内部测试验证、截图、报告、日志、生产部署细节、数据、凭据、Android 私有签名和构建产物不在此范围；测试文件仅留工作区，不应删除。私钥不得为满足源码提供要求而公开，Android 接收者可自行构建并使用自己的密钥签名。不提供 GitHub Pages 或自动发布镜像工作流；公开源码不等于已部署服务，也不表示已完成 APK 实机测试。
