# Quayloom Android

轻量原生 Java 客户端，无第三方 Android 运行时依赖。应用名 **Quayloom**，包名 `org.quayloom.android`，版本 `0.2.0` / versionCode `3`，minSdk 26（Android 8），targetSdk 36。自有代码 **AGPL-3.0-only**；完整许可和上游声明见项目根目录。

## 使用

填写完整工作台根地址，例如 `https://example.com/Quayloom`，选择使用码或管理员密码登录。支持 HTTP，但始终显示不安全提示，并在发送凭据前确认。HTTPS 使用系统证书链，不支持忽略证书或信任所有证书。

登录通过原生 `POST <base>/api/auth/login`，JSON 为 `{ "mode":"code", "code":"…" }` 或 `{ "mode":"admin", "password":"…" }`，`Origin` 为标准 scheme/host/port（不包含部署路径，省略默认端口）。拒绝登录重定向。响应 `Set-Cookie` 全部通过 CookieManager 接收成功后，WebView 才打开 `<base>/`。

- 两种凭据静默去除 Unicode 首尾空白，内部字符不变；不弹“去空格”提示。
- 原生偏好仅保存 URL、模式；凭据输入禁止自动保存/自动填充，发送后立即清空，不写入日志或磁盘。
- WebView 会保留会话 Cookie 和工作台自身 localStorage（如聊天记录）；返回地址页不等于退出账号/清除站点数据。请在工作台内退出账号。
- WebView 仅允许当前 http/https 源及部署路径；阻止越界子资源、iframe、编码目录穿越、file/content/intent/javascript 导航及混合内容。外链先确认，再交给系统浏览器，不传登录 Cookie。
- 无 JS 桥、文件选择/文件访问、地理位置、摄像头、麦克风或 Android 存储权限。附件能力依赖网页，客户端不开放本机文件。
- 主文档由原生同源 GET 加载（不跟随重定向），附加同源/部署路径 CSP，限制资源、连接、表单和 frame；禁止 worker、object 与 base URL 改写。顶层仅允许 GET，API POST 由网页正常 fetch 发送。主文档不支持重定向的地址应填写其最终部署 URL。
- 白底限宽连接页使用圆角输入、胶囊身份切换和键盘提交。聊天不再叠加原生常驻头部，WebView 填充系统 safe area；工作台网页菜单通过当前部署路径下固定 anchor `/__quayloom_android/menu` 请求打开原生客户端菜单，菜单提供连接信息、刷新、更换工作台、退出清除、源码与许可。
- 固定 anchor 仅是 UI 入口，不提供认证、授权或任意命令参数。Android 只接受当前 WebView、当前 generation、同源精确路径、无 query/fragment/userinfo、GET、主框架且有用户手势的 WebResourceRequest；所有非法 reserved 路径（包括旧 String 回调无法验证手势的请求）均阻断且不导航。UA 仅追加固定 `QuayloomAndroid/0.2.0` 供网页选择显示入口，不作为安全凭据。
- 加载失败显示原生重试页和“客户端设置”，证书错误仍拒绝连接。系统返回优先收起键盘，再返回网页历史；无历史时确认返回连接页。系统栏/显示缺口/键盘 Insets 避让；旋转由 Activity 配置变更处理，不销毁登录请求或 WebView；系统杀进程后回到地址页，不恢复凭据。
- “退出并清除设备会话”经确认后清除此应用所有工作台的 Cookie、WebStorage、WebView 缓存及历史；仅本机保存的聊天记录可能丢失，服务器记录不删除。更换工作台仍保留站点会话，与退出清除区分。
- 菜单“保存对应源码（AGPL）”使用系统 `ACTION_CREATE_DOCUMENT` 保存 APK 中内置的 `assets/source.zip`；关于页显示其 SHA-256。无须外部站点即可取得对应源码。

## 0.2.0 版本说明

本版本重做原生连接页与应用外壳：白底限宽圆角表单、使用码/管理员胶囊切换、键盘完成操作、静默首尾空白清理；聊天 WebView 填满系统安全区，不再常驻原生头部；通过网页菜单中的固定同源客户端设置链接打开原生菜单，菜单承载连接信息、刷新、更换工作台、退出清除设备会话、源码与许可。网络安全边界保持不变：端点解析和同源部署路径限制、主文档不跟随重定向、系统证书链、CSP、混合内容拒绝、无 JS 桥/文件访问。

## Debian 无 Gradle 构建

只在指定 Debian 执行。需 Python 3、便携 JDK 21、Google 官方 SDK `platforms;android-36` 与 `build-tools;36.0.0`。不需要系统安装、Gradle、Maven、容器或第三方 jar。首次取得工具链时应从 Google `repository2-3.xml` 验证 SHA-1 元数据，从 Adoptium API 或 OpenJDK 官方归档站验证 JDK SHA-256；不要禁用 HTTPS 验证。本次使用官方 OpenJDK 21.0.2 便携包，SHA-256 `a2def047a73941e01a73739f92755f86b895811afb1f91243db214cff5bdac3f`。Android SDK、OpenJDK 的使用遵循各自许可，不随本应用源码归为 AGPL。

```sh
export JAVA_HOME=/path/to/portable-jdk-21
export ANDROID_HOME=/path/to/sdk
export QUAYLOOM_SOURCE_ZIP=/absolute/path/quayloom-source.zip
export QUAYLOOM_SOURCE_SHA256=<expected-sha256>
export QUAYLOOM_ANDROID_OUT=/absolute/private-build-directory
export SOURCE_DATE_EPOCH=1795382400
# 每个阶段设置总超时；Python 内每个工具进程最多 75 秒。
timeout 230s python3 android/build.py unsigned
```

`QUAYLOOM_SOURCE_ZIP` 必填，必须是本版本最终干净、完整的对应源码；源码包中包括本 Android 目录与全工作台源码/许可，不应包含凭据、密钥、依赖目录或构建产物。源码包不包含自身，无递归问题。构建脚本将原样内嵌该 ZIP，不从外网获取；若设置 `QUAYLOOM_SOURCE_SHA256`，哈希必须吻合。开发测试目录存在时会运行纯 Java URL/Unicode/原生 HTTP Mock 回归；干净对应源码包可不含测试目录，仍能构建 APK。

编译管线：aapt2 compile/link → javac（Java 8 字节码）→ d8（min API 26）→ 固定顺序/时间戳 ZIP → zipalign（16 KiB 对齐）→ 可选 apksigner。构建无网络操作，资源和字节码输入固定；同一工具链、源码包、环境、签名身份下应得到相同结果。首次签名的随机私钥/证书不追求可重现，必须持续保管用于未来升级；本版本未来更新要增加 versionCode。

签名密钥必须放在源码目录之外的私有目录，例如 `/path/to/private-signing`（目录 0700，PKCS12 和随机密码文件 0600），不允许放在项目内：

```sh
export QUAYLOOM_SIGNING_DIR=/path/to/private-signing
# 仅在负责人确认最终对应源码 ZIP 后执行：
timeout 230s python3 android/build.py sign
```

若已有密钥则绝不重建；如仅残留一半签名文件则中止。APK 采用 RSA-3072、SHA256withRSA、v2/v3 签名（min26 不需要 v1），保留原签名身份用于以后覆盖升级。请由机主安全离线备份整个私有签名目录，切勿提交 Git、源码包或公开发布。`apksigner verify --verbose --print-certs`、`zipalign -c -P 16 4`、aapt2 badging 和内嵌源码 ZIP 哈希检查自动执行。

`build-result.json` 是内部构建记录，不属于源码发布内容。编译、协议 Mock、APK 解析和签名校验不等于设备运行测试；没有 Android 设备/模拟器时不得宣称已实机验收。安装后仍应在实际设备确认系统 WebView Cookie、旋转、返回、证书拒绝、外链确认和源码保存流程。
