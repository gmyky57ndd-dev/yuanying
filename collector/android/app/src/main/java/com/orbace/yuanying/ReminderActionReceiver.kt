package com.orbace.yuanying

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Handles the notification action buttons on a reminder (P1-09 / P1-25).
 *  - acted  → record the habit action (water/standup +1, vitamin done)
 *  - ignore → record nothing
 * Both explicitly cancel the notification (setAutoCancel does not apply to
 * action-button taps) and neither opens the app.
 *
 * onReceive runs on the main thread, so the network POST must not happen here
 * (NetworkOnMainThreadException) — goAsync + a worker thread.
 */
class ReminderActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACTED = "com.orbace.yuanying.REMINDER_ACTED"
        const val ACTION_IGNORED = "com.orbace.yuanying.REMINDER_IGNORED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("reminder_id", 0)
        val habit = intent.getStringExtra("habit")
        val notifId = intent.getIntExtra("notif_id", if (id > 0) 1000 + id else 0)
        val action = if (intent.action == ACTION_IGNORED) "dismissed" else "acted"

        // Dismiss immediately, regardless of the network result.
        if (notifId > 0) {
            try {
                NotificationManagerCompat.from(context).cancel(notifId)
            } catch (_: Exception) {
            }
        }

        if (id <= 0 && habit == null) return

        val pending = goAsync()
        Thread {
            try {
                if (id > 0) {
                    ApiClient().postForBody(
                        ApiClient.BASE_URL + "/api/reminder/act",
                        JSONObject().apply {
                            put("reminder_id", id)
                            put("action", action)
                            if (habit != null) put("name", habit)
                        }
                    )
                } else if (habit != null && action == "acted") {
                    // reminder row missing — still record the habit action.
                    ApiClient().postForBody(
                        ApiClient.BASE_URL + "/api/signal",
                        JSONObject().apply { put("name", habit) }
                    )
                }
            } catch (_: Exception) {
            } finally {
                pending.finish()
            }
        }.start()
    }
}
