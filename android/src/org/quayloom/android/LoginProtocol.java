// SPDX-License-Identifier: AGPL-3.0-only
package org.quayloom.android;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Native login transport. Default HTTPS validation; redirects are never followed. */
public final class LoginProtocol {
    private LoginProtocol() {}
    public static final class Failure extends IOException { public final int status; Failure(int status){ super("HTTP "+status);this.status=status; } }
    private static String quote(String s) {
        StringBuilder b=new StringBuilder("\"");
        for(int i=0;i<s.length();i++){
            char c=s.charAt(i);
            if(c=='"'||c=='\\')b.append('\\').append(c);
            else if(c<32)b.append(String.format(java.util.Locale.ROOT,"\\u%04x",(int)c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    public static List<String> login(Endpoint target,String mode,String credential) throws IOException {
        if(!mode.equals("code")&&!mode.equals("admin"))throw new IllegalArgumentException("Invalid mode");
        String normalized=Endpoint.trim(credential);
        if(normalized.isEmpty()||normalized.length()>1024)throw new IllegalArgumentException("Invalid credential length");
        byte[] payload=("{\"mode\":"+quote(mode)+","+quote(mode.equals("code")?"code":"password")+":"+quote(normalized)+"}").getBytes(StandardCharsets.UTF_8);
        HttpURLConnection c=null;long deadline=System.nanoTime()+30_000_000_000L;
        try {
            c=(HttpURLConnection)new URL(target.base+"/api/auth/login").openConnection();
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);
            c.setRequestMethod("POST");c.setRequestProperty("Origin",target.origin);
            c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.setRequestProperty("Accept","application/json");
            c.setDoOutput(true);c.setFixedLengthStreamingMode(payload.length);
            try(OutputStream out=c.getOutputStream()){out.write(payload);}
            int status=c.getResponseCode();List<String> cookies=new ArrayList<>();
            for(Map.Entry<String,List<String>> h:c.getHeaderFields().entrySet())if(h.getKey()!=null&&h.getKey().equalsIgnoreCase("Set-Cookie"))cookies.addAll(h.getValue());
            try(InputStream in=status<400?c.getInputStream():c.getErrorStream()){
                if(in!=null){byte[] b=new byte[2048];int total=0,n;while((n=in.read(b))!=-1){total+=n;if(total>65536||System.nanoTime()>deadline)throw new IOException("Response limit");}}
            }
            if(status!=200)throw new Failure(status);
            if(cookies.isEmpty())throw new IOException("Missing login cookie");
            return cookies;
        } finally {Arrays.fill(payload,(byte)0);if(c!=null)c.disconnect();}
    }
}
