package com.orbace.yuanying

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * P1-09 + ES-001: reminder generation + delivery in the collector.
 *
 * ES-001 v1 makes this **config-driven**: it fetches active habits from
 * /api/habits and evaluates their validated reminder rules (fixed / interval)
 * with the due-window semantics in ES-001 §3.1. Authored templates are used
 * unless the habit's reminder carries text_override / voice_override.
 */
object ReminderScheduler {

    private const val TAG = "ReminderScheduler"
    private const val CHANNEL_ID = "yuanying_reminders"
    private const val PREFS = "yuanying_reminders"
    private const val DEFAULT_TZ = "Asia/Shanghai"
    private const val DAILY_CAP = 6

    // Authored templates (seed habits only); overrides may replace these.
    private val AUTHORED: Map<String, Pair<String, String>> = mapOf(
        "water" to ("水。" to "该喝水了。"),
        "standup" to ("站。" to "站起来走走。"),
        "vitamin" to ("维生素。" to "吃维生素了吗？"),
    )

    fun checkAndFire(context: Context) {
        try {
            val config = ConfigClient().getConfig()
            val enabled = config.optJSONObject("reminders_enabled")

            // B-19: use the phone's timezone; the collector is the primary writer
            // of config.timezone. (PWA writes only on >1h mismatch.)
            val deviceTz = TimeZone.getDefault().id
            try {
                ApiClient().put(
                    ApiClient.BASE_URL + "/api/config",
                    JSONObject().put("timezone", deviceTz)
                )
            } catch (e: Exception) {
                Log.w(TAG, "timezone write failed", e)
            }

            val cal = Calendar.getInstance(TimeZone.getTimeZone(deviceTz))
            val nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
            val nowMs = System.currentTimeMillis()
            val dateKey = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                .apply { timeZone = TimeZone.getTimeZone(deviceTz) }
                .format(Date())

            // B-19: quiet window — suppress, no backfill.
            val qw = config.optJSONObject("quiet_window")
            if (qw != null) {
                val start = parseHHMM(qw.optString("start", "22:00"))
                val end = parseHHMM(qw.optString("end", "07:00"))
                if (inQuietWindow(nowMin, start, end)) {
                    Log.i(TAG, "quiet window; skipping reminders")
                    return
                }
            }

            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString("date", null) != dateKey) {
                prefs.edit().clear().putString("date", dateKey).apply()
            }

            // ES-005 §E.2: daily cap across all habits.
            if (prefs.getInt("fired", 0) >= DAILY_CAP) {
                Log.i(TAG, "daily cap reached; skipping")
                return
            }

            val habits = fetchHabits()
            val signals = fetchTodaySignals()

            for (habit in habits) {
                val name = habit.optString("name")
                if (name.isEmpty()) continue
                if (enabled?.optBoolean(name, true) == false) continue
                val reminder = habit.optJSONObject("reminder") ?: continue

                if (isDue(reminder, name, nowMin, nowMs, signals, prefs, dateKey)) {
                    fire(context, habit, reminder, prefs, name, nowMs)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkAndFire failed", e)
        }
    }

    /** ES-001 §3.1 due-window semantics (no backfill; dedup = interval/2). */
    private fun isDue(
        reminder: JSONObject,
        name: String,
        nowMin: Int,
        nowMs: Long,
        signals: List<JSONObject>,
        prefs: SharedPreferences,
        dateKey: String
    ): Boolean {
        if (!conditionOk(reminder.optJSONObject("condition"), name, signals)) return false

        val mode = reminder.optString("mode", "fixed")
        if (mode == "interval") {
            val interval = reminder.optInt("interval_min", 60)
            val window = reminder.optJSONObject("window")
            if (window != null) {
                val start = parseHHMM(window.optString("start", "00:00"))
                val end = parseHHMM(window.optString("end", "23:59"))
                if (nowMin < start || nowMin >= end) return false
            }
            val lastFired = prefs.getLong("lf:$name", 0L)
            if (lastFired == 0L) return true
            val since = nowMs - lastFired
            if (since < (interval / 2) * 60_000L) return false // dedup
            return since >= interval * 60_000L
        }

        // fixed: fire within [time, time+60m) once per day, per time bucket
        val times = reminder.optJSONArray("times") ?: return false
        for (i in 0 until times.length()) {
            val t = parseHHMM(times.optString(i))
            if (nowMin >= t && nowMin < t + 60) {
                val key = "fx:$name:$dateKey:$t"
                if (prefs.getBoolean(key, false)) return false
                prefs.edit().putBoolean(key, true).apply()
                return true
            }
        }
        return false
    }

    private fun conditionOk(condition: JSONObject?, name: String, signals: List<JSONObject>): Boolean {
        if (condition == null) return true
        when (condition.optString("kind", "always")) {
            "count_below_target" -> {
                val target = condition.optInt("value", 6)
                val count = signals.count { it.optString("name") == name }
                return count < target
            }
            "idle" -> {
                val minutes = condition.optInt("minutes", 50)
                val cutoff = System.currentTimeMillis() - minutes * 60_000L
                for (s in signals) {
                    val n = s.optString("name")
                    if (n != "steps" && n != "app_usage") continue
                    val t = parseIso(s.optString("created_at")) ?: continue
                    if (t >= cutoff) return false
                }
                return true
            }
            else -> return true // "always"
        }
    }

    private fun fire(
        context: Context,
        habit: JSONObject,
        reminder: JSONObject,
        prefs: SharedPreferences,
        name: String,
        nowMs: Long
    ) {
        val displayName = habit.optString("display_name", name)
        val authored = AUTHORED[name]
        val message = reminder.optStringOrNull("text_override") ?: authored?.first ?: displayName
        val voice = reminder.optStringOrNull("voice_override") ?: authored?.second ?: displayName

        val payload = JSONObject().apply {
            put("name", name)
            put("message", message)
            put("voice_text", voice)
            put("shown", true)
        }
        val id = try {
            val resp = ApiClient().postForBody(ApiClient.BASE_URL + "/api/reminder/create", payload)
            if (resp != null) JSONObject(resp).optInt("id", 0) else 0
        } catch (e: Exception) {
            0
        }

        prefs.edit().putLong("lf:$name", nowMs).apply()
        prefs.edit().putInt("fired", prefs.getInt("fired", 0) + 1).apply()
        notify(context, id, message)
        speak(context, voice)
        Log.i(TAG, "fired $name ($displayName) id=$id")
    }

    private fun fetchHabits(): List<JSONObject> {
        val body = ApiClient().get(ApiClient.BASE_URL + "/api/habits") ?: return emptyList()
        return try {
            val arr = JSONObject(body).optJSONArray("habits") ?: return emptyList()
            (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun fetchTodaySignals(): List<JSONObject> {
        val body = ApiClient().get(ApiClient.BASE_URL + "/api/signal") ?: return emptyList()
        return try {
            val arr = JSONObject(body).optJSONArray("signals") ?: return emptyList()
            (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseHHMM(s: String): Int {
        return try {
            val parts = s.split(":")
            parts[0].trim().toInt() * 60 + parts[1].trim().toInt()
        } catch (e: Exception) {
            0
        }
    }

    /** Quiet window may wrap past midnight (e.g. 22:00–07:00). */
    private fun inQuietWindow(nowMin: Int, start: Int, end: Int): Boolean {
        return if (start <= end) nowMin in start until end
        else (nowMin >= start || nowMin < end)
    }

    // Parse "YYYY-MM-DDThh:mm:ss..." as UTC without java.time (minSdk 24).
    private fun parseIso(s: String): Long? = try {
        val cut = if (s.length >= 19) s.substring(0, 19) else s
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .parse(cut)
            ?.time
    } catch (e: Exception) {
        null
    }

    private fun JSONObject.optStringOrNull(key: String): String? {
        if (!has(key) || isNull(key)) return null
        val v = optString(key, "")
        return if (v.isEmpty()) null else v
    }

    private fun notify(context: Context, id: Int, message: String) {
        ensureChannel(context)

        val openIntent = Intent(context, MainActivity::class.java)
        val openPi = PendingIntent.getActivity(
            context, id, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val actedIntent = Intent(context, ReminderActionReceiver::class.java).apply {
            action = ReminderActionReceiver.ACTION_ACTED
            putExtra("reminder_id", id)
        }
        val actedPi = PendingIntent.getBroadcast(
            context, id + 100000, actedIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("元婴")
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, "已做", actedPi)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(1000 + id, notif)
        } catch (e: SecurityException) {
            Log.w(TAG, "notification permission not granted")
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "元婴提醒", NotificationManager.IMPORTANCE_HIGH)
                )
            }
        }
    }

    private fun speak(context: Context, text: String) {
        var engine: TextToSpeech? = null
        engine = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                engine?.language = Locale.SIMPLIFIED_CHINESE
                engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) { engine?.shutdown() }
                    @Deprecated("deprecated in API 21")
                    override fun onError(utteranceId: String?) { engine?.shutdown() }
                })
                engine?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "yy")
            } else {
                engine?.shutdown()
            }
        }
    }
}
