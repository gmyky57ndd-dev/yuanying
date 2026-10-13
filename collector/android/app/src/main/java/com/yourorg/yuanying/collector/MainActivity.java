package com.yourorg.yuanying.collector;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

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
        Button updateBtn = findViewById(R.id.update_button);

        grantBtn.setOnClickListener(v -> openUsageAccessSettings());
        testBtn.setOnClickListener(v -> runOnce());
        updateBtn.setOnClickListener(v -> new UpdateChecker().checkAsync(this));

        schedulePeriodicWork();
        refreshStatus();
        new UpdateChecker().checkAsync(this);
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
        androidx.work.OneTimeWorkRequest req =
            new androidx.work.OneTimeWorkRequest.Builder(
                CollectorWorker.class
            ).build();
        WorkManager.getInstance(this).enqueue(req);
    }
}
