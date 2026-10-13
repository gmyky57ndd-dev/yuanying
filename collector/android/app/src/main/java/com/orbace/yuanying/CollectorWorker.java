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

            // 2. 采集
            JSONObject payload = new UsageStatsCollector(ctx)
                .collectLastHour();

            int appCount = payload.getJSONArray("apps").length();
            if (appCount == 0) {
                Log.i(TAG, "no apps to report");
                return Result.success();
            }

            // 3. 上报
            ApiClient api = new ApiClient();
            boolean ok = api.post(ApiClient.BASE_URL + "/api/activity", payload);

            if (ok) {
                Log.i(TAG, "reported " + appCount + " apps");
                return Result.success();
            } else {
                Log.w(TAG, "post failed, will retry");
                return Result.retry();
            }
        } catch (Exception e) {
            Log.e(TAG, "collect failed", e);
            return Result.retry();
        }
    }
}
