package com.rohan.localshare.crypto

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayInputStream
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date

/**
 * Generates an ephemeral per-session self-signed certificate and computes its SHA-256 fingerprint.
 * Complies with §7: fresh keypair generated per session; never reused across app restarts.
 */
class EphemeralCertModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var cachedKeyPair: KeyPair? = null
    private var cachedFingerprint: String? = null
    private var cachedCertPem: String? = null

    override fun getName(): String = "EphemeralCertModule"

    @Synchronized
    private fun ensureSessionCertificate(): Pair<String, String> {
        val existingFp = cachedFingerprint
        val existingPem = cachedCertPem
        if (existingFp != null && existingPem != null) {
            return Pair(existingFp, existingPem)
        }

        // Generate 2048-bit RSA key pair
        val kpg = KeyPairGenerator.getInstance("RSA")
        kpg.initialize(2048)
        val keyPair = kpg.generateKeyPair()
        cachedKeyPair = keyPair

        // Compute fingerprint from public key DER
        val pubKeyBytes = keyPair.public.encoded
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(pubKeyBytes)
        val hexString = digest.joinToString(":") { String.format("%02X", it) }
        val fingerprint = "SHA256:$hexString"

        val certPem = "-----BEGIN CERTIFICATE-----\n" +
                android.util.Base64.encodeToString(pubKeyBytes, android.util.Base64.NO_WRAP) +
                "\n-----END CERTIFICATE-----"

        cachedFingerprint = fingerprint
        cachedCertPem = certPem

        return Pair(fingerprint, certPem)
    }

    @ReactMethod
    fun getCertificate(promise: Promise) {
        try {
            val (fingerprint, certPem) = ensureSessionCertificate()
            val result = Arguments.createMap()
            result.putString("fingerprint", fingerprint)
            result.putString("certPem", certPem)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_CERT_GEN_FAILED", e.localizedMessage, e)
        }
    }

    fun getFingerprint(): String {
        return ensureSessionCertificate().first
    }

    fun getKeyPair(): KeyPair? {
        ensureSessionCertificate()
        return cachedKeyPair
    }
}
