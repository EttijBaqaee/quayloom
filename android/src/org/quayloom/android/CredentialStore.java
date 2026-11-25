// SPDX-License-Identifier: AGPL-3.0-only
package org.quayloom.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-controlled filling only. Disk contains a preference and authenticated ciphertext, never a secret. */
final class CredentialStore {
    private static final String ALIAS = "org.quayloom.android.credentials.v1";
    private static final String REMEMBER = "remember";
    private final SharedPreferences preferences;
    private boolean remember, available = true;

    CredentialStore(Context context) {
        preferences = context.getSharedPreferences("encrypted_credentials", Context.MODE_PRIVATE);
        remember = preferences.getBoolean(REMEMBER, true);
        if (remember) {
            try { key(true); }
            catch (Exception e) { failClosed(); }
        }
    }
    boolean isRemembering() { return remember && available; }
    boolean isAvailable() { return available; }

    boolean setRemember(boolean enabled) {
        if (!enabled) return clearAll();
        if (!available) return false;
        try {
            key(true);
            if (!preferences.edit().putBoolean(REMEMBER, true).commit()) throw new GeneralSecurityException();
            remember = true;
            return true;
        } catch (Exception e) { failClosed(); return false; }
    }

    /** Clear all endpoints/modes, not just the visible record. Also destroy the dedicated wrapping key. */
    boolean clearAll() {
        remember = false;
        boolean cleared = false, deleted = false;
        try { cleared = preferences.edit().clear().putBoolean(REMEMBER, false).commit(); }
        catch (Exception ignored) { /* Still attempt cryptographic erasure. */ }
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS);
            deleted = true;
        } catch (Exception ignored) { /* Never log keys, ciphertext or credentials. */ }
        if (!cleared || !deleted) available = false;
        return cleared && deleted;
    }
    private void failClosed() { available = false; clearAll(); }

    String load(Endpoint target, String mode) {
        if (!isRemembering()) return "";
        byte[] plain = null;
        try {
            byte[] binding = binding(target, mode);
            String record = preferences.getString(recordKey(binding), null);
            if (record == null) return "";
            if (record.length() > 8192) throw new GeneralSecurityException();
            String[] parts = record.split(":", -1);
            if (parts.length != 3 || !parts[0].equals("1")) throw new GeneralSecurityException();
            byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(parts[2], Base64.NO_WRAP);
            if (iv.length != 12 || encrypted.length < 16) throw new GeneralSecurityException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(binding);
            plain = cipher.doFinal(encrypted);
            String value = new String(plain, StandardCharsets.UTF_8);
            if (value.isEmpty() || value.length() > 1024 || !value.equals(Endpoint.trim(value))) throw new GeneralSecurityException();
            return value;
        } catch (Exception e) { failClosed(); return ""; }
        finally { if (plain != null) Arrays.fill(plain, (byte)0); }
    }

    /** Call only after successful native login AND successful CookieManager acceptance. */
    boolean save(Endpoint target, String mode, String value) {
        if (!isRemembering()) return true;
        byte[] plain = null;
        try {
            if (value.isEmpty() || value.length() > 1024 || !value.equals(Endpoint.trim(value))) throw new GeneralSecurityException();
            byte[] binding = binding(target, mode);
            plain = value.getBytes(StandardCharsets.UTF_8);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // AndroidKeyStore generates a fresh randomized IV; never supply/reuse an encryption IV.
            cipher.init(Cipher.ENCRYPT_MODE, key(false));
            cipher.updateAAD(binding);
            byte[] encrypted = cipher.doFinal(plain);
            if (cipher.getIV().length != 12) throw new GeneralSecurityException();
            String record = "1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            if (!preferences.edit().putString(recordKey(binding), record).commit()) throw new GeneralSecurityException();
            return true;
        } catch (Exception e) { failClosed(); return false; }
        finally { if (plain != null) Arrays.fill(plain, (byte)0); }
    }
    private static byte[] binding(Endpoint target, String mode) {
        if (!mode.equals("code") && !mode.equals("admin")) throw new IllegalArgumentException();
        // Endpoint.base includes canonical scheme, host, effective port and case-sensitive deployment path.
        return ("Quayloom credentials v1\n" + target.base + "\n" + mode).getBytes(StandardCharsets.UTF_8);
    }
    private static String recordKey(byte[] binding) throws GeneralSecurityException {
        return "entry." + Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(binding), Base64.NO_WRAP);
    }
    private static SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        Key existing = store.getKey(ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey)existing;
        if (existing != null || !create) throw new GeneralSecurityException();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(false).build());
        return generator.generateKey();
    }
}
