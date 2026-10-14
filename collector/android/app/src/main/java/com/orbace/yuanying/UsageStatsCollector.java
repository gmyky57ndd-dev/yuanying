package com.orbace.yuanying;

import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public class UsageStatsCollector {

    private static final String TAG = "UsageStatsCollector";
    private static final long MIN_FOREGROUND_MS = 60_000;  // 1 分钟

    private final Context ctx;

    public UsageStatsCollector(Context ctx) {
        this.ctx = ctx;
    }

    public JSONObject collectLastHour() throws Exception {
        UsageStatsManager usm = (UsageStatsManager)
            ctx.getSystemService(Context.USAGE_STATS_SERVICE);

        long now = System.currentTimeMillis();
        long oneHourAgo = now - 60L * 60L * 1000L;

        // Defensive clamp: an app cannot exceed the window length.
        int windowMinutes = (int) ((now - oneHourAgo) / 60_000L);

        Map<String, UsageStats> stats = usm.queryAndAggregateUsageStats(
            oneHourAgo, now
        );

        JSONArray apps = new JSONArray();

        for (Map.Entry<String, UsageStats> entry : stats.entrySet()) {
            UsageStats s = entry.getValue();
            long fg = s.getTotalTimeInForeground();

            if (fg < MIN_FOREGROUND_MS) continue;

            // 跳过系统 UI 和自身
            String pkg = s.getPackageName();
            if (pkg.equals("com.android.systemui")) continue;
            if (pkg.equals(ctx.getPackageName())) continue;

            long rawMinutes = fg / 60_000;
            long clampedMinutes = Math.min(rawMinutes, windowMinutes);

            JSONObject app = new JSONObject();
            app.put("package", pkg);
            app.put("name", resolveAppName(pkg));
            app.put("foreground_min", clampedMinutes);
            apps.put(app);
        }

        JSONObject payload = new JSONObject();
        payload.put("platform", "android");
        payload.put("window_start", iso8601(oneHourAgo));
        payload.put("window_end", iso8601(now));
        payload.put("apps", apps);

        return payload;
    }

    private String resolveAppName(String pkg) {
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    private String iso8601(long ms) {
        SimpleDateFormat fmt = new SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US
        );
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date(ms));
    }
}
