package com.rohan.localshare.util

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Native PIN module providing cryptographically secure 6-digit PIN generation
 * and constant-time string comparison to prevent side-channel timing attacks.
 */
class PinModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val secureRandom = SecureRandom()

    override fun getName(): String = "PinModule"

    @ReactMethod
    fun generatePin(promise: Promise) {
        try {
            val pinNumber = 100000 + secureRandom.nextInt(900000)
            promise.resolve(pinNumber.toString())
        } catch (e: Exception) {
            promise.reject("ERR_PIN_GEN_FAILED", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun constantTimeCompare(a: String, b: String, promise: Promise) {
        try {
            val bytesA = a.toByteArray(Charsets.UTF_8)
            val bytesB = b.toByteArray(Charsets.UTF_8)
            val matches = MessageDigest.isEqual(bytesA, bytesB)
            promise.resolve(matches)
        } catch (e: Exception) {
            promise.reject("ERR_COMPARE_FAILED", e.localizedMessage, e)
        }
    }

    companion object {
        fun compareStringsConstantTime(a: String, b: String): Boolean {
            val bytesA = a.toByteArray(Charsets.UTF_8)
            val bytesB = b.toByteArray(Charsets.UTF_8)
            return MessageDigest.isEqual(bytesA, bytesB)
        }

        fun generateSecurePin(): String {
            val random = SecureRandom()
            val pin = 100000 + random.nextInt(900000)
            return pin.toString()
        }
    }
}

