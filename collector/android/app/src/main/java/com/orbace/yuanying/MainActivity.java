package com.orbace.yuanying;

import android.app.AppOpsManager;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AppCompatActivity;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private static final String PWA_URL = "https://yuanying-rust.vercel.app";

    private TextView statusText;
    private TextView stepsStatus;
    private ActivityResultLauncher<Set<String>> stepsPermissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.status_text);
        stepsStatus = findViewById(R.id.steps_status);
        TextView versionText = findViewById(R.id.version_text);
        Button grantBtn = findViewById(R.id.grant_button);
        Button testBtn = findViewById(R.id.test_button);
        Button openPwaBtn = findViewById(R.id.open_pwa_button);
        Button grantStepsBtn = findViewById(R.id.grant_steps_button);

        // HealthConnect is API 26+ only. Do not reference its classes on older
        // devices so the app keeps minSdk 24 (Play device-support requirement).
        if (Build.VERSION.SDK_INT >= 26) {
            stepsPermissionLauncher = registerForActivityResult(
                HealthPermissionHelper.requestContract(),
                granted -> {
                    boolean ok = granted != null
                        && granted.containsAll(HealthPermissionHelper.permissions());
                    Toast.makeText(
                        this,
                        ok ? "步数权限已授予" : "步数权限被拒绝",
                        Toast.LENGTH_LONG
                    ).show();
                    refreshStepsStatus();
                });
        }

        grantBtn.setOnClickListener(v -> openUsageAccessSettings());
        testBtn.setOnClickListener(v -> runOnce());
        openPwaBtn.setOnClickListener(v -> openPwa());
        grantStepsBtn.setOnClickListener(v -> {
            if (stepsPermissionLauncher != null) {
                stepsPermissionLauncher.launch(HealthPermissionHelper.permissions());
            } else {
                Toast.makeText(this, "步数采集需要 Android 9+", Toast.LENGTH_LONG).show();
            }
        });

        schedulePeriodicWork();
        refreshStatus();
        refreshStepsStatus();

        // Notifications for reminders (P1-09) need POST_NOTIFICATIONS on 13+.
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }

        // Version + updated-timestamp record.
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            String updated = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
                .format(new Date(pi.lastUpdateTime));
            versionText.setText(
                "v" + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ") · 更新 "
                    + updated);
        } catch (Exception e) {
            versionText.setText("v" + BuildConfig.VERSION_NAME);
        }
    }

    private void openPwa() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PWA_URL));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "无法打开浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
        refreshStepsStatus();
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

    private void refreshStepsStatus() {
        if (Build.VERSION.SDK_INT < 26) {
            stepsStatus.setText("步数采集需要 Android 9+");
            return;
        }
        new Thread(() -> {
            StepsCollector sc = new StepsCollector(this);
            String text;
            if (!sc.sdkAvailable()) {
                text = "✗ Health Connect 不可用";
            } else if (sc.hasPermission()) {
                text = "✓ 步数采集已启用";
            } else {
                text = "✗ 步数采集未授权";
            }
            final String t = text;
            runOnUiThread(() -> stepsStatus.setText(t));
        }).start();
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
                if (n > 0) {
                    new ApiClient().post(ApiClient.BASE_URL + "/api/activity", payload);
                }

                String stepsMsg;
                if (Build.VERSION.SDK_INT < 26) {
                    stepsMsg = "步数需要 Android 9+";
                } else {
                    StepsCollector steps = new StepsCollector(this);
                    if (!steps.sdkAvailable()) {
                        stepsMsg = "Health Connect 不可用";
                    } else if (steps.hasPermission()) {
                        JSONObject sp = steps.collectToday();
                        boolean ok = new ApiClient().post(
                            ApiClient.BASE_URL + "/api/steps", sp);
                        stepsMsg = ok ? "步数已上报" : "步数上报失败";
                    } else {
                        stepsMsg = "步数未授权";
                    }
                }

                final String msg = "已上报 " + n + " 个应用；" + stepsMsg;
                runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(
                    this, "采集失败：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }
}
