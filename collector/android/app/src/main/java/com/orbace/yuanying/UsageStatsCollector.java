package com.orbace.yuanying;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public class UsageStatsCollector {

    private static final long MIN_FOREGROUND_MS = 60_000;  // 1 分钟

    private final Context ctx;

    public UsageStatsCollector(Context ctx) {
        this.ctx = ctx;
    }

    /**
     * Computes exact per-window foreground time by walking raw usage events.
     * queryAndAggregateUsageStats() returns cumulative totals on some ROMs
     * (see TRACKING #B-15), so we derive deltas from ACTIVITY_RESUMED/PAUSED
     * (and the API<29 MOVE_TO_FOREGROUND/BACKGROUND aliases).
     */
    public JSONObject collectLastHour() throws Exception {
        UsageStatsManager usm = (UsageStatsManager)
            ctx.getSystemService(Context.USAGE_STATS_SERVICE);

        long now = System.currentTimeMillis();
        long start = now - 60L * 60L * 1000L;
        int windowMinutes = (int) ((now - start) / 60_000L);

        UsageEvents events = usm.queryEvents(start, now);
        UsageEvents.Event event = new UsageEvents.Event();

        Map<String, Long> foregroundStart = new HashMap<>();
        Map<String, Long> totalByPackage = new HashMap<>();

        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            String pkg = event.getPackageName();
            long ts = event.getTimeStamp();
            int type = event.getEventType();

            if (type == UsageEvents.Event.ACTIVITY_RESUMED
                || type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                foregroundStart.put(pkg, ts);
            } else if (type == UsageEvents.Event.ACTIVITY_PAUSED
                || type == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                Long s = foregroundStart.remove(pkg);
                if (s != null) {
                    totalByPackage.put(pkg, get(totalByPackage, pkg) + (ts - s));
                }
            }
        }

        // Close any interval still open at `now`.
        for (Map.Entry<String, Long> e : foregroundStart.entrySet()) {
            String pkg = e.getKey();
            totalByPackage.put(pkg, get(totalByPackage, pkg) + (now - e.getValue()));
        }

        JSONArray apps = new JSONArray();

        for (Map.Entry<String, Long> e : totalByPackage.entrySet()) {
            String pkg = e.getKey();
            long totalMs = e.getValue();

            if (totalMs < MIN_FOREGROUND_MS) continue;

            // 跳过系统 UI 和自身
            if (pkg.equals("com.android.systemui")) continue;
            if (pkg.equals(ctx.getPackageName())) continue;

            // Defensive clamp: never exceed the window length.
            long rawMinutes = totalMs / 60_000;
            long clampedMinutes = Math.min(rawMinutes, windowMinutes);

            JSONObject app = new JSONObject();
            app.put("package", pkg);
            app.put("name", resolveAppName(pkg));
            app.put("foreground_min", clampedMinutes);
            apps.put(app);
        }

        JSONObject payload = new JSONObject();
        payload.put("platform", "android");
        payload.put("window_start", iso8601(start));
        payload.put("window_end", iso8601(now));
        payload.put("apps", apps);

        return payload;
    }

    private static long get(Map<String, Long> m, String k) {
        Long v = m.get(k);
        return v == null ? 0L : v;
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
