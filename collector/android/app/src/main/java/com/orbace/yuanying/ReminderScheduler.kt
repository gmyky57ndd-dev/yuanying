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
 * P1-09: reminder generation + delivery in the collector.
 *
 * The hourly WorkManager job calls [checkAndFire]. It decides which reminders
 * are due (Beijing windows), persists them server-side (so the daily summary
 * can count them), then shows a notification + speaks the Chinese line.
 * No cron, no external scheduler, and no PWA-open requirement.
 */
object ReminderScheduler {

    private const val TAG = "ReminderScheduler"
    private const val CHANNEL_ID = "yuanying_reminders"
    private const val PREFS = "yuanying_reminders"
    private const val TZ = "Asia/Shanghai"
    private const val WATER_TARGET = 6
    private const val IDLE_MINUTES = 50

    private val TEXT: Map<String, Pair<String, String>> = mapOf(
        "water" to ("水。" to "该喝水了。"),
        "standup" to ("站。" to "站起来走走。"),
        "vitamin" to ("维生素。" to "吃维生素了吗？"),
    )

    fun checkAndFire(context: Context) {
        try {
            val config = ConfigClient().getConfig()
            val enabled = config.optJSONObject("reminders_enabled")

            val cal = Calendar.getInstance(TimeZone.getTimeZone(TZ))
            val nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
            val dateKey = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                .apply { timeZone = TimeZone.getTimeZone(TZ) }
                .format(Date())

            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (prefs.getString("date", null) != dateKey) {
                prefs.edit().clear().putString("date", dateKey).apply()
            }

            val signals = fetchTodaySignals()
            val waterCount = signals.count { it.optString("name") == "water" }
            val vitaminActed = signals.any {
                it.optString("name") == "reminder_acted" &&
                    it.optJSONObject("context")?.optString("reminder_name") == "vitamin"
            }
            val idle = isIdle(signals)

            // Windows are [start, start+60min) so an hourly tick lands in each.
            val windows = mutableListOf<Pair<String, Int>>()
            windows.add("water:10:30" to 10 * 60 + 30)
            windows.add("water:15:30" to 15 * 60 + 30)
            windows.add("water:20:00" to 20 * 60)
            windows.add("vitamin:08:30" to 8 * 60 + 30)
            for (h in 9..17) windows.add("standup:$h" to h * 60)

            for ((key, start) in windows) {
                if (nowMin < start || nowMin >= start + 60) continue
                val name = key.substringBefore(':')
                if (enabled?.optBoolean(name, true) == false) continue
                if (prefs.getBoolean(key, false)) continue

                when (name) {
                    "water" -> if (waterCount >= WATER_TARGET) continue
                    "vitamin" -> if (vitaminActed) continue
                    "standup" -> if (!idle) continue
                }

                fire(context, name, prefs, key)
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkAndFire failed", e)
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

    private fun isIdle(signals: List<JSONObject>): Boolean {
        val cutoff = System.currentTimeMillis() - IDLE_MINUTES * 60_000L
        for (s in signals) {
            val n = s.optString("name")
            if (n != "steps" && n != "app_usage") continue
            val t = parseIso(s.optString("created_at")) ?: continue
            if (t >= cutoff) return false
        }
        return true
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

    private fun fire(context: Context, name: String, prefs: SharedPreferences, key: String) {
        val (message, voice) = TEXT[name] ?: return

        val payload = JSONObject().apply {
            put("name", name)
            put("message", message)
            put("voice_text", voice)
            put("shown", true)
        }
        val id = try {
            val resp = ApiClient().postForBody(
                ApiClient.BASE_URL + "/api/reminder/create", payload
            )
            if (resp != null) JSONObject(resp).optInt("id", 0) else 0
        } catch (e: Exception) {
            0
        }

        prefs.edit().putBoolean(key, true).apply()
        notify(context, id, message)
        speak(context, voice)
        Log.i(TAG, "fired $name (id=$id)")
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
