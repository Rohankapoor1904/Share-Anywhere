package com.rohan.localshare

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.MessageDigest

class EphemeralCertModuleTest {

    private fun generateFingerprint(): String {
        val kpg = KeyPairGenerator.getInstance("RSA")
        kpg.initialize(2048)
        val keyPair = kpg.generateKeyPair()
        val pubKeyBytes = keyPair.public.encoded
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(pubKeyBytes)
        val hexString = digest.joinToString(":") { String.format("%02X", it) }
        return "SHA256:$hexString"
    }

    @Test
    fun testFingerprintStabilityAndFormat() {
        val fp1 = generateFingerprint()
        assertTrue(fp1.startsWith("SHA256:"))
        assertEquals(32 * 3 + 6, fp1.length) // SHA256: + 32 hex bytes separated by colons

        // Different sessions must produce differing fingerprints (§7)
        val fp2 = generateFingerprint()
        assertNotEquals(fp1, fp2)
    }
}

