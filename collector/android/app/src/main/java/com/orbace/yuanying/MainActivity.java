package com.orbace.yuanying;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.status_text);
        Button grantBtn = findViewById(R.id.grant_button);
        Button testBtn = findViewById(R.id.test_button);

        grantBtn.setOnClickListener(v -> openUsageAccessSettings());
        testBtn.setOnClickListener(v -> runOnce());

        schedulePeriodicWork();
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private boolean hasUsageAccess() {
        AppOpsManager appOps = (AppOpsManager)
            getSystemService(Context.APP_OPS_SERVICE);
        int mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            getPackageName()
        );
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private void openUsageAccessSettings() {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void refreshStatus() {
        boolean granted = hasUsageAccess();
        statusText.setText(granted
            ? "✓ 已授权。每小时自动上报。"
            : "✗ 未授权。点击下方按钮授予。"
        );
    }

    private void schedulePeriodicWork() {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            CollectorWorker.class,
            1, TimeUnit.HOURS
        )
        .setConstraints(new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build())
        .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "yuanying_collector",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }

    private void runOnce() {
        if (!hasUsageAccess()) {
            Toast.makeText(this, "请先授予使用情况访问权限", Toast.LENGTH_LONG).show();
            openUsageAccessSettings();
            return;
        }
        Toast.makeText(this, "正在采集…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                JSONObject payload = new UsageStatsCollector(this).collectLastHour();
                int n = payload.getJSONArray("apps").length();
                if (n == 0) {
                    runOnUiThread(() -> Toast.makeText(
                        this, "近一小时无应用使用记录", Toast.LENGTH_LONG).show());
                    return;
                }
                boolean ok = new ApiClient().post(
                    ApiClient.BASE_URL + "/api/activity", payload);
                runOnUiThread(() -> Toast.makeText(
                    this,
                    ok ? ("已上报 " + n + " 个应用") : "上报失败，稍后自动重试",
                    Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(
                    this, "采集失败：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }
}
