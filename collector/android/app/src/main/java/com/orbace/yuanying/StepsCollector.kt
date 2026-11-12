package com.orbace.yuanying

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
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

    /**
     * #118: per-permission snapshot for the report. Android 16 can grant a
     * subset of Health Connect permissions, so "no_records" is not enough.
     */
    fun permissionSnapshot(): JSONObject {
        val required = PERMISSIONS.toList()
        val granted = try {
            val c = client
            if (c == null) emptySet<String>() else runBlocking {
                c.permissionController.getGrantedPermissions()
            }
        } catch (e: Exception) {
            Log.e(TAG, "permission snapshot failed", e)
            emptySet<String>()
        }
        val missing = required.filter { !granted.contains(it) }
        val status = when {
            client == null -> "unsupported"
            missing.isEmpty() -> "granted"
            granted.isEmpty() -> "missing"
            else -> "partial"
        }
        return JSONObject().apply {
            put("status", status)
            put("required", JSONArray(required))
            put("granted", JSONArray(granted.intersect(required.toSet()).toList()))
            put("missing", JSONArray(missing))
            put("required_count", required.size)
            put("granted_count", required.count { granted.contains(it) })
            put("sdk_int", android.os.Build.VERSION.SDK_INT)
            put("health_connect_status", HealthConnectClient.getSdkStatus(ctx))
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
            // Issue #68: read every page. A full day can exceed the default
            // page size, and ignoring pageToken silently truncated the count.
            val allRecords = mutableListOf<StepsRecord>()
            var pageToken: String? = null
            var pages = 0
            do {
                val response = c.readRecords(
                    ReadRecordsRequest(
                        recordType = StepsRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
                        pageSize = 1000,
                        pageToken = pageToken
                    )
                )
                allRecords.addAll(response.records)
                pageToken = response.pageToken
                pages++
            } while (pageToken != null && pages < 10)

            // P1-23 / issue #8: the phone and Fit (and a watch) can each write
            // steps into HealthConnect. Summing origins double-counts (e.g.
            // 4054 + 4317 = 8371). Take the MAX per origin instead; keep the
            // raw sum for audit.
            val grouped = allRecords.groupBy { it.metadata.dataOrigin.packageName }
            val originSums = grouped.mapValues { (_, recs) -> recs.sumOf { it.count } }
            val rawTotal = originSums.values.sum()
            val maxPerOrigin = originSums.values.maxOrNull() ?: 0L

            // Issue #8: max-per-origin still over-counts when a single origin
            // holds overlapping records (e.g. phone + watch merged under Fit).
            // Health Connect's own aggregate de-duplicates intervals, so use it
            // as the authoritative total and keep the per-origin read for audit.
            val aggregateTotal = try {
                val agg = c.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
                    )
                )
                agg[StepsRecord.COUNT_TOTAL]
            } catch (e: Exception) {
                Log.w(TAG, "aggregate failed; falling back to max per origin", e)
                null
            }
            val total = aggregateTotal ?: maxPerOrigin
            val aggregation = if (aggregateTotal != null) "healthconnect_count_total" else "max_per_origin"

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
                put("device", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                // ES-011 §3 provenance: enough for 元婴 to explain the value.
                put("source", "merged")
                put("aggregation", aggregation)
                put("raw_value", rawTotal)
                put("max_per_origin", maxPerOrigin)
                put("sources", sources)
                put("sources_count", byOrigin.size)
                put("records_count", allRecords.size)
            }
        }
    }
}
