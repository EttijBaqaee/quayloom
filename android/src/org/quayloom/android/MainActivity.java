// SPDX-License-Identifier: AGPL-3.0-only
package org.quayloom.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextWatcher;
import android.text.Editable;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.widget.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public final class MainActivity extends Activity {
    private static final int SOURCE_REQUEST = 17;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout root;
    private EditText address, credential;
    private RadioGroup modes;
    private RadioButton code, admin;
    private TextView status, httpHint;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private boolean pageFailed;
    private Button loginButton;
    private WebView web;
    private volatile Endpoint endpoint;
    private boolean busy, destroyed;
    private int generation;
    private SharedPreferences preferences;
    private CredentialStore credentialStore;
    private CheckBox remember;
    private TextView storageHint;
    private boolean updatingRemember;
    private String credentialScope = "";
    private String lastAddress = "", lastMode = "code";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (android.os.Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        if (android.os.Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (android.os.Build.VERSION.SDK_INT >= 33) Api33.register(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        credentialStore = new CredentialStore(this);
        lastAddress = preferences.getString("url", ""); lastMode = preferences.getString("mode", "code");
        if (state != null) { lastAddress = state.getString("url", lastAddress); lastMode = state.getString("mode", lastMode); }
        showForm();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(Color.rgb(31,36,55)); return v;
    }
    private void setRoot() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.WHITE);
        root.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime));
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return android.os.Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        setContentView(root); root.requestApplyInsets();
    }
    private Button button(String label, View.OnClickListener click) {
        Button b = new Button(this); b.setText(label); b.setTextSize(15); b.setAllCaps(false);
        b.setTextColor(0xff505665); b.setMinWidth(0); b.setMinimumWidth(0); b.setMinHeight(0); b.setMinimumHeight(0);
        b.setPadding(dp(12),0,dp(12),0); b.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x184d6bfe),rounded(0xfff4f5f8,0,24),null)); b.setOnClickListener(click); return b;
    }
    private String mode() { return admin != null && admin.isChecked() ? "admin" : "code"; }
    private void sourceMenu() {
        new AlertDialog.Builder(this).setTitle("Quayloom")
            .setItems(new String[]{"保存对应源码（AGPL）", "关于与许可"}, (dialog, which) -> {
                if (which == 0) {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/zip").putExtra(Intent.EXTRA_TITLE, "Quayloom-" + BuildInfo.VERSION + "-source.zip");
                    try { startActivityForResult(intent, SOURCE_REQUEST); }
                    catch (android.content.ActivityNotFoundException e) { toast("此设备没有文档保存程序"); }
                } else new AlertDialog.Builder(this).setTitle("Quayloom " + BuildInfo.VERSION)
                    .setMessage("轻量 Android 工作台客户端\n自有代码：AGPL-3.0-only\n上游及第三方组件各自许可随对应源码提供。\n\n可通过菜单保存本 APK 内置的完整对应源码。\n源码 SHA-256：\n" + BuildInfo.SOURCE_SHA256
                        + "\n\n默认在成功登录后以 AndroidKeyStore 加密保存密码或使用码，按精确工作台地址和身份填入，不自动登录。可在连接页关闭记住并清除所有已保存凭据；安全密钥不可用时不保存，绝不回退明文。WebView 会保存会话 Cookie 及站点自己的本地数据；返回地址页不等同于清除数据。退出并清除设备会话会同时删除全部已保存凭据。")
                    .setPositiveButton("知道了", null).show();
            }).show();
    }
    private android.graphics.drawable.GradientDrawable rounded(int color, int stroke, int radius) {
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setColor(color); shape.setCornerRadius(dp(radius));
        if (stroke != 0) shape.setStroke(dp(1),stroke);
        return shape;
    }
    private void gap(LinearLayout parent, int height) { parent.addView(new View(this),new LinearLayout.LayoutParams(1,dp(height))); }
    private void field(EditText field, String hint, boolean password) {
        field.setSingleLine(true); field.setTextSize(16); field.setTextColor(Color.rgb(28,31,38));
        field.setHintTextColor(Color.rgb(137,141,151)); field.setHint(hint);
        field.setInputType(InputType.TYPE_CLASS_TEXT | (password ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_VARIATION_URI));
        field.setPadding(dp(16),dp(14),dp(16),dp(14));
        field.setBackground(rounded(0xfff7f8fa,0xffe7e9ef,18));
        field.setSaveEnabled(false); field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        field.setId(View.generateViewId());
        field.setOnFocusChangeListener((v,focus) -> {
            field.setBackground(rounded(focus ? Color.WHITE : 0xfff7f8fa,focus ? 0xff4d6bfe : 0xffe7e9ef,18));
            if (!focus) field.setText(Endpoint.trim(field.getText().toString()));
        });
    }
    private void styleMode(RadioButton item, boolean selected) {
        item.setButtonDrawable((android.graphics.drawable.Drawable)null);
        item.setGravity(android.view.Gravity.CENTER); item.setTextSize(14);
        item.setTextColor(selected ? 0xff344fce : 0xff646975);
        item.setTypeface(android.graphics.Typeface.DEFAULT,selected ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        item.setBackground(rounded(selected ? Color.WHITE : Color.TRANSPARENT,0,24));
    }
    private void showForm() {
        generation++; busy = false;
        credential = null; remember = null; storageHint = null; credentialScope = "";
        if (web != null) { web.stopLoading(); web.loadUrl("about:blank"); web.removeAllViews(); web.destroy(); web = null; }
        endpoint = null; setRoot();
        LinearLayout header = new LinearLayout(this); header.setGravity(android.view.Gravity.CENTER_VERTICAL); header.setPadding(dp(22),dp(4),dp(12),dp(4));
        TextView brand = text("Quayloom",19); brand.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);
        header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        Button menu = button("⋯",v -> sourceMenu()); menu.setContentDescription("应用菜单");
        header.addView(menu,new LinearLayout.LayoutParams(dp(48),dp(48))); root.addView(header);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout stage = new LinearLayout(this); stage.setOrientation(LinearLayout.VERTICAL); stage.setGravity(android.view.Gravity.CENTER);
        stage.setPadding(dp(24),dp(28),dp(24),dp(32)); stage.setFocusableInTouchMode(true); scroll.addView(stage);
        LinearLayout form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        stage.addView(form,new LinearLayout.LayoutParams(-1,-2));
        stage.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob) -> {
            int width = Math.min(dp(420),Math.max(0,r-l-stage.getPaddingLeft()-stage.getPaddingRight()));
            if(form.getLayoutParams().width!=width){ form.getLayoutParams().width=width; form.requestLayout(); }
        });
        TextView mark = text("Q",32); mark.setGravity(android.view.Gravity.CENTER); mark.setTextColor(0xff4d6bfe);
        mark.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD); mark.setBackground(rounded(0xffeff2ff,0,22));
        LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(dp(64),dp(64)); markParams.gravity=android.view.Gravity.CENTER_HORIZONTAL; form.addView(mark,markParams);
        gap(form,20);
        TextView heading=text("连接工作台",26); heading.setGravity(android.view.Gravity.CENTER); heading.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD); form.addView(heading);
        gap(form,8); TextView subtitle=text("从这里，开始新的对话",14); subtitle.setTextColor(0xff858995); subtitle.setGravity(android.view.Gravity.CENTER); form.addView(subtitle);
        gap(form,32); TextView urlLabel=text("工作台地址",14); form.addView(urlLabel); gap(form,8);
        address=new EditText(this); field(address,"https://example.com/Quayloom",false); address.setText(lastAddress);
        address.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT); urlLabel.setLabelFor(address.getId()); form.addView(address,new LinearLayout.LayoutParams(-1,dp(56)));
        httpHint=text("",13); httpHint.setTextColor(0xffa34725); httpHint.setPadding(0,dp(8),0,0); form.addView(httpHint);
        address.addTextChangedListener(new TextWatcher(){ public void beforeTextChanged(CharSequence s,int a,int c,int f){} public void onTextChanged(CharSequence s,int a,int b,int c){ updateHttpHint(); refreshCredential(false); } public void afterTextChanged(Editable e){} }); updateHttpHint();
        gap(form,24); modes=new RadioGroup(this); modes.setOrientation(RadioGroup.HORIZONTAL); modes.setPadding(dp(4),dp(4),dp(4),dp(4)); modes.setBackground(rounded(0xfff1f2f5,0,28));
        code=new RadioButton(this); code.setId(View.generateViewId()); code.setText("使用码");
        admin=new RadioButton(this); admin.setId(View.generateViewId()); admin.setText("管理员");
        modes.addView(code,new RadioGroup.LayoutParams(0,dp(44),1)); modes.addView(admin,new RadioGroup.LayoutParams(0,dp(44),1)); form.addView(modes);
        modes.check("admin".equals(lastMode) ? admin.getId() : code.getId()); styleMode(code,code.isChecked()); styleMode(admin,admin.isChecked());
        gap(form,20); TextView credentialLabel=text(mode().equals("code") ? "使用码" : "管理员密码",14); form.addView(credentialLabel); gap(form,8);
        credential=new EditText(this); field(credential,mode().equals("code") ? "输入使用码" : "输入管理员密码",true); credentialLabel.setLabelFor(credential.getId());
        credential.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE | android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        credential.setOnEditorActionListener((v,action,event) -> { if(action==android.view.inputmethod.EditorInfo.IME_ACTION_DONE){submit();return true;}return false; });
        form.addView(credential,new LinearLayout.LayoutParams(-1,dp(56)));
        modes.setOnCheckedChangeListener((group,id) -> { credentialLabel.setText(mode().equals("code") ? "使用码" : "管理员密码"); credential.setHint(mode().equals("code") ? "输入使用码" : "输入管理员密码"); styleMode(code,code.isChecked()); styleMode(admin,admin.isChecked()); refreshCredential(true); });
        gap(form,12); remember=new CheckBox(this); remember.setText("记住并填入凭据"); remember.setTextSize(14); remember.setTextColor(0xff646975);
        remember.setSaveEnabled(false); remember.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); form.addView(remember);
        remember.setOnCheckedChangeListener((view,checked) -> {
            if (updatingRemember) return;
            credential.setText("");
            boolean changed = credentialStore.setRemember(checked);
            refreshCredential(true);
            if (!changed) toast("安全存储操作失败，已停止保存；如需彻底清除，请重试或在系统设置中清除此应用数据。");
        });
        storageHint=text("",12); storageHint.setTextColor(0xff858995); form.addView(storageHint);
        status=text("",14); status.setTextColor(0xffac3434); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); status.setPadding(0,dp(12),0,dp(8)); form.addView(status);
        loginButton=button("连接并登录  →",v -> submit()); loginButton.setTextColor(Color.WHITE); loginButton.setBackground(rounded(0xff4d6bfe,0,28)); form.addView(loginButton,new LinearLayout.LayoutParams(-1,dp(54)));
        gap(form,16); TextView privacy=text("仅成功登录后加密保存；填入不会自动登录",12); privacy.setTextColor(0xff858995); privacy.setGravity(android.view.Gravity.CENTER); form.addView(privacy);
        refreshCredential(true);
    }
    private void syncRememberControl() {
        if (remember == null) return;
        updatingRemember = true;
        remember.setChecked(credentialStore.isRemembering());
        remember.setEnabled(!busy && credentialStore.isAvailable());
        updatingRemember = false;
        if (storageHint != null) storageHint.setText(!credentialStore.isAvailable()
            ? "设备安全存储不可用，已停止保存。若清除失败，请在系统设置中清除此应用数据。"
            : credentialStore.isRemembering() ? "仅此设备加密保存，按工作台地址和身份分别填入。关闭将清空输入及全部已保存凭据。"
            : "记住已关闭，凭据仅用于本次登录，不保存。系统自动填充始终禁用。");
    }
    private void refreshCredential(boolean force) {
        if (credential == null || remember == null) return;
        Endpoint target = null;
        try { target = Endpoint.parse(address.getText().toString()); } catch (Exception ignored) { }
        String next = target == null ? "" : target.base + "\n" + mode();
        if (force || !next.equals(credentialScope)) {
            credential.setText(""); // Clear before any lookup, including invalid or unknown addresses.
            credentialScope = next;
            if (target != null && credentialStore.isRemembering()) credential.setText(credentialStore.load(target,mode()));
        }
        syncRememberControl();
    }
    private void updateHttpHint() {
        boolean http = Endpoint.trim(address.getText().toString()).toLowerCase(Locale.ROOT).startsWith("http://");
        httpHint.setText(http ? "不安全：HTTP 不加密，登录凭据和对话可能被网络中的他人读取。" : "");
        httpHint.setVisibility(http ? View.VISIBLE : View.GONE);
    }
    private void submit() {
        if (busy) return;
        final Endpoint target;
        try { target = Endpoint.parse(address.getText().toString()); }
        catch (Exception e) { status.setText("请输入有效的 http/https 工作台地址（含部署路径，不含查询参数）。"); return; }
        final String secret = Endpoint.trim(credential.getText().toString()), selected = mode();
        address.setText(target.base); credential.setText(secret);
        if (secret.isEmpty()) { status.setText(selected.equals("code") ? "请输入使用码" : "请输入管理员密码"); return; }
        if (secret.length() > 1024) { status.setText("登录凭据过长"); return; }
        if (target.isHttp()) {
            new AlertDialog.Builder(this).setTitle("HTTP 连接不安全")
                .setMessage("此地址不会加密登录凭据与对话。仅在信任的网络中使用，建议改为 HTTPS。是否继续？")
                .setNegativeButton("取消",null).setPositiveButton("继续连接",(d,w) -> beginLogin(target,selected,secret)).show();
        } else beginLogin(target,selected,secret);
    }
    private void beginLogin(Endpoint target, String selected, String secret) {
        if (busy || destroyed || secret.isEmpty()) return;
        try {
            if (!target.base.equals(Endpoint.parse(address.getText().toString()).base) || !selected.equals(mode())) {
                refreshCredential(true); status.setText("地址或身份已变化，请重新确认登录。"); return;
            }
        } catch (Exception e) { refreshCredential(true); return; }
        credential.setText(""); busy = true; status.setText("正在连接…"); loginButton.setEnabled(false); address.setEnabled(false); code.setEnabled(false); admin.setEnabled(false); credential.setEnabled(false); syncRememberControl();
        lastAddress = target.base; lastMode = selected;
        preferences.edit().putString("url",lastAddress).putString("mode",lastMode).apply();
        final int request = generation;
        worker.execute(() -> {
            try {
                List<String> cookies = LoginProtocol.login(target,selected,secret);
                runOnUiThread(() -> {
                    if (destroyed || request!=generation) return;
                    CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); AtomicInteger left = new AtomicInteger(cookies.size());
                    final boolean[] accepted = {true};
                    for (String cookie : cookies) cm.setCookie(target.base + "/",cookie,ok -> {
                        accepted[0] &= Boolean.TRUE.equals(ok);
                        if(left.decrementAndGet()==0) {
                            if (destroyed || request!=generation) return;
                            if (!accepted[0] || cm.getCookie(target.base + "/")==null) { loginError("设备未接受登录 Cookie，请检查地址、HTTPS 和系统 WebView。",request); return; }
                            cm.flush();
                            if (!credentialStore.save(target,selected,secret)) toast("登录成功，但设备安全存储不可用；未保存凭据，已停止记住功能。");
                            endpoint=target; busy=false; ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(credential.getWindowToken(),0); showWorkspace();
                        }
                    });
                });
            } catch (LoginProtocol.Failure e) {
                final int status=e.status;
                String message=status==401 ? "登录失败：使用码或密码不正确、已停用或已过期。" : status==429 ? "尝试次数过多，请稍后再试。" : status>=300 && status<400 ? "登录端点发生重定向；请直接填写最终工作台地址。" : "登录失败（HTTP " + status + "）。请检查工作台地址和服务状态。";
                runOnUiThread(() -> loginError(message,request));
            }
            catch (javax.net.ssl.SSLException e) { runOnUiThread(() -> loginError("HTTPS 证书或安全连接验证失败，未绕过证书检查。",request)); }
            catch (Exception e) { runOnUiThread(() -> loginError("无法连接工作台，请检查网络、地址及服务器。",request)); }
        });
    }
    private void loginError(String message,int request) {
        if(destroyed || request!=generation)return; busy=false; status.setText(message); loginButton.setEnabled(true); address.setEnabled(true); code.setEnabled(true); admin.setEnabled(true); credential.setEnabled(true); refreshCredential(true);
    }
    private static final class Api33 {
        static void register(MainActivity activity) { activity.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,activity::goBack); }
    }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain","UTF-8",403,"Blocked by Quayloom",Collections.emptyMap(),new ByteArrayInputStream(new byte[0])); }
    /** Own main-document transport prevents automatic document redirects; CSP protects subresources/forms. */
    private WebResourceResponse document(WebResourceRequest request) {
        final int requestGeneration=generation;
        HttpURLConnection c=null;
        try {
            Endpoint target=endpoint;if(target==null||!target.allows(request.getUrl().toString()))return blocked();
            c=(HttpURLConnection)new URL(request.getUrl().toString()).openConnection();
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);
            for(Map.Entry<String,String> h:request.getRequestHeaders().entrySet()) {
                if(!h.getKey().equalsIgnoreCase("Cookie")&&!h.getKey().equalsIgnoreCase("Accept-Encoding"))c.setRequestProperty(h.getKey(),h.getValue());
            }
            c.setRequestProperty("Accept-Encoding","identity");
            String cookie=CookieManager.getInstance().getCookie(request.getUrl().toString());if(cookie!=null)c.setRequestProperty("Cookie",cookie);
            int code=c.getResponseCode();if(code>=300&&code<400)return blocked();
            Map<String,String> headers=new HashMap<>();
            for(Map.Entry<String,List<String>> h:c.getHeaderFields().entrySet()) {
                if(h.getKey()==null)continue;
                if(h.getKey().equalsIgnoreCase("Set-Cookie")){for(String item:h.getValue())CookieManager.getInstance().setCookie(request.getUrl().toString(),item);}
                else if(!h.getKey().equalsIgnoreCase("Content-Length")&&!h.getKey().equalsIgnoreCase("Transfer-Encoding"))headers.put(h.getKey(),String.join(", ",h.getValue()));
            }
            String scope=target.base+"/";
            String policy="default-src "+scope+"; script-src "+scope+" 'unsafe-inline'; style-src "+scope+" 'unsafe-inline'; img-src "+scope+" data: blob:; font-src "+scope+" data:; connect-src "+scope+"; frame-src "+scope+"; form-action "+scope+"; object-src 'none'; base-uri 'none'; worker-src 'none'";
            String old=null;for(String key:new ArrayList<>(headers.keySet()))if(key.equalsIgnoreCase("Content-Security-Policy")){old=headers.remove(key);}
            headers.put("Content-Security-Policy",old==null?policy:old+", "+policy);
            headers.put("Cache-Control","no-store");
            ByteArrayOutputStream body=new ByteArrayOutputStream();long end=System.nanoTime()+30_000_000_000L;
            InputStream stream=code<400?c.getInputStream():c.getErrorStream();
            if(stream!=null)try(InputStream in=stream){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){if(body.size()+n>8*1024*1024||System.nanoTime()>end)throw new IOException();body.write(b,0,n);}}
            String type=c.getContentType();String mime=type==null?"text/html":type.split(";",2)[0].trim();
            return new WebResourceResponse(mime,"UTF-8",code,code==200?"OK":"Response",headers,new ByteArrayInputStream(body.toByteArray()));
        }catch(javax.net.ssl.SSLException e){runOnUiThread(()->{if(requestGeneration==generation){pageError();toast("HTTPS 证书验证失败，已拒绝连接");}});return blocked();}
        catch(Exception e){runOnUiThread(()->{if(requestGeneration==generation)pageError();});return blocked();}
        finally{if(c!=null)c.disconnect();}
    }
    private boolean allowed(String url) { Endpoint current=endpoint; return current!=null && current.allows(url); }
    private void external(String url) {
        if (!Endpoint.externalHttp(url)) { toast("已阻止非 HTTP/HTTPS 链接"); return; }
        new AlertDialog.Builder(this).setTitle("在系统浏览器打开外部链接？")
            .setMessage("此链接不属于当前工作台的内部地址。\n\n"+url)
            .setNegativeButton("取消",null).setPositiveButton("打开浏览器",(d,w) -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
                catch(android.content.ActivityNotFoundException e) { toast("未找到系统浏览器"); }
            }).show();
    }
    @SuppressWarnings("deprecation") private void showWorkspace() {
        setRoot(); pageFailed=false;
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal); progress.setMax(100);
        FrameLayout workspace=new FrameLayout(this); root.addView(workspace,new LinearLayout.LayoutParams(-1,0,1));
        web = new WebView(this); workspace.addView(web,new FrameLayout.LayoutParams(-1,-1)); web.setSaveEnabled(false);
        FrameLayout.LayoutParams progressParams=new FrameLayout.LayoutParams(-1,dp(2),android.view.Gravity.TOP); workspace.addView(progress,progressParams);
        final WebView workspaceWeb=web; final int workspaceGeneration=generation;
        errorPanel=new LinearLayout(this); errorPanel.setOrientation(LinearLayout.VERTICAL); errorPanel.setGravity(android.view.Gravity.CENTER);
        errorPanel.setPadding(dp(32),dp(24),dp(32),dp(24)); errorPanel.setBackgroundColor(Color.WHITE); errorPanel.setVisibility(View.GONE);
        TextView errorTitle=text("暂时无法打开工作台",21); errorTitle.setGravity(android.view.Gravity.CENTER); errorPanel.addView(errorTitle); gap(errorPanel,12);
        TextView errorText=text("检查网络或工作台地址后重试",14); errorText.setGravity(android.view.Gravity.CENTER); errorText.setTextColor(0xff858995); errorPanel.addView(errorText); gap(errorPanel,24);
        errorPanel.addView(button("重新加载",v -> reloadWorkspace()),new LinearLayout.LayoutParams(dp(180),dp(48))); gap(errorPanel,12);
        errorPanel.addView(button("客户端设置",v -> workspaceMenu()),new LinearLayout.LayoutParams(dp(180),dp(48)));
        workspace.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings=web.getSettings(); settings.setUserAgentString(settings.getUserAgentString()+" QuayloomAndroid/"+BuildInfo.VERSION); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false); settings.setMediaPlaybackRequiresUserGesture(true); settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false); CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        ServiceWorkerController sw=ServiceWorkerController.getInstance(); sw.getServiceWorkerWebSettings().setAllowFileAccess(false); sw.getServiceWorkerWebSettings().setAllowContentAccess(false);
        sw.setServiceWorkerClient(new ServiceWorkerClient(){ @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request){ return allowed(request.getUrl().toString()) ? null : blocked(); } });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){ if(view!=web)return; progress.setProgress(value); progress.setVisibility(value<100 && !pageFailed ? View.VISIBLE : View.INVISIBLE); }
        }); // No permission grants, file chooser or JS bridge.
        web.setDownloadListener((url,userAgent,contentDisposition,mimetype,length) -> external(url));
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if (isReservedSignal(uri)) {
                    if (isExactMenuSignal(view,request,workspaceWeb,workspaceGeneration)) workspaceMenu();
                    return true;
                }
                String url=uri.toString(); if(allowed(url))return false;
                if(request.isForMainFrame())external(url);return true;
            }
            @Override @SuppressWarnings("deprecation") public boolean shouldOverrideUrlLoading(WebView view,String url){
                if (isReservedSignal(Uri.parse(url))) return true;
                if (allowed(url)) return false;
                external(url); return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if(isReservedSignal(request.getUrl()))return blocked();
                if(!allowed(request.getUrl().toString()))return blocked();
                if(request.isForMainFrame())return request.getMethod().equals("GET")?document(request):blocked();
                return null;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){ if(view!=web)return; pageFailed=false; errorPanel.setVisibility(View.GONE); }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){ handler.cancel(); if(view!=web)return; pageError(); toast("HTTPS 证书验证失败，已阻止加载"); }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){ if(view==web && request.isForMainFrame())pageError(); }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){ if(view==web && request.isForMainFrame() && response.getStatusCode()>=400)pageError(); }
            @Override public void onPageFinished(WebView view,String url){ if(view!=web)return; progress.setVisibility(View.INVISIBLE); if(allowed(url))CookieManager.getInstance().flush(); }
        });
        web.loadUrl(endpoint.base + "/");
    }
    private boolean isReservedSignal(Uri uri) {
        Endpoint current=endpoint; if(current==null || uri==null)return false;
        try {
            Uri base=Uri.parse(current.base); String path=uri.getPath(); String reserved=base.getPath();
            if(reserved==null)reserved=""; if(reserved.endsWith("/"))reserved=reserved.substring(0,reserved.length()-1);
            return path!=null && (path.equals(reserved+"/__quayloom_android/menu") || path.startsWith(reserved+"/__quayloom_android/"));
        } catch(Exception e) { return false; }
    }
    private boolean isExactMenuSignal(WebView view,WebResourceRequest request,WebView currentWeb,int currentGeneration) {
        if(destroyed || view!=web || view!=currentWeb || generation!=currentGeneration || !request.isForMainFrame() || !request.hasGesture())return false;
        if(!"GET".equalsIgnoreCase(request.getMethod()))return false;
        Uri u=request.getUrl(); Endpoint current=endpoint; if(current==null || u==null || u.isOpaque() || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null)return false;
        Uri expected=Uri.parse(current.base+"/__quayloom_android/menu");
        return u.getScheme()!=null && u.getScheme().equalsIgnoreCase(expected.getScheme()) && u.getHost()!=null && u.getHost().equalsIgnoreCase(expected.getHost()) && u.getPort()==expected.getPort() && current.allows(u.toString()) && u.getEncodedPath()!=null && u.getEncodedPath().equals(expected.getEncodedPath());
    }
    private void pageError() { if(destroyed || web==null)return; pageFailed=true; errorPanel.setVisibility(View.VISIBLE); progress.setVisibility(View.INVISIBLE); }
    private void reloadWorkspace() { if(web==null)return; pageFailed=false; errorPanel.setVisibility(View.GONE); web.loadUrl(endpoint.base+"/"); }
    private void workspaceMenu() {
        new AlertDialog.Builder(this).setTitle("工作台")
            .setItems(new String[]{"连接信息", "刷新页面", "更换工作台", "退出并清除设备会话", "源码与许可"},(d,item)->{
                if(item==0)new AlertDialog.Builder(this).setTitle(endpoint.isHttp()?"HTTP · 未加密":"HTTPS 连接").setMessage(endpoint.base).setPositiveButton("关闭",null).show();
                else if(item==1)reloadWorkspace(); else if(item==2)leaveWorkspace(); else if(item==3)logoutDevice(); else sourceMenu();
            }).show();
    }
    private void logoutDevice() {
        new AlertDialog.Builder(this).setTitle("退出此设备？")
            .setMessage("将关闭工作台，关闭记住功能并删除所有已保存的加密凭据及专用密钥，同时清除此应用中所有工作台的 Cookie、缓存和站点数据，包括仅保存在本机的聊天记录。服务器记录不会删除。")
            .setNegativeButton("取消",null).setPositiveButton("退出并清除",(d,w)->{
                if(web!=null){web.stopLoading();web.clearCache(true);web.clearHistory();}
                final boolean credentialsCleared = credentialStore.clearAll();
                if(credential!=null)credential.setText("");
                showForm(); busy=true; loginButton.setEnabled(false); address.setEnabled(false); code.setEnabled(false); admin.setEnabled(false); credential.setEnabled(false); syncRememberControl(); status.setText("正在清除设备会话…");
                android.webkit.WebStorage.getInstance().deleteAllData();
                CookieManager.getInstance().removeAllCookies(ok->{ CookieManager.getInstance().flush(); if(!destroyed && web==null){busy=false;loginButton.setEnabled(true);address.setEnabled(true);code.setEnabled(true);admin.setEnabled(true);credential.setEnabled(true);syncRememberControl();status.setText(credentialsCleared ? "" : "安全存储清除失败，已停止保存；请在系统设置中清除此应用数据。");} });
            }).show();
    }
    private void leaveWorkspace() {
        new AlertDialog.Builder(this).setTitle("返回地址页？").setMessage("当前页面会关闭，工作台会话及站点数据仍保留。需要清除登录状态时，请使用菜单中的退出操作。")
            .setNegativeButton("取消",null).setPositiveButton("返回地址页",(d,w)->showForm()).show();
    }
    private void goBack() {
        if(android.os.Build.VERSION.SDK_INT>=30 && root!=null && root.getRootWindowInsets()!=null && root.getRootWindowInsets().isVisible(WindowInsets.Type.ime())) {
            ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(),0); return;
        }
        if(android.os.Build.VERSION.SDK_INT<30 && root!=null) {
            android.graphics.Rect visible=new android.graphics.Rect(); getWindow().getDecorView().getWindowVisibleDisplayFrame(visible);
            if(getWindow().getDecorView().getHeight()-visible.height()>dp(180)) {
                ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(),0); return;
            }
        }
        if(web!=null && web.canGoBack())web.goBack();else if(web!=null)leaveWorkspace();else super.onBackPressed(); }
    @Override public void onBackPressed(){ goBack(); }
    @Override public void onConfigurationChanged(Configuration config){ super.onConfigurationChanged(config); if(root!=null)root.requestApplyInsets(); }
    @Override protected void onSaveInstanceState(Bundle state){
        if(address!=null && web==null){ lastAddress=Endpoint.trim(address.getText().toString());lastMode=mode(); }
        state.putString("url",lastAddress);state.putString("mode",lastMode);super.onSaveInstanceState(state);
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=SOURCE_REQUEST || result!=RESULT_OK || data==null || data.getData()==null)return;
        final Uri destination=data.getData();
        worker.execute(()->{
            try(InputStream in=getAssets().open("source.zip");OutputStream out=getContentResolver().openOutputStream(destination,"w")){
                if(out==null)throw new IOException();byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);
                runOnUiThread(()->toast("对应源码已保存"));
            }catch(Exception e){runOnUiThread(()->toast("源码保存失败，请重试或检查存储空间"));}
        });
    }
    private void toast(String message){ if(!destroyed)Toast.makeText(this,message,Toast.LENGTH_LONG).show(); }
    @Override protected void onDestroy(){ destroyed=true;generation++;if(web!=null){web.stopLoading();web.destroy();web=null;}worker.shutdownNow();super.onDestroy(); }
}
