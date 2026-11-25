# Quayloom Android

轻量原生 Java 客户端，无第三方 Android 运行时依赖。应用名 **Quayloom**，包名 `org.quayloom.android`，版本 `0.2.1` / versionCode `4`，minSdk 26（Android 8），targetSdk 36。自有代码 **AGPL-3.0-only**；完整许可和上游声明见项目根目录。

## 使用

填写完整工作台根地址，例如 `https://example.com/Quayloom`，选择使用码或管理员密码登录。支持 HTTP，但始终显示不安全提示，并在发送凭据前确认。HTTPS 使用系统证书链，不支持忽略证书或信任所有证书。

登录通过原生 `POST <base>/api/auth/login`，JSON 为 `{ "mode":"code", "code":"…" }` 或 `{ "mode":"admin", "password":"…" }`，`Origin` 为标准 scheme/host/port（不包含部署路径，省略默认端口）。拒绝登录重定向。响应 `Set-Cookie` 全部通过 CookieManager 接收成功后，WebView 才打开 `<base>/`。

### 记住并填入凭据

- **首次使用默认启用**连接页的“记住并填入凭据”，可随时关闭。仅原生登录成功（HTTP 200 且包含 Cookie），并且所有 Cookie 均被设备接受后才保存；失败、证书拒绝、重定向、取消 HTTP 确认均不新增或覆盖记录。填入不等于登录，不会自动提交；HTTP 仍须每次确认。
- 两种凭据静默去除 Unicode 首尾空白，内部字符不变。输入视图不保存系统状态，系统 autofill 始终禁用；受控填入仅由本应用实现。普通连接偏好仅有 URL、登录方式；密码/使用码不进入明文偏好、Bundle、日志、导出源码或外部存储。
- 凭据使用 `AndroidKeyStore` 中本应用专用的 AES-256 密钥，以 `AES/GCM/NoPadding` 加密；每次写入由 KeyStore 生成新的 96-bit 随机 IV，认证标签 128-bit。私有偏好只存开关及版本化 IV/密文，密钥不可导出。不要求每次解锁/生物识别，以支持用户确认的重新打开后填入；本功能不能抵御已解锁设备上有权操作本应用的人员。
- 使用规范工作台 URL（scheme、大小写归一 host、有效 port、**区分大小写的完整部署路径**）和登录方式作为隔离范围。默认端口、host 大小写和末尾 `/` 规范化为同一地址；HTTP/HTTPS、不同非默认端口、不同部署路径及 code/admin 绝不共享记录。范围的 SHA-256 用作记录键，完整范围同时绑定 GCM AAD，搬移密文到另一个范围会验证失败。
- 编辑地址或切换方式会先清空旧输入，再只读取对应范围的记录；无效/未知地址为空，不把旧工作台凭据带入新端点。登录请求固定已确认的地址/方式/凭据快照，连接期间禁用编辑；网络失败不保存失败凭据，表单可重新填入该范围先前成功保存的记录。
- **关闭记住会立即清空当前输入，并清除所有地址/方式的加密凭据及专用密钥**，而非只清除当前记录；重新启用后须下一次成功登录才会保存。退出并清除设备会话也删除所有加密凭据、销毁专用密钥并关闭记住，不会在返回连接页时再次填入。
- KeyStore 不可用、密钥失效、密文损坏/认证失败或偏好写入失败时，停止保存/填入、清空加密存储并尝试销毁专用密钥，显示安全提示；仍可手动登录，**绝不回退明文保存**。清除操作同时检查偏好提交与密钥删除结果；任一失败会提示用户在 Android 系统设置清除此应用数据，不宣称清除成功。应用禁止备份；系统恢复后无法使用的旧密文不会明文迁移。

### 会话与工作台安全边界

- WebView 会保留会话 Cookie 和工作台自身 localStorage（如聊天记录）；返回地址页不等于退出账号/清除站点数据。客户端菜单的“退出并清除设备会话”同时处理会话及记住凭据。
- WebView 仅允许当前 http/https 源及部署路径；阻止越界子资源、iframe、编码目录穿越、file/content/intent/javascript 导航及混合内容。外链先确认，再交给系统浏览器，不传登录 Cookie。
- 无 JS 桥、文件选择/文件访问、地理位置、摄像头、麦克风或 Android 存储权限。附件能力依赖网页，客户端不开放本机文件。
- 主文档由原生同源 GET 加载（不跟随重定向），附加同源/部署路径 CSP，限制资源、连接、表单和 frame；禁止 worker、object 与 base URL 改写。顶层仅允许 GET，API POST 由网页正常 fetch 发送。主文档不支持重定向的地址应填写其最终部署 URL。
- 白底限宽连接页使用圆角输入、胶囊身份切换和键盘提交。聊天不再叠加原生常驻头部，WebView 填充系统 safe area；工作台网页菜单通过当前部署路径下固定 anchor `/__quayloom_android/menu` 请求打开原生客户端菜单，菜单提供连接信息、刷新、更换工作台、退出清除、源码与许可。
- 固定 anchor 仅是 UI 入口，不提供认证、授权或任意命令参数。Android 只接受当前 WebView、当前 generation、同源精确路径、无 query/fragment/userinfo、GET、主框架且有用户手势的 WebResourceRequest；所有非法 reserved 路径（包括旧 String 回调无法验证手势的请求）均阻断且不导航。UA 从构建版本追加 `QuayloomAndroid/0.2.1` 供网页选择显示入口，不作为安全凭据。
- 加载失败显示原生重试页和“客户端设置”，证书错误仍拒绝连接。系统返回优先收起键盘，再返回网页历史；无历史时确认返回连接页。系统栏/显示缺口/键盘 Insets 避让；旋转由 Activity 配置变更处理，不销毁登录请求或 WebView；系统杀进程后回到地址页，只按启用的记住设置重新填入精确范围凭据，不自动提交。
- “退出并清除设备会话”经确认后清除此应用所有工作台的 Cookie、WebStorage、WebView 缓存及历史、加密凭据和专用密钥；仅本机保存的聊天记录可能丢失，服务器记录不删除。更换工作台仍保留站点会话及加密凭据，与退出清除区分。
- 菜单“保存对应源码（AGPL）”使用系统 `ACTION_CREATE_DOCUMENT` 保存 APK 中内置的 `assets/source.zip`；关于页显示其 SHA-256。无须外部站点即可取得对应源码。

## 0.2.1 版本说明

新增默认启用、可关闭的 AndroidKeyStore 加密记住与受控填入；成功登录才保存，按精确源/规范部署路径/登录方式隔离，不自动登录。关闭记住及退出清除均删除所有加密凭据与专用密钥，密钥或存储故障安全降级为不保存。沿用 0.2.0 的原生连接页、工作台全屏布局、同源菜单信号及全部网络安全边界；版本提高至 versionCode 4，原包名与签名链保持不变，可覆盖升级。

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

`QUAYLOOM_SOURCE_ZIP` 必填，必须是本版本最终干净、完整的对应源码；源码包中包括本 Android 目录与全工作台源码/许可，不应包含凭据、密钥、依赖目录或构建产物。源码包不包含自身，无递归问题。构建脚本将原样内嵌该 ZIP，不从外网获取；若设置 `QUAYLOOM_SOURCE_SHA256`，哈希必须吻合。开发测试目录存在时会运行纯 Java URL/Unicode/原生 HTTP Mock 回归；干净对应源码包可不含测试目录，仍能构建 APK。独立的临时验证目录不得进入对应源码包或提交。

编译管线：aapt2 compile/link → javac（Java 8 字节码）→ d8（min API 26）→ 固定顺序/时间戳 ZIP → zipalign（16 KiB 对齐）→ 可选 apksigner。新增 CredentialStore 使用 minSdk 26 已具备的系统 API，无新依赖或权限。构建无网络操作，资源和字节码输入固定；同一工具链、源码包、环境、签名身份下应得到相同结果。首次签名的随机私钥/证书不追求可重现，必须持续保管用于未来升级；本版本未来更新要增加 versionCode。

签名密钥必须放在源码目录之外的私有目录，例如 `/path/to/private-signing`（目录 0700，PKCS12 和随机密码文件 0600），不允许放在项目内：

```sh
export QUAYLOOM_SIGNING_DIR=/path/to/private-signing
# 仅在负责人确认最终对应源码 ZIP 后执行：
timeout 230s python3 android/build.py sign
```

**0.2.1 必须指向原有签名目录，升级时不得重建或换签名身份。** 若已有密钥则绝不重建；如仅残留一半签名文件则中止。APK 采用 RSA-3072、SHA256withRSA、v2/v3 签名（min26 不需要 v1），保留原签名身份用于以后覆盖升级。请由机主安全离线备份整个私有签名目录，切勿提交 Git、源码包或公开发布。`apksigner verify --verbose --print-certs`、`zipalign -c -P 16 4`、aapt2 badging 和内嵌源码 ZIP 哈希检查自动执行。输出名称更新为 `Quayloom-0.2.1[-unsigned|-aligned].apk`。

`build-result.json` 是内部构建记录，不属于源码发布内容。编译、协议 Mock、APK 解析和签名校验不等于设备运行测试；没有 Android 设备/模拟器时不得宣称已实机验收。安装后仍应在实际设备确认：成功后重开填入且不自动提交、失败不覆盖、不同源/端口/路径/方式隔离、编辑 URL 立即清空、关闭记住清除全部、退出清除后不再填入、KeyStore 失效/密文损坏不回退明文，以及系统 WebView Cookie、旋转、返回、证书拒绝、外链确认和源码保存流程。
