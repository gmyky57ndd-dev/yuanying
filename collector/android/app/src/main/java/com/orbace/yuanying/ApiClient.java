package com.orbace.yuanying;

import android.content.Context;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ApiClient {

    /**
     * ES-076: during the Vercel pause the base URL is the local Cloudflare
     * tunnel. It is a BuildConfig default, overridable at runtime through the
     * "api_base" SharedPreferences key (set with an intent extra so a new
     * tunnel URL does not require a rebuild).
     */
    public static String BASE_URL = BuildConfig.API_BASE_URL;

    public static void init(Context context) {
        try {
            String override = context
                .getSharedPreferences("yuanying_api", Context.MODE_PRIVATE)
                .getString("api_base", null);
            if (override != null && override.startsWith("http")) {
                BASE_URL = override.replaceAll("/+$", "");
            }
        } catch (Exception ignored) {
        }
    }

    public static void setBaseUrl(Context context, String url) {
        if (url == null || !url.startsWith("http")) return;
        String clean = url.replaceAll("/+$", "");
        context.getSharedPreferences("yuanying_api", Context.MODE_PRIVATE)
            .edit().putString("api_base", clean).apply();
        BASE_URL = clean;
    }

    // ES-004: bearer token injected at build time (empty until configured).
    private static final String API_TOKEN = BuildConfig.API_TOKEN;

    private static final MediaType JSON =
        MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build();

    private Request.Builder auth(Request.Builder b) {
        if (API_TOKEN != null && !API_TOKEN.isEmpty()) {
            b.header("Authorization", "Bearer " + API_TOKEN);
        }
        return b;
    }

    public boolean post(String url, JSONObject payload) {
        try {
            RequestBody body = RequestBody.create(payload.toString(), JSON);
            Request req = auth(new Request.Builder().url(url).post(body)).build();
            try (Response res = client.newCall(req).execute()) {
                return res.isSuccessful();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public String get(String url) {
        try {
            Request req = auth(new Request.Builder().url(url).get()).build();
            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) return null;
                return res.body().string();
            }
        } catch (Exception e) {
            return null;
        }
    }

    public String postForBody(String url, JSONObject payload) {
        try {
            RequestBody body = RequestBody.create(payload.toString(), JSON);
            Request req = auth(new Request.Builder().url(url).post(body)).build();
            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) return null;
                return res.body().string();
            }
        } catch (Exception e) {
            return null;
        }
    }

    public String put(String url, JSONObject payload) {
        try {
            RequestBody body = RequestBody.create(payload.toString(), JSON);
            Request req = auth(new Request.Builder().url(url).put(body)).build();
            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) return null;
                return res.body().string();
            }
        } catch (Exception e) {
            return null;
        }
    }
}
