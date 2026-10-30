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
    private const val DAILY_CAP = 30

    // Authored templates (seed habits only); overrides may replace these.
    private val AUTHORED: Map<String, Pair<String, String>> = mapOf(
        "water" to ("水。" to "该喝水了。"),
        "standup" to ("站。" to "站起来走走。"),
        "vitamin" to ("维生素。" to "吃维生素了吗？"),
        "evening_checkin" to ("收工打卡 · 写一句今日反思" to "今天收工了吗？写一句反思。"),
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
            reconcileMissed(context, habits, prefs, nowMs, dateKey)

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
        var message = reminder.optStringOrNull("text_override") ?: authored?.first ?: displayName
        val voice = reminder.optStringOrNull("voice_override") ?: authored?.second ?: displayName

        // Issue #73: a standup reminder must not quote a stale number. Read
        // HealthConnect at fire time, put the current count in the message and
        // push the same reading to the server.
        if (name == "standup") {
            val fresh = readStepsPayload(context)
            if (fresh != null) {
                message = "$message（现在 ${fresh.optInt("steps", 0)} 步）"
                try {
                    ApiClient().post(ApiClient.BASE_URL + "/api/steps", fresh)
                } catch (e: Exception) {
                    Log.w(TAG, "standup steps post failed", e)
                }
            }
        }

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

        try {
            notify(context, id, name, message)
            prefs.edit().putLong("lf:$name", nowMs).apply()
            prefs.edit().putInt("fired", prefs.getInt("fired", 0) + 1).apply()
            logDelivery(context, name, "delivered", null)
            speak(context, voice)
            Log.i(TAG, "fired $name ($displayName) id=$id")
        } catch (e: Exception) {
            // ES-075: never lose a delivery silently.
            logDelivery(context, name, "failed", e.message)
            Log.e(TAG, "delivery failed for $name", e)
        }
    }

    /** Best-effort HealthConnect read; null when unavailable or not permitted. */
    private fun readStepsPayload(context: Context): JSONObject? {
        return try {
            if (Build.VERSION.SDK_INT < 26) return null
            val steps = StepsCollector(context)
            if (!steps.sdkAvailable() || !steps.hasPermission()) return null
            steps.collectToday()
        } catch (e: Exception) {
            Log.w(TAG, "standup steps read failed", e)
            null
        }
    }

    /** Issue #73: tell the owner once a day that HealthConnect needs re-granting. */
    fun notifyPermissionLost(context: Context) {
        try {
            val prefs = context.getSharedPreferences("yuanying_nudge", Context.MODE_PRIVATE)
            val key = "perm_" + SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            if (prefs.getBoolean(key, false)) return
            prefs.edit().putBoolean(key, true).apply()

            ensureChannel(context)
            val openIntent = Intent(context, MainActivity::class.java)
            val openPi = PendingIntent.getActivity(
                context, 9101, openIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val message = "读不到完整步数：HealthConnect 权限被系统收回了。点这里重新授权。"
            val notif = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle("元婴")
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .build()
            NotificationManagerCompat.from(context).notify(9101, notif)
        } catch (e: Exception) {
            Log.w(TAG, "permission notice failed", e)
        }
    }

    /** ES-075: one row per delivery attempt, delivered or failed. */
    private fun logDelivery(
        context: Context,
        habit: String,
        status: String,
        error: String?
    ) {
        try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
                .apply { timeZone = TimeZone.getTimeZone("UTC") }
            val now = fmt.format(Date())
            val payload = JSONObject().apply {
                put("habit", habit)
                put("scheduled_at", now)
                put("fired_at", now)
                put("status", status)
                if (error != null) put("error_message", error.take(200))
            }
            ApiClient().post(ApiClient.BASE_URL + "/api/reminder/delivery", payload)
        } catch (e: Exception) {
            Log.w(TAG, "delivery log failed", e)
        }
    }

    /**
     * ES-075: a fixed-time reminder whose slot passed by >15 min without a
     * delivery is logged as failed, so a killed process becomes visible.
     */
    private fun reconcileMissed(
        context: Context,
        habits: List<JSONObject>,
        prefs: SharedPreferences,
        nowMs: Long,
        dateKey: String
    ) {
        for (habit in habits) {
            val name = habit.optString("name")
            val reminder = habit.optJSONObject("reminder") ?: continue
            if (reminder.optString("mode") != "fixed") continue
            val times = reminder.optJSONArray("times") ?: continue
            for (i in 0 until times.length()) {
                val minutes = parseHHMM(times.optString(i))
                val slot = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, minutes / 60)
                    set(Calendar.MINUTE, minutes % 60)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
                if (nowMs < slot + 15 * 60 * 1000L) continue
                if (prefs.getLong("lf:$name", 0L) >= slot) continue
                val key = "missed:$name:$dateKey:$minutes"
                if (prefs.getBoolean(key, false)) continue
                prefs.edit().putBoolean(key, true).apply()
                logDelivery(context, name, "failed", "missed: process not running")
            }
        }
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

    // P1-25: habit-specific action label on the notification.
    private val ACTION_LABEL: Map<String, String> = mapOf(
        "water" to "喝了",
        "standup" to "起身了",
        "vitamin" to "吃了",
        "evening_checkin" to "收工打卡",
    )

    /**
     * Issue #68 follow-up: one quiet nudge when the day is running out of
     * daylight and the step goal is far away. At most once per day, 16:00-21:00
     * local, skipped in the quiet window and when there is no fresh reading.
     */
    fun maybeWalkNudge(context: Context) {
        try {
            if (Build.VERSION.SDK_INT < 26) return
            val steps = StepsCollector(context)
            if (!steps.sdkAvailable() || !steps.hasPermission()) return

            val now = Calendar.getInstance()
            val minutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
            if (minutes < 16 * 60 || minutes > 21 * 60) return

            val payload = steps.collectToday()
            val count = payload.optInt("steps", 0)
            val goal = try {
                ConfigClient().getConfig().optInt("steps_goal", 5000)
            } catch (e: Exception) {
                5000
            }
            if (count <= 0 || count >= (goal * 0.6).toInt()) return

            val prefs = context.getSharedPreferences("yuanying_nudge", Context.MODE_PRIVATE)
            val key = "walk_" + SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            if (prefs.getBoolean(key, false)) return
            prefs.edit().putBoolean(key, true).apply()

            ensureChannel(context)
            val openIntent = Intent(context, MainActivity::class.java)
            val openPi = PendingIntent.getActivity(
                context, 9001, openIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val remaining = (goal - count).coerceAtLeast(0)
            val message = "今天 $count 步，离 $goal 还差 $remaining。趁天还没黑，走一段？"
            val notif = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setContentTitle("元婴")
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .build()
            NotificationManagerCompat.from(context).notify(9001, notif)
        } catch (e: Exception) {
            Log.w("ReminderScheduler", "walk nudge failed", e)
        }
    }

    private fun notify(context: Context, id: Int, name: String, message: String) {
        ensureChannel(context)

        val openIntent = Intent(context, MainActivity::class.java)
        val openPi = PendingIntent.getActivity(
            context, id, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        if (name == "evening_checkin") {
            val workIntent = Intent(context, MainActivity::class.java).apply {
                putExtra("open_panel", "work")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val workPi = PendingIntent.getActivity(
                context, id + 300000, workIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val noteIntent = Intent(context, MainActivity::class.java).apply {
                putExtra("open_panel", "note")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val notePi = PendingIntent.getActivity(
                context, id + 400000, noteIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val ignoredIntent = Intent(context, ReminderActionReceiver::class.java).apply {
                action = ReminderActionReceiver.ACTION_IGNORED
                putExtra("reminder_id", id)
                putExtra("habit", name)
                putExtra("notif_id", 1000 + id)
            }
            val ignoredPi = PendingIntent.getBroadcast(
                context, id + 200000, ignoredIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val evening = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("元婴")
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .addAction(0, "收工打卡", workPi)
                .addAction(0, "写反思", notePi)
                .addAction(0, "忽略", ignoredPi)
                .build()

            NotificationManagerCompat.from(context).notify(1000 + id, evening)
            return
        }

        val actedIntent = Intent(context, ReminderActionReceiver::class.java).apply {
            action = ReminderActionReceiver.ACTION_ACTED
            putExtra("reminder_id", id)
            putExtra("habit", name)
            putExtra("notif_id", 1000 + id)
        }
        val actedPi = PendingIntent.getBroadcast(
            context, id + 100000, actedIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val ignoredIntent = Intent(context, ReminderActionReceiver::class.java).apply {
            action = ReminderActionReceiver.ACTION_IGNORED
            putExtra("reminder_id", id)
            putExtra("habit", name)
            putExtra("notif_id", 1000 + id)
        }
        val ignoredPi = PendingIntent.getBroadcast(
            context, id + 200000, ignoredIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val actionLabel = ACTION_LABEL[name] ?: "已做"

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("元婴")
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, actionLabel, actedPi)
            .addAction(0, "忽略", ignoredPi)
            .build()

        NotificationManagerCompat.from(context).notify(1000 + id, notif)
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
