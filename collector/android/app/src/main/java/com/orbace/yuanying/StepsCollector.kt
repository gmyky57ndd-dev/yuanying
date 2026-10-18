package com.orbace.yuanying

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Reads today's step count from HealthConnect. Runs the suspend API via
 * runBlocking so it is callable from the existing Java CollectorWorker.
 */
class StepsCollector(private val ctx: Context) {

    companion object {
        private const val TAG = "StepsCollector"
        val PERMISSIONS: Set<String> =
            setOf(HealthPermission.getReadPermission(StepsRecord::class))
    }

    private val client: HealthConnectClient? =
        if (sdkAvailable()) HealthConnectClient.getOrCreate(ctx) else null

    fun sdkAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    fun hasPermission(): Boolean {
        val c = client ?: return false
        return try {
            runBlocking {
                c.permissionController.getGrantedPermissions().containsAll(PERMISSIONS)
            }
        } catch (e: Exception) {
            Log.e(TAG, "permission check failed", e)
            false
        }
    }

    fun collectToday(): JSONObject {
        val c = client ?: throw IllegalStateException("HealthConnect unavailable")
        // P1-23 fix: anchor the window to LOCAL midnight in the device timezone.
        // `Instant.now().truncatedTo(DAYS)` truncates in UTC, so on a non-UTC
        // device the window started hours before the local day (e.g. 20:00 the
        // previous evening in America/New_York), pulling in yesterday's steps.
        val zone = ZoneId.systemDefault()
        val now = Instant.now()
        val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()

        return runBlocking {
            val request = ReadRecordsRequest(
                recordType = StepsRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
            )
            val response = c.readRecords(request)

            // P1-23 / issue #8: the phone and Fit (and a watch) can each write
            // steps into HealthConnect. Summing origins double-counts (e.g.
            // 4054 + 4317 = 8371). Take the MAX per origin instead; keep the
            // raw sum for audit.
            val grouped = response.records.groupBy { it.metadata.dataOrigin.packageName }
            val originSums = grouped.mapValues { (_, recs) -> recs.sumOf { it.count } }
            val rawTotal = originSums.values.sum()
            val total = originSums.values.maxOrNull() ?: 0

            val byOrigin = originSums.map { (pkg, steps) ->
                JSONObject().apply {
                    put("package", pkg)
                    put("steps", steps)
                    put("count", grouped[pkg]?.size ?: 0)
                }
            }
            val sources = JSONArray().apply { byOrigin.forEach { put(it) } }
            Log.i(
                TAG,
                "collected steps: $total (max per origin; raw sum $rawTotal) " +
                    "from ${byOrigin.size} origins (window $startOfDay..$now, tz $zone): $byOrigin"
            )

            JSONObject().apply {
                put("window_start", startOfDay.toString())
                put("window_end", now.toString())
                put("timezone", zone.id)
                put("steps", total)
                put("platform", "android")
                // ES-011 §3 provenance: enough for 元婴 to explain the value.
                put("source", "merged")
                put("aggregation", "max_per_origin")
                put("raw_value", rawTotal)
                put("sources", sources)
                put("sources_count", byOrigin.size)
            }
        }
    }
}
