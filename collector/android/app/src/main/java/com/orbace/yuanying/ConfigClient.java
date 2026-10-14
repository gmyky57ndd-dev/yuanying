package com.orbace.yuanying;

import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class ConfigClient {

    private static final String CONFIG_URL = ApiClient.BASE_URL + "/api/config";

    private final OkHttpClient client = new OkHttpClient();

    public boolean isCollectionEnabled() {
        try {
            Request req = new Request.Builder()
                .url(CONFIG_URL)
                .get()
                .build();

            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    // 网络失败时默认开启（保守策略）
                    return true;
                }

                JSONObject json = new JSONObject(res.body().string());
                return json.optBoolean("activity_collection_enabled", true);
            }
        } catch (Exception e) {
            return true;  // 失败时默认开启
        }
    }

    /** Full config JSON (for reminders_enabled etc.). Empty object on failure. */
    public JSONObject getConfig() {
        try {
            Request req = new Request.Builder()
                .url(CONFIG_URL)
                .get()
                .build();

            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    return new JSONObject();
                }
                return new JSONObject(res.body().string());
            }
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
