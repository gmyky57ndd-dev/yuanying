package com.orbace.yuanying

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

/**
 * #116 / ES-064: one self-check for HealthConnect step permission.
 *
 * Called on app start (MainActivity.onResume) and by CollectorWorker. It
 * notifies **once per permission-loss episode** (the flag is cleared on
 * recovery) and enqueues an immediate collection when permission returns, so
 * no app restart is needed.
 */
object StepsPermissionMonitor {
    private const val TAG = "StepsPermMonitor"
    private const val PREFS = "yuanying_steps_permission"
    private const val KEY_LOST_NOTIFIED = "lost_notified"

    const val STATUS_OK = "ok"
    const val STATUS_NO_PERMISSION = "no_permission"
    const val STATUS_UNSUPPORTED = "unsupported"

    fun permissionSnapshot(ctx: Context): org.json.JSONObject {
        if (Build.VERSION.SDK_INT < 26) {
            return org.json.JSONObject().put("status", STATUS_UNSUPPORTED)
        }
        return try {
            StepsCollector(ctx).permissionSnapshot()
        } catch (e: Exception) {
            Log.w(TAG, "permissionSnapshot failed", e)
            org.json.JSONObject().put("status", STATUS_NO_PERMISSION)
        }
    }

    fun status(ctx: Context): String {
        if (Build.VERSION.SDK_INT < 26) return STATUS_UNSUPPORTED
        return try {
            val sc = StepsCollector(ctx)
            if (!sc.sdkAvailable()) return STATUS_UNSUPPORTED
            if (sc.hasPermission()) STATUS_OK else STATUS_NO_PERMISSION
        } catch (e: Exception) {
            Log.w(TAG, "status check failed", e)
            STATUS_NO_PERMISSION
        }
    }

    /** Startup/worker self-check. Returns ok|no_permission|unsupported. */
    @JvmOverloads
    fun checkAndNotify(ctx: Context, enqueueOnRecovery: Boolean = true): String {
        val current = status(ctx)
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val alreadyNotified = prefs.getBoolean(KEY_LOST_NOTIFIED, false)

        when (current) {
            STATUS_OK -> if (alreadyNotified) {
                prefs.edit().putBoolean(KEY_LOST_NOTIFIED, false).apply()
                Log.i(TAG, "permission recovered; clearing notice flag")
                if (enqueueOnRecovery) enqueueImmediateCollect(ctx)
            }
            STATUS_NO_PERMISSION -> if (!alreadyNotified) {
                val missing = permissionSnapshot(ctx).optJSONArray("missing")
                val detail = if (missing != null && missing.length() > 0) {
                    "缺少：" + (0 until missing.length()).joinToString(", ") {
                        missing.optString(it).substringAfterLast('.')
                    }
                } else {
                    null
                }
                ReminderScheduler.notifyPermissionLost(ctx, detail)
                prefs.edit().putBoolean(KEY_LOST_NOTIFIED, true).apply()
                Log.i(TAG, "permission lost; notified once")
            } else {
                Log.i(TAG, "permission still lost; notice already sent")
            }
        }
        return current
    }

    /** CollectorWorker calls this after a successful read. */
    fun markRecovered(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_LOST_NOTIFIED, false).apply()
    }

    private fun enqueueImmediateCollect(ctx: Context) {
        try {
            val request = OneTimeWorkRequestBuilder<CollectorWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(
                "yuanying_steps_recheck",
                ExistingWorkPolicy.REPLACE,
                request
            )
        } catch (e: Exception) {
            Log.w(TAG, "recovery enqueue failed", e)
        }
    }
}
