package com.rohan.localshare.bootstrap

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECFieldFp
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPrivateKeySpec
import java.security.spec.ECPublicKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Crypto for the offline PC bootstrap (BLE handshake → encrypted hotspot credentials).
 * Byte-for-byte the same spec as desktop/engine/offline-bootstrap.js; see that file for
 * the wire format. Pure JVM (no Android imports) so it is unit-tested on the JVM against
 * the Node test vectors (BootstrapCryptoTest).
 */
object BootstrapCrypto {
    const val PUBLIC_KEY_BYTES = 65
    const val NONCE_BYTES = 16
    const val IV_BYTES = 12
    private const val TAG_BITS = 128
    private val TRANSCRIPT_LABEL = "LocalShare-Bootstrap-v1".toByteArray(Charsets.UTF_8)
    private val KEY_INFO = "LocalShare creds key".toByteArray(Charsets.UTF_8)
    private val CODE_INFO = "LocalShare pairing code".toByteArray(Charsets.UTF_8)
    private val random = SecureRandom()

    val curve: ECParameterSpec by lazy {
        val params = AlgorithmParameters.getInstance("EC")
        params.init(ECGenParameterSpec("secp256r1"))
        params.getParameterSpec(ECParameterSpec::class.java)
    }

    class LocalKeyPair(val privateKey: PrivateKey, val publicKey: ByteArray)

    fun generateKeyPair(): LocalKeyPair {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"), random)
        val pair = generator.generateKeyPair()
        return LocalKeyPair(pair.private, encodePublicKey(pair.public as ECPublicKey))
    }

    fun randomBytes(count: Int): ByteArray = ByteArray(count).also { random.nextBytes(it) }

    /** Test vectors only: a private key from a fixed 32-byte scalar. */
    fun privateKeyFromScalar(scalar: ByteArray): PrivateKey =
        KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(BigInteger(1, scalar), curve))

    fun encodePublicKey(key: ECPublicKey): ByteArray {
        val out = ByteArray(PUBLIC_KEY_BYTES)
        out[0] = 0x04
        fixed32(key.w.affineX).copyInto(out, 1)
        fixed32(key.w.affineY).copyInto(out, 33)
        return out
    }

    /** Uncompressed P-256 point → public key, rejecting points that are not on the curve. */
    fun decodePublicKey(raw: ByteArray): ECPublicKey {
        require(raw.size == PUBLIC_KEY_BYTES && raw[0] == 0x04.toByte()) {
            "Peer public key must be an uncompressed P-256 point"
        }
        val x = BigInteger(1, raw.copyOfRange(1, 33))
        val y = BigInteger(1, raw.copyOfRange(33, 65))
        val p = (curve.curve.field as ECFieldFp).p
        require(x < p && y < p) { "Peer public key coordinates are out of range" }
        val lhs = y.modPow(BigInteger.valueOf(2), p) // BigInteger.TWO is API 33+ on Android
        val rhs = x.pow(3).add(curve.curve.a.multiply(x)).add(curve.curve.b).mod(p)
        require(lhs == rhs) { "Peer public key is not on the P-256 curve" }
        val spec = ECPublicKeySpec(ECPoint(x, y), curve)
        return KeyFactory.getInstance("EC").generatePublic(spec) as ECPublicKey
    }

    /** ECDH shared secret: the 32-byte x coordinate (same as Node's computeSecret). */
    fun sharedSecret(privateKey: PrivateKey, peerPublicKey: ByteArray): ByteArray {
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(privateKey)
        agreement.doPhase(decodePublicKey(peerPublicKey), true)
        return agreement.generateSecret()
    }

    fun transcript(pkPhone: ByteArray, pkPc: ByteArray, noncePhone: ByteArray, noncePc: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(TRANSCRIPT_LABEL)
        digest.update(pkPhone)
        digest.update(pkPc)
        digest.update(noncePhone)
        digest.update(noncePc)
        return digest.digest()
    }

    /** RFC 5869 HKDF-SHA256. */
    fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val extract = Mac.getInstance("HmacSHA256")
        extract.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = extract.doFinal(ikm)
        val expand = Mac.getInstance("HmacSHA256")
        expand.init(SecretKeySpec(prk, "HmacSHA256"))
        val out = ByteArray(length)
        var previous = ByteArray(0)
        var produced = 0
        var counter = 1
        while (produced < length) {
            expand.update(previous)
            expand.update(info)
            expand.update(counter.toByte())
            previous = expand.doFinal()
            val take = minOf(previous.size, length - produced)
            previous.copyInto(out, produced, 0, take)
            produced += take
            counter++
        }
        return out
    }

    fun deriveKey(shared: ByteArray, transcript: ByteArray): ByteArray = hkdf(shared, transcript, KEY_INFO, 32)

    fun deriveCode(shared: ByteArray, transcript: ByteArray): String {
        val bytes = hkdf(shared, transcript, CODE_INFO, 4)
        val value = ((bytes[0].toLong() and 0xff) shl 24) or
            ((bytes[1].toLong() and 0xff) shl 16) or
            ((bytes[2].toLong() and 0xff) shl 8) or
            (bytes[3].toLong() and 0xff)
        return (value % 1_000_000L).toString().padStart(6, '0')
    }

    /** iv || AES-256-GCM(ciphertext || tag), AAD = transcript. */
    fun seal(key: ByteArray, transcript: ByteArray, plaintext: ByteArray, iv: ByteArray = randomBytes(IV_BYTES)): ByteArray {
        require(iv.size == IV_BYTES) { "GCM IV must be $IV_BYTES bytes" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(transcript)
        return iv + cipher.doFinal(plaintext)
    }

    fun open(key: ByteArray, transcript: ByteArray, blob: ByteArray): ByteArray {
        require(blob.size > IV_BYTES + TAG_BITS / 8) { "Encrypted blob is truncated" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
        cipher.updateAAD(transcript)
        return cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
    }

    /** Hotspot credentials plaintext; key order and escaping match JSON.stringify in Node. */
    fun credentialsJson(ssid: String, pass: String, ip: String, port: Int, security: String): String =
        "{\"ssid\":${jsonString(ssid)},\"pass\":${jsonString(pass)},\"ip\":${jsonString(ip)}," +
            "\"port\":$port,\"sec\":${jsonString(security)}}"

    /** JSON string literal with the same escaping as JSON.stringify. */
    fun jsonString(value: String): String {
        val sb = StringBuilder(value.length + 2)
        sb.append('"')
        for (ch in value) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch < ' ') sb.append(String.format("\\u%04x", ch.code)) else sb.append(ch)
            }
        }
        sb.append('"')
        return sb.toString()
    }

    private fun fixed32(value: BigInteger): ByteArray {
        val raw = value.toByteArray()
        return when {
            raw.size == 32 -> raw
            raw.size == 33 && raw[0] == 0.toByte() -> raw.copyOfRange(1, 33)
            raw.size < 32 -> ByteArray(32 - raw.size) + raw
            else -> throw IllegalArgumentException("Coordinate does not fit in 32 bytes")
        }
    }
}
