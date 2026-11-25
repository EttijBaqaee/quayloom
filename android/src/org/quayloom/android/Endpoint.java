// SPDX-License-Identifier: AGPL-3.0-only
package org.quayloom.android;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Canonical browser origin and a deliberately narrow deployment path. No Android dependency. */
public final class Endpoint {
    public final String base, origin, path;
    private final String scheme, host;
    private final int port;
    private Endpoint(String base, String origin, String path, String scheme, String host, int port) {
        this.base = base; this.origin = origin; this.path = path;
        this.scheme = scheme; this.host = host; this.port = port;
    }
    public static String trim(String text) {
        int start = 0, end = text.length();
        while (start < end) { int c = text.codePointAt(start); if (!space(c)) break; start += Character.charCount(c); }
        while (end > start) { int c = text.codePointBefore(end); if (!space(c)) break; end -= Character.charCount(c); }
        return text.substring(start, end);
    }
    private static boolean space(int c) { return Character.isWhitespace(c) || Character.isSpaceChar(c) || c == 0x85 || c == 0xfeff; }
    private static int port(URI u) { return u.getPort() == -1 ? ("https".equalsIgnoreCase(u.getScheme()) ? 443 : 80) : u.getPort(); }
    public static Endpoint parse(String value) throws URISyntaxException {
        String input = trim(value);
        if (input.length() > 2048 || input.indexOf('\\') >= 0) throw new URISyntaxException("", "网址无效");
        URI u = new URI(input);
        String s = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (!(s.equals("http") || s.equals("https")) || u.getHost() == null || u.getRawUserInfo() != null
                || u.getRawQuery() != null || u.getRawFragment() != null || u.getPort() == 0 || u.getPort() > 65535)
            throw new URISyntaxException("", "需要无用户名、查询参数或片段的 http/https 工作台地址");
        String p = u.getRawPath() == null ? "" : u.getRawPath();
        while (p.endsWith("/")) p = p.substring(0, p.length() - 1);
        if (!p.isEmpty() && !p.matches("(?:/[A-Za-z0-9_-]+)+")) throw new URISyntaxException("", "路径只能包含字母、数字、短横线和下划线");
        String h = u.getHost().toLowerCase(Locale.ROOT);
        int n = port(u), explicit = n == (s.equals("https") ? 443 : 80) ? -1 : n;
        String o = new URI(s, null, h, explicit, null, null, null).toASCIIString();
        return new Endpoint(o + p, o, p, s, h, n);
    }
    public boolean isHttp() { return scheme.equals("http"); }
    public boolean allows(String value) {
        try {
            URI u = new URI(value);
            if (!scheme.equalsIgnoreCase(u.getScheme()) || u.getHost() == null || !host.equalsIgnoreCase(u.getHost())
                    || port(u) != port || u.getRawUserInfo() != null || value.indexOf('\\') >= 0) return false;
            String raw = u.getRawPath() == null ? "/" : u.getRawPath();
            String p = u.getPath() == null ? "/" : u.getPath();
            String lower = raw.toLowerCase(Locale.ROOT);
            if (lower.contains("%2f") || lower.contains("%5c") || lower.contains("%25") || lower.contains("%00")
                    || p.indexOf('\\') >= 0 || p.matches(".*(?:^|/)\\.\\.?(?:/|$).*")) return false;
            return path.isEmpty() || p.equals(path) || p.startsWith(path + "/");
        } catch (URISyntaxException | IllegalArgumentException e) { return false; }
    }
    public static boolean externalHttp(String value) {
        try { URI u = new URI(value); return ("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme()))
                && u.getHost() != null && u.getRawUserInfo() == null && value.indexOf('\\') < 0; }
        catch (Exception e) { return false; }
    }
}
