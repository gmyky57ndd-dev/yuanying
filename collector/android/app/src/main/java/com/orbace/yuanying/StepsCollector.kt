package com.orbace.yuanying

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit

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
        val now = Instant.now()
        val startOfDay = now.truncatedTo(ChronoUnit.DAYS)

        return runBlocking {
            val request = ReadRecordsRequest(
                recordType = StepsRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
            )
            val response = c.readRecords(request)
            val total = response.records.sumOf { it.count }
            Log.i(TAG, "collected steps: $total")

            JSONObject().apply {
                put("window_start", startOfDay.toString())
                put("window_end", now.toString())
                put("steps", total)
                put("platform", "android")
            }
        }
    }
}
