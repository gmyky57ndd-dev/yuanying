package com.orbace.yuanying

import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.PermissionController

/** Java-friendly accessors so the Java MainActivity can use HealthConnect. */
object HealthPermissionHelper {

    @JvmStatic
    fun permissions(): Set<String> = StepsCollector.PERMISSIONS

    @JvmStatic
    fun requestContract(): ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()
}
