package com.orbace.yuanying

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * ES-075 / #88: a notification action that fails to reach the server (offline,
 * process killed mid-request) used to be swallowed. Queue it and retry on the
 * next worker run so water/standup counts are not lost silently.
 */
object PendingActions {
    private const val TAG = "PendingActions"
    private const val PREFS = "yuanying_pending_actions"
    private const val KEY = "list"
    private const val MAX = 20

    fun enqueue(context: Context, habit: String?, action: String, reminderId: Int) {
        try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val list = JSONArray(prefs.getString(KEY, "[]"))
            list.put(
                JSONObject().apply {
                    put("habit", habit ?: JSONObject.NULL)
                    put("action", action)
                    put("reminder_id", reminderId)
                }
            )
            while (list.length() > MAX) list.remove(0)
            prefs.edit().putString(KEY, list.toString()).apply()
        } catch (e: Exception) {
            Log.w(TAG, "enqueue failed", e)
        }
    }

    fun drain(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY, "[]") ?: return
            val list = JSONArray(raw)
            if (list.length() == 0) return
            val keep = JSONArray()
            val api = ApiClient()
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                val habit = if (item.isNull("habit")) null else item.optString("habit")
                val action = item.optString("action", "acted")
                val id = item.optInt("reminder_id", 0)
                val ok = try {
                    if (action == "acted" && habit != null) {
                        api.post(
                            ApiClient.BASE_URL + "/api/signal",
                            JSONObject().apply {
                                put("name", habit)
                                put("source", "reminder")
                            }
                        )
                    }
                    if (id > 0) {
                        api.post(
                            ApiClient.BASE_URL + "/api/reminder/act",
                            JSONObject().apply {
                                put("reminder_id", id)
                                put("action", action)
                                if (habit != null) put("name", habit)
                            }
                        )
                    } else true
                } catch (e: Exception) {
                    Log.w(TAG, "drain item failed", e)
                    false
                }
                if (!ok) keep.put(item)
            }
            prefs.edit().putString(KEY, keep.toString()).apply()
            if (keep.length() < list.length()) {
                Log.i(TAG, "drained ${list.length() - keep.length()} pending action(s)")
            }
        } catch (e: Exception) {
            Log.w(TAG, "drain failed", e)
        }
    }
}
