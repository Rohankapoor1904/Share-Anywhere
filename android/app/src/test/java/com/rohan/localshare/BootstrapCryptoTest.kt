package com.rohan.localshare

import com.rohan.localshare.bootstrap.BootstrapCrypto
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import javax.crypto.AEADBadTagException

/**
 * Cross-implementation vectors: every value below was produced by
 * desktop/engine/offline-bootstrap.js (Node crypto). If this passes, the phone and the
 * PC derive the same code and key and can read each other's encrypted hotspot details.
 */
class BootstrapCryptoTest {

    private fun hex(s: String): ByteArray = ByteArray(s.length / 2) { i -> s.substring(i * 2, i * 2 + 2).toInt(16).toByte() }

    private val phonePriv = hex("514fe05bad9d00423ba965f4d8c04ebf1607264d05d1abc6c09dbb92c29a303c")
    private val pcPriv = hex("677be987b319f3cf3fbc2fddefabe9dc3b699fa40cf00da2a6a4d2d3e8d06bc0")
    private val phonePub = hex("04db5b484e7622e31163b90d4afe888d401cea038c07d14ad819c782d09816705ce774fe82d31b46f87dcc30dc6a218871ddaa276df6dc1ae076943968f945f2b3")
    private val pcPub = hex("04fa73b5f61b08a2e87c0d07bf250fa42fd506d4360defaf19b66a830641fb07cdb014bfd48208ea01ae77aa69d06da2998f9b11bdef059a563796c968bf21d11c")
    private val noncePhone = hex("000102030405060708090a0b0c0d0e0f")
    private val noncePc = hex("101112131415161718191a1b1c1d1e1f")
    private val iv = hex("202122232425262728292a2b")
    private val shared = hex("233c76abb5e1fd3da32989286592c269eccb4deb2e7abd60f9f6600ca7d8fa39")
    private val transcript = hex("489ccf8503878961bbaf4b6c1ede18b07a6a92df7069ab6ef59ac0015d10f147")
    private val key = hex("a12afad1d7fc4f8415539e0100c8803d689e01b530c83e707b2afc72b07011f1")
    private val plaintext = "{\"ssid\":\"AndroidShare_4821\",\"pass\":\"q7mxk2pa9w\",\"ip\":\"192.168.49.1\",\"port\":53318,\"sec\":\"wpa2\"}"
    private val blob = hex(
        "202122232425262728292a2bf07c34ef24959274c953db9c8388cd48df2d15a6081d9924acce4b403b97d1cbbfbe963d" +
            "2bd545538745f16e94c94197bd019ff48d86081b1983828561cde1e148244e2b4267c1966364b88e9001018ae93688fe" +
            "475f630f00b76e179c62e3b7f164dae4ae4aa89a8bc3a902e7ec"
    )

    @Test
    fun ecdhMatchesNodeFromBothSides() {
        val fromPhone = BootstrapCrypto.sharedSecret(BootstrapCrypto.privateKeyFromScalar(phonePriv), pcPub)
        val fromPc = BootstrapCrypto.sharedSecret(BootstrapCrypto.privateKeyFromScalar(pcPriv), phonePub)
        assertArrayEquals(shared, fromPhone)
        assertArrayEquals(shared, fromPc)
    }

    @Test
    fun transcriptKeyAndCodeMatchNode() {
        assertArrayEquals(transcript, BootstrapCrypto.transcript(phonePub, pcPub, noncePhone, noncePc))
        assertArrayEquals(key, BootstrapCrypto.deriveKey(shared, transcript))
        assertEquals("989846", BootstrapCrypto.deriveCode(shared, transcript))
    }

    @Test
    fun credentialsJsonMatchesJsonStringify() {
        assertEquals(plaintext, BootstrapCrypto.credentialsJson("AndroidShare_4821", "q7mxk2pa9w", "192.168.49.1", 53318, "wpa2"))
        assertEquals("\"a\\\"b\\\\c\\n\\u0001\"", BootstrapCrypto.jsonString("a\"b\\c\n\u0001"))
    }

    @Test
    fun sealProducesTheExactNodeBlob() {
        assertArrayEquals(blob, BootstrapCrypto.seal(key, transcript, plaintext.toByteArray(Charsets.UTF_8), iv))
        assertEquals(plaintext, String(BootstrapCrypto.open(key, transcript, blob), Charsets.UTF_8))
    }

    @Test
    fun tamperedBlobOrWrongTranscriptIsRejected() {
        val tampered = blob.copyOf().also { it[20] = (it[20].toInt() xor 0x01).toByte() }
        assertThrows(AEADBadTagException::class.java) { BootstrapCrypto.open(key, transcript, tampered) }
        val otherTranscript = transcript.copyOf().also { it[0] = (it[0].toInt() xor 0x01).toByte() }
        assertThrows(AEADBadTagException::class.java) { BootstrapCrypto.open(key, otherTranscript, blob) }
    }

    @Test
    fun offCurveAndMalformedKeysAreRejected() {
        val offCurve = pcPub.copyOf().also { it[64] = (it[64].toInt() xor 0x01).toByte() }
        assertThrows(IllegalArgumentException::class.java) { BootstrapCrypto.decodePublicKey(offCurve) }
        assertThrows(IllegalArgumentException::class.java) { BootstrapCrypto.decodePublicKey(pcPub.copyOf(33)) }
        val compressedPrefix = pcPub.copyOf().also { it[0] = 0x02 }
        assertThrows(IllegalArgumentException::class.java) { BootstrapCrypto.decodePublicKey(compressedPrefix) }
    }

    @Test
    fun generatedKeysRoundTripThroughTheWireFormat() {
        val a = BootstrapCrypto.generateKeyPair()
        val b = BootstrapCrypto.generateKeyPair()
        assertEquals(65, a.publicKey.size)
        assertArrayEquals(
            BootstrapCrypto.sharedSecret(a.privateKey, b.publicKey),
            BootstrapCrypto.sharedSecret(b.privateKey, a.publicKey)
        )
    }
}
