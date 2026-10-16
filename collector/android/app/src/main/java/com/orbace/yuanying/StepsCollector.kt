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
            val total = response.records.sumOf { it.count }

            // P1-23 diagnostic: log the window, the HealthConnect data origins
            // present, per-origin counts, and the aggregation mode, so we can
            // tell whether one source (e.g. phone vs watch) is the outlier.
            val byOrigin = response.records
                .groupBy { it.metadata.dataOrigin.packageName }
                .map { (pkg, recs) ->
                    JSONObject().apply {
                        put("package", pkg)
                        put("steps", recs.sumOf { it.count })
                        put("count", recs.size)
                    }
                }
            val sources = JSONArray().apply { byOrigin.forEach { put(it) } }
            Log.i(
                TAG,
                "collected steps: $total from ${byOrigin.size} origins " +
                    "(window $startOfDay..$now, tz $zone): $byOrigin"
            )

            JSONObject().apply {
                put("window_start", startOfDay.toString())
                put("window_end", now.toString())
                put("timezone", zone.id)
                put("steps", total)
                put("platform", "android")
                put("aggregation", "sum_all_origins")
                put("sources", sources)
                put("sources_count", byOrigin.size)
            }
        }
    }
}
