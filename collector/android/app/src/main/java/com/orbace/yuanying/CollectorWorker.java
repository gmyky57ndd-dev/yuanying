package com.orbace.yuanying;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class CollectorWorker extends Worker {

    private static final String TAG = "CollectorWorker";

    public CollectorWorker(@NonNull Context ctx, @NonNull WorkerParameters p) {
        super(ctx, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();

        // ES-040 / Issue #54: heartbeat so the PWA can show version + last report.
        try {
            JSONObject heartbeat = new JSONObject();
            heartbeat.put("collector_version", BuildConfig.VERSION_NAME);
            heartbeat.put("collector_version_code", BuildConfig.VERSION_CODE);
            SimpleDateFormat fmt = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            heartbeat.put("collector_last_report_at", fmt.format(new Date()));
            heartbeat.put(
                "overlay_active",
                ctx.getSharedPreferences("yuanying_overlay", Context.MODE_PRIVATE)
                    .getBoolean("active", false)
            );
            new ApiClient().put(ApiClient.BASE_URL + "/api/config", heartbeat);
        } catch (Exception e) {
            Log.w(TAG, "heartbeat failed", e);
        }

        try {
            // 1. 检查开关
            ConfigClient config = new ConfigClient();
            if (!config.isCollectionEnabled()) {
                Log.i(TAG, "collection disabled, skipping");
                return Result.success();
            }

            ApiClient api = new ApiClient();
            boolean okUsage = true;

            // 2. App usage
            JSONObject payload = new UsageStatsCollector(ctx).collectLastHour();
            int appCount = payload.getJSONArray("apps").length();
            if (appCount > 0) {
                okUsage = api.post(ApiClient.BASE_URL + "/api/activity", payload);
                Log.i(TAG, "usage posted: " + okUsage + " (" + appCount + " apps)");
            } else {
                Log.i(TAG, "no apps to report");
            }

            // 3. Steps (HealthConnect) — API 26+ only
            if (Build.VERSION.SDK_INT >= 26) {
                StepsCollector steps = new StepsCollector(ctx);
                if (steps.sdkAvailable() && steps.hasPermission()) {
                    try {
                        JSONObject stepsPayload = steps.collectToday();
                        boolean okSteps = api.post(ApiClient.BASE_URL + "/api/steps", stepsPayload);
                        Log.i(TAG, "steps posted: " + okSteps);
                    } catch (Exception se) {
                        Log.w(TAG, "steps collect failed", se);
                    }
                } else {
                    Log.w(TAG, "steps unavailable or permission not granted");
                }
            } else {
                Log.i(TAG, "steps require API 26+");
            }

            // 4. Reminders (P1-09): generate + deliver in the collector.
            try {
                ReminderScheduler.INSTANCE.checkAndFire(ctx);
            } catch (Exception re) {
                Log.w(TAG, "reminder check failed", re);
            }

            return okUsage ? Result.success() : Result.retry();
        } catch (Exception e) {
            Log.e(TAG, "collect failed", e);
            return Result.retry();
        }
    }
}
