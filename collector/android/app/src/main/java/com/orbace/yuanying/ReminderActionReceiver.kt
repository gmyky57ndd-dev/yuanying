package com.orbace.yuanying

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/**
 * Handles the notification action buttons on a reminder (P1-09 / P1-25).
 *  - acted  → record the habit action (water/standup +1, vitamin done)
 *  - ignore → record nothing; just let the notification dismiss
 * Both let the notification auto-cancel; neither opens the app.
 */
class ReminderActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACTED = "com.orbace.yuanying.REMINDER_ACTED"
        const val ACTION_IGNORED = "com.orbace.yuanying.REMINDER_IGNORED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("reminder_id", 0)
        val habit = intent.getStringExtra("habit")
        val action = if (intent.action == ACTION_IGNORED) "dismissed" else "acted"
        if (id > 0) {
            try {
                ApiClient().postForBody(
                    ApiClient.BASE_URL + "/api/reminder/act",
                    JSONObject().apply {
                        put("reminder_id", id)
                        put("action", action)
                        if (habit != null) put("name", habit)
                    }
                )
            } catch (_: Exception) {
            }
        }
        // No app launch — the tap records the action and the notification
        // auto-cancels (setAutoCancel). Ignore only dismisses.
    }
}
