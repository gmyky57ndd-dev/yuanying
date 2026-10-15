package com.orbace.yuanying;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ApiClient {

    // TODO: 改成你的 Vercel 生产域名
    public static final String BASE_URL = "https://yuanying-rust.vercel.app";

    private static final MediaType JSON =
        MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build();

    public boolean post(String url, JSONObject payload) {
        try {
            RequestBody body = RequestBody.create(payload.toString(), JSON);

            Request req = new Request.Builder()
                .url(url)
                .post(body)
                .build();

            try (Response res = client.newCall(req).execute()) {
                return res.isSuccessful();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public String get(String url) {
        try {
            Request req = new Request.Builder().url(url).get().build();
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
            Request req = new Request.Builder().url(url).post(body).build();
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
            Request req = new Request.Builder().url(url).put(body).build();
            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) return null;
                return res.body().string();
            }
        } catch (Exception e) {
            return null;
        }
    }
}
