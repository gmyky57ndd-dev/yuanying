package com.yourorg.yuanying.collector;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Self-update via GitHub Releases (public repo). Checks the latest release
 * tag against the installed version; if newer, downloads the APK and hands
 * it to the system installer. Android does not allow silent sideload
 * installs, so the user confirms the final "Install" tap.
 */
public class UpdateChecker {

    private static final String TAG = "UpdateChecker";
    private static final String LATEST_API =
        "https://api.github.com/repos/gmyky57ndd-dev/yuanying/releases/latest";

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build();

    public static int compareVersions(String a, String b) {
        String[] pa = a.replaceAll("^v", "").split("\\.");
        String[] pb = b.replaceAll("^v", "").split("\\.");
        int n = Math.max(pa.length, pb.length);
        for (int i = 0; i < n; i++) {
            int x = i < pa.length ? parseIntSafe(pa[i]) : 0;
            int y = i < pb.length ? parseIntSafe(pb[i]) : 0;
            if (x != y) return Integer.compare(x, y);
        }
        return 0;
    }

    private static int parseIntSafe(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    public void checkAsync(Activity activity) {
        new Thread(() -> {
            try {
                Request req = new Request.Builder()
                    .url(LATEST_API)
                    .header("Accept", "application/vnd.github+json")
                    .build();

                try (Response res = client.newCall(req).execute()) {
                    if (!res.isSuccessful() || res.body() == null) return;

                    JSONObject json = new JSONObject(res.body().string());
                    String tag = json.optString("tag_name", "");
                    String current = BuildConfig.VERSION_NAME;

                    if (tag.isEmpty() || compareVersions(tag, current) <= 0) {
                        Log.i(TAG, "up to date (" + current + ")");
                        return;
                    }

                    JSONArray assets = json.optJSONArray("assets");
                    String apkUrl = null;
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject a = assets.getJSONObject(i);
                            String name = a.optString("name", "");
                            if (name.endsWith(".apk")) {
                                apkUrl = a.optString("browser_download_url");
                                break;
                            }
                        }
                    }
                    if (apkUrl == null) return;

                    final String url = apkUrl;
                    final String version = tag;
                    activity.runOnUiThread(() -> prompt(activity, version, url));
                }
            } catch (Exception e) {
                Log.w(TAG, "update check failed", e);
            }
        }).start();
    }

    private void prompt(Activity activity, String version, String url) {
        new AlertDialog.Builder(activity)
            .setTitle("发现新版本 " + version)
            .setMessage("是否下载并安装？")
            .setPositiveButton("更新", (d, w) -> downloadAndInstall(activity, url))
            .setNegativeButton("稍后", null)
            .show();
    }

    private void downloadAndInstall(Activity activity, String url) {
        new Thread(() -> {
            try {
                File dir = new File(activity.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) return;
                File apk = new File(dir, "yuanying-collector.apk");

                Request req = new Request.Builder().url(url).build();
                try (Response res = client.newCall(req).execute()) {
                    if (!res.isSuccessful() || res.body() == null) return;
                    try (InputStream in = res.body().byteStream();
                         FileOutputStream out = new FileOutputStream(apk)) {
                        byte[] buf = new byte[8192];
                        int r;
                        while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
                    }
                }

                activity.runOnUiThread(() -> install(activity, apk));
            } catch (Exception e) {
                Log.e(TAG, "download failed", e);
            }
        }).start();
    }

    private void install(Activity activity, File apk) {
        Uri uri = FileProvider.getUriForFile(
            activity,
            activity.getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
    }
}
