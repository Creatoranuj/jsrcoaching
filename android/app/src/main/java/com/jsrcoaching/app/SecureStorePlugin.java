package com.jsrcoaching.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hardware-backed key/value store for the Supabase auth session.
 *
 * WHY THIS EXISTS
 * ---------------
 * The session token used to live in WebView `localStorage` (and, in an earlier
 * attempt, in `@capacitor/preferences`). Neither is encrypted: Preferences is a
 * plain SharedPreferences XML file and localStorage is a plain SQLite file, both
 * inside app-private storage. App-private storage is fine against another app on
 * a healthy device, but on a rooted/unlocked device — or through any backup or
 * forensic dump — the refresh token is readable in clear text.
 *
 * `EncryptedSharedPreferences` encrypts BOTH keys and values with an AES-256
 * master key held in the Android Keystore, which on virtually every modern
 * device is backed by the TEE/StrongBox and cannot be exported even with root.
 *
 * FAILURE POLICY
 * --------------
 * A handful of OEM builds ship a broken Keystore; `EncryptedSharedPreferences`
 * then throws on create. We reject the call instead of silently writing
 * plaintext, and the JS layer (`src/lib/nativeStorage.ts`) falls back to
 * Preferences so the student can still log in. Security degrades, login never
 * breaks.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String FILE_NAME = "nb_secure_store";

    private SharedPreferences prefs;

    private synchronized SharedPreferences store() throws Exception {
        if (prefs != null) return prefs;
        Context ctx = getContext();
        MasterKey masterKey = new MasterKey.Builder(ctx, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        prefs = EncryptedSharedPreferences.create(
                ctx,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        return prefs;
    }

    /** JS calls this once per boot to decide whether to use this plugin at all. */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        try {
            store();
            result.put("available", true);
        } catch (Exception e) {
            // Never surface the exception text: it can contain key aliases.
            result.put("available", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key required"); return; }
        try {
            JSObject result = new JSObject();
            result.put("value", store().getString(key, null));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("secure-store-unavailable");
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("key and value required"); return; }
        try {
            // commit() (not apply()) so a process death right after login cannot
            // lose the session that the JS layer already considers persisted.
            store().edit().putString(key, value).commit();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure-store-unavailable");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key required"); return; }
        try {
            store().edit().remove(key).commit();
            call.resolve();
        } catch (Exception e) {
            call.reject("secure-store-unavailable");
        }
    }
}
