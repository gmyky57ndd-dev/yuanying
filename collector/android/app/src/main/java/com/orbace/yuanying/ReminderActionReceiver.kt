package com.orbace.yuanying

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject

/** Handles the "已做" action on a reminder notification (P1-09). */
class ReminderActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACTED = "com.orbace.yuanying.REMINDER_ACTED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("reminder_id", 0)
        if (id > 0) {
            try {
                ApiClient().postForBody(
                    ApiClient.BASE_URL + "/api/reminder/act",
                    JSONObject().apply {
                        put("reminder_id", id)
                        put("action", "acted")
                    }
                )
            } catch (_: Exception) {
            }
        }
        try {
            val open = Intent(Intent.ACTION_VIEW, Uri.parse(ApiClient.BASE_URL))
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(open)
        } catch (_: Exception) {
        }
    }
}
