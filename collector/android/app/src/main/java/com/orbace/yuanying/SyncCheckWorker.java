package com.orbace.yuanying;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.OneTimeWorkRequest;
import androidx.work.NetworkType;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

/**
 * ES-048 / Issue #56: pull-based server sync request.
 * Polls config; when the PWA asks for a sync, enqueue one immediate collection.
 * Android WorkManager's minimum periodic interval is 15 minutes.
 */
public class SyncCheckWorker extends Worker {
    private static final String PREFS = "yuanying_sync";

    public SyncCheckWorker(@NonNull Context ctx, @NonNull WorkerParameters p) {
        super(ctx, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        JSONObject config = new ConfigClient().getConfig();
        String requested = config.optString("collector_sync_requested_at", "");
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String processed = prefs.getString("processed_at", "");

        // Issue #68: keep steps fresh on the 15-minute cadence instead of
        // waiting for the owner to press 上报步数 in the collector UI.
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                StepsCollector steps = new StepsCollector(ctx);
                if (steps.sdkAvailable() && steps.hasPermission()) {
                    org.json.JSONObject payload = steps.collectToday();
                    if (payload.optInt("sources_count", 1) > 0) {
                        new ApiClient().post(ApiClient.BASE_URL + "/api/steps", payload);
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("SyncCheckWorker", "steps post failed", e);
        }

        if (!requested.isEmpty() && !requested.equals(processed)) {
            OneTimeWorkRequest collect = new OneTimeWorkRequest.Builder(CollectorWorker.class)
                .setConstraints(new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build())
                .build();
            WorkManager.getInstance(ctx).enqueue(collect);
            prefs.edit().putString("processed_at", requested).apply();
        }
        return Result.success();
    }
}
