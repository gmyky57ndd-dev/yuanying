package com.orbace.yuanying;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * ES-054: keep one SSE connection open so a server-side refresh request reaches
 * the phone in ~1-2 s instead of waiting for the 15-minute SyncCheckWorker.
 *
 * On `event: sync` it enqueues the same CollectorWorker the 上报步数 button
 * runs. Foreground service with a silent, low-importance notification; if it
 * cannot start (OEM restriction, permission), the 15-minute poll still works.
 */
public class SyncStreamService extends Service {
    private static final String TAG = "SyncStream";
    private static final String CHANNEL_ID = "yuanying_sync";
    private static final int NOTIF_ID = 7310;
    private static final long STREAM_LIFETIME_MS = 50_000;

    private volatile boolean running = false;
    private Thread thread;

    public static void start(Context ctx) {
        try {
            Intent intent = new Intent(ctx, SyncStreamService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            Log.w(TAG, "cannot start sync stream", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notification);
        }
        running = true;
        thread = new Thread(this::loop, "sync-stream");
        thread.start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (thread != null) thread.interrupt();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void loop() {
        long backoff = 3000;
        while (running) {
            Response res = null;
            try {
                OkHttpClient client = new OkHttpClient.Builder()
                        .connectTimeout(15, TimeUnit.SECONDS)
                        // 0 = no read timeout: the server holds the stream ~50 s.
                        .readTimeout(0, TimeUnit.MILLISECONDS)
                        .build();

                Request.Builder builder = new Request.Builder()
                        .url(ApiClient.BASE_URL + "/api/collector/stream")
                        .header("Accept", "text/event-stream");
                String token = BuildConfig.API_TOKEN;
                if (token != null && !token.isEmpty()) {
                    builder.header("Authorization", "Bearer " + token);
                }

                res = client.newCall(builder.build()).execute();
                if (!res.isSuccessful() || res.body() == null) {
                    throw new java.io.IOException("stream HTTP " + res.code());
                }

                backoff = 3000;
                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(res.body().byteStream()));
                String line;
                String event = null;
                long startedAt = System.currentTimeMillis();
                while (running && (line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        event = line.substring(6).trim();
                    } else if (line.isEmpty()) {
                        if ("sync".equals(event)) enqueueCollect();
                        event = null;
                    }
                    if (System.currentTimeMillis() - startedAt > STREAM_LIFETIME_MS + 20_000) {
                        break; // server closes at 50 s; never hang on a dead stream
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "stream error: " + e.getMessage());
            } finally {
                if (res != null) res.close();
            }

            if (!running) break;
            try {
                Thread.sleep(backoff);
            } catch (InterruptedException ie) {
                break;
            }
            backoff = Math.min(backoff * 2, 30_000);
        }
    }

    private void enqueueCollect() {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CollectorWorker.class)
                .setConstraints(new Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build())
                .build();
        WorkManager.getInstance(this).enqueue(request);
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(new NotificationChannel(
                        CHANNEL_ID, "元婴同步", NotificationManager.IMPORTANCE_LOW));
            }
        }
        PendingIntent open = PendingIntent.getActivity(
                this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle("元婴")
                .setContentText("同步通道已连接")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(open)
                .build();
    }
}
