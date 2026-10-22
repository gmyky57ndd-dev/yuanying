package com.orbace.yuanying;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

/**
 * ES-073 / #70: WorkManager periodic work survives a reboot, but a killed
 * foreground service does not. Enqueue one immediate collection at boot so the
 * heartbeat and steps resume without the owner opening the app.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            return;
        }
        try {
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CollectorWorker.class)
                .setConstraints(new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build())
                .build();
            WorkManager.getInstance(context).enqueue(request);
            Log.i("BootReceiver", "boot: collector worker enqueued");
        } catch (Exception e) {
            Log.w("BootReceiver", "boot enqueue failed", e);
        }
    }
}
