package com.orbace.yuanying;

import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.Switch;
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
import java.util.List;
import java.util.TimeZone;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private static final String PWA_URL = "https://yuanying-rust.vercel.app";
    // Play internal-testing opt-in page: lets the owner pull the latest build
    // to the phone when the store list has not shown an update yet.
    private static final String INTERNAL_TEST_URL =
        "https://play.google.com/apps/internaltest/4701496216557819136";

    private TextView statusText;
    private TextView stepsStatus;
    private ActivityResultLauncher<Set<String>> stepsPermissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // ES-054: open the refresh stream while we are in the foreground
        // (Android 12+ forbids starting a foreground service from background).
        if (Build.VERSION.SDK_INT >= 26) {
            SyncStreamService.start(this);
        }

        statusText = findViewById(R.id.status_text);
        stepsStatus = findViewById(R.id.steps_status);
        TextView versionText = findViewById(R.id.version_text);
        Button grantBtn = findViewById(R.id.grant_button);
        Button testBtn = findViewById(R.id.test_button);
        Button openPwaBtn = findViewById(R.id.open_pwa_button);
        Button grantStepsBtn = findViewById(R.id.grant_steps_button);
        Button updateBtn = findViewById(R.id.update_button);
        Switch overlaySwitch = findViewById(R.id.overlay_switch);
        overlaySwitch.setChecked(
            Settings.canDrawOverlays(this)
                && getSharedPreferences("yuanying_overlay", MODE_PRIVATE)
                    .getBoolean("active", false)
        );
        overlaySwitch.setOnCheckedChangeListener((button, checked) -> {
            if (checked) {
                if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
                    overlaySwitch.setChecked(false);
                    startActivity(new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())
                    ));
                    Toast.makeText(
                        this,
                        "请先允许「显示在其他应用上层」，再开启悬浮元婴。",
                        Toast.LENGTH_LONG
                    ).show();
                } else {
                    startService(new Intent(this, OverlayService.class));
                    getSharedPreferences("yuanying_overlay", MODE_PRIVATE)
                        .edit().putBoolean("active", true).apply();
                }
            } else {
                stopService(new Intent(this, OverlayService.class));
                getSharedPreferences("yuanying_overlay", MODE_PRIVATE)
                    .edit().putBoolean("active", false).apply();
            }
        });

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
        openPwaBtn.setOnClickListener(v -> launchYuanying());
        updateBtn.setOnClickListener(v -> openInternalTest());
        grantStepsBtn.setOnClickListener(v -> {
            if (stepsPermissionLauncher != null) {
                stepsPermissionLauncher.launch(HealthPermissionHelper.permissions());
            } else {
                Toast.makeText(this, "步数采集需要 Android 9+", Toast.LENGTH_LONG).show();
            }
        });

        handleOpenPanel(getIntent());
        schedulePeriodicWork();
        scheduleSyncCheck();
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

    private boolean hasPwaWebApk() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PWA_URL));
            List<ResolveInfo> handlers = getPackageManager()
                .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo info : handlers) {
                if (info.activityInfo != null
                    && info.activityInfo.packageName.startsWith("org.chromium.webapk")) {
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /** ES-048: launch the installed PWA or guide the owner to restore it. */
    private void launchYuanying() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PWA_URL));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            if (!hasPwaWebApk()) {
                new AlertDialog.Builder(this)
                    .setTitle("恢复元婴化身")
                    .setMessage(
                        "未检测到主屏幕图标。浏览器已打开，请点击浏览器菜单 →「添加到主屏幕」，即可恢复元婴。")
                    .setPositiveButton("知道了", null)
                    .show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "无法打开浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    /** ES-037: the evening notification opens the PWA work/note panel. */
    private void handleOpenPanel(Intent intent) {
        if (intent == null) return;
        String panel = intent.getStringExtra("open_panel");
        if (panel == null || panel.isEmpty()) return;
        try {
            Intent open = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse(PWA_URL + "?panel=" + panel)
            );
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(open);
        } catch (Exception e) {
            Toast.makeText(this, "无法打开浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOpenPanel(intent);
    }

    /** Opens the Play internal-testing page to pull the latest build. */
    private void openInternalTest() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(INTERNAL_TEST_URL));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "无法打开浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        sendHeartbeat();
        refreshStatus();
        refreshStepsStatus();
    }

    /** Immediately publish version/presence when the collector is opened. */
    private void sendHeartbeat() {
        try {
            JSONObject heartbeat = new JSONObject();
            heartbeat.put("collector_version", BuildConfig.VERSION_NAME);
            heartbeat.put("collector_version_code", BuildConfig.VERSION_CODE);
            SimpleDateFormat fmt = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            heartbeat.put("collector_last_report_at", fmt.format(new Date()));
            heartbeat.put(
                "collector_overlay_active",
                getSharedPreferences("yuanying_overlay", MODE_PRIVATE)
                    .getBoolean("active", false)
            );
            new ApiClient().put(ApiClient.BASE_URL + "/api/config", heartbeat);
        } catch (Exception ignored) {
        }
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
                text = "✗ HealthConnect 权限被收回，点下方按钮重新授权";
            }
            final String t = text;
            runOnUiThread(() -> stepsStatus.setText(t));
        }).start();
    }

    private void scheduleSyncCheck() {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            SyncCheckWorker.class,
            15, TimeUnit.MINUTES
        )
        .setConstraints(new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build())
        .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "yuanying_sync_check",
            ExistingPeriodicWorkPolicy.KEEP,
            request
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
