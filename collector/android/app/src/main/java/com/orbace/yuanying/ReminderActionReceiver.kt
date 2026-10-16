package com.orbace.yuanying

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject

/** Handles the notification action buttons on a reminder (P1-09 / P1-25). */
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
        // "acted" opens the app; "ignored" just clears the notification (quiet).
        if (action == "acted") {
            try {
                val open = Intent(Intent.ACTION_VIEW, Uri.parse(ApiClient.BASE_URL))
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(open)
            } catch (_: Exception) {
            }
        }
    }
}
