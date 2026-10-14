package com.orbace.yuanying;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

public class CollectorWorker extends Worker {

    private static final String TAG = "CollectorWorker";

    public CollectorWorker(@NonNull Context ctx, @NonNull WorkerParameters p) {
        super(ctx, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
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

            // 3. Steps (HealthConnect)
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

            return okUsage ? Result.success() : Result.retry();
        } catch (Exception e) {
            Log.e(TAG, "collect failed", e);
            return Result.retry();
        }
    }
}
