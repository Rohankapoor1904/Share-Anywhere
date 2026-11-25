package com.rohan.localshare.bootstrap

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.security.PrivateKey
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Offline PC connect: the phone advertises a BLE GATT service, a PC reads this phone's
 * identity + ephemeral key, writes its own, both show the same 6-digit code, and after the
 * phone user approves, the phone starts a Local-Only Hotspot and serves its credentials
 * AES-GCM encrypted to that PC only. Wire format: desktop/engine/offline-bootstrap.js.
 *
 * Events: OfflinePcHello {pcDeviceId, pcName, pcFingerprint, code},
 *         OfflinePcState {state, message}.
 */
class OfflinePcModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val main = Handler(Looper.getMainLooper())
    private val hotspot = LocalHotspot(reactContext)
    private val lock = Any()

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var statusCharacteristic: BluetoothGattCharacteristic? = null
    private var pendingStart: Promise? = null
    private var triedWithoutName = false

    // Session state (guarded by lock)
    private var privateKey: PrivateKey? = null
    private var publicKey = ByteArray(0)
    private var nonce = ByteArray(0)
    private var infoBytes = ByteArray(0)
    private var status = STATUS_IDLE
    private var helloDevice: String? = null
    private var helloBytes: ByteArray? = null
    private var sessionKey: ByteArray? = null
    private var transcript: ByteArray? = null
    private var credsBlob: ByteArray? = null

    private val mtu = ConcurrentHashMap<String, Int>()
    private val subscribers: MutableSet<String> = ConcurrentHashMap.newKeySet()
    private val connected = ConcurrentHashMap<String, BluetoothDevice>()
    private val preparedWrites = ConcurrentHashMap<String, ByteArrayOutputStream>()

    override fun getName(): String = "OfflinePcModule"

    private fun bluetoothManager(): BluetoothManager? =
        reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager

    @ReactMethod
    fun isSupported(promise: Promise) {
        val result = Arguments.createMap()
        val adapter = bluetoothManager()?.adapter
        val hasBle = reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
        val bluetoothOn = try {
            adapter?.isEnabled == true
        } catch (e: SecurityException) {
            false
        }
        val canAdvertise = try {
            adapter != null && adapter.isMultipleAdvertisementSupported
        } catch (e: SecurityException) {
            false
        }
        result.putBoolean("hotspot", hotspot.isSupported())
        result.putBoolean("ble", hasBle && canAdvertise)
        result.putBoolean("bluetoothOn", bluetoothOn)
        result.putString(
            "reason",
            when {
                !hotspot.isSupported() -> "Connecting a PC without Wi-Fi needs Android 8.0 or newer"
                !hasBle || adapter == null -> "This phone has no Bluetooth Low Energy"
                !canAdvertise && bluetoothOn -> "This phone's Bluetooth cannot advertise; use the manual Wi-Fi details instead"
                else -> ""
            }
        )
        promise.resolve(result)
    }

    /**
     * Open the GATT server and advertise. Resolves once advertising has started.
     * @param selfJson {"deviceId","displayName","fingerprint"}
     */
    @ReactMethod
    fun startSession(selfJson: String, promise: Promise) {
        main.post {
            stopInternal(releaseHotspot = true)
            try {
                val self = JSONObject(selfJson)
                val adapter = bluetoothManager()?.adapter
                if (adapter == null || !adapter.isEnabled) {
                    promise.reject("ERR_BT_OFF", "Turn on Bluetooth to connect a PC without Wi-Fi")
                    return@post
                }
                val leAdvertiser = adapter.bluetoothLeAdvertiser
                if (leAdvertiser == null) {
                    promise.reject("ERR_BT_ADVERTISE", "This phone's Bluetooth cannot advertise")
                    return@post
                }
                val keys = BootstrapCrypto.generateKeyPair()
                synchronized(lock) {
                    privateKey = keys.privateKey
                    publicKey = keys.publicKey
                    nonce = BootstrapCrypto.randomBytes(BootstrapCrypto.NONCE_BYTES)
                    infoBytes = buildInfo(self)
                    status = STATUS_IDLE
                }
                val server = bluetoothManager()?.openGattServer(reactApplicationContext, gattCallback)
                if (server == null) {
                    promise.reject("ERR_BT_GATT", "Could not open the Bluetooth GATT server")
                    return@post
                }
                gattServer = server
                advertiser = leAdvertiser
                pendingStart = promise
                triedWithoutName = false
                if (!server.addService(buildService())) {
                    failStart("ERR_BT_GATT", "Could not register the LocalShare Bluetooth service")
                }
                // Advertising begins in onServiceAdded.
            } catch (e: SecurityException) {
                stopInternal(releaseHotspot = true)
                promise.reject("ERR_BT_PERMISSION", "LocalShare needs the Nearby devices (Bluetooth) permission", e)
            } catch (e: Exception) {
                stopInternal(releaseHotspot = true)
                promise.reject("ERR_OFFLINE_PC_START", e.localizedMessage, e)
            }
        }
    }

    /**
     * Answer the PC that wrote HELLO. On accept, start the hotspot and publish encrypted credentials.
     */
    @ReactMethod
    fun respond(accepted: Boolean, port: Int, promise: Promise) {
        main.post {
            val waiting = synchronized(lock) { status == STATUS_WAITING }
            if (!waiting) {
                promise.reject("ERR_OFFLINE_PC_STATE", "No PC is waiting for an answer")
                return@post
            }
            if (!accepted) {
                setStatus(STATUS_DECLINED)
                promise.resolve(null)
                return@post
            }
            hotspot.start(
                onReady = { creds ->
                    try {
                        val blob = synchronized(lock) {
                            val key = sessionKey ?: throw IllegalStateException("Session key missing")
                            val th = transcript ?: throw IllegalStateException("Transcript missing")
                            val plaintext = BootstrapCrypto.credentialsJson(creds.ssid, creds.password, creds.ip, port, creds.security)
                            BootstrapCrypto.seal(key, th, plaintext.toByteArray(Charsets.UTF_8)).also { credsBlob = it }
                        }
                        Log.i(TAG, "Hotspot ready for PC (${blob.size}-byte credentials)")
                        setStatus(STATUS_READY)
                        promise.resolve(credentialsMap(creds, port))
                    } catch (e: Exception) {
                        setStatus(STATUS_ERROR)
                        promise.reject("ERR_OFFLINE_PC_SEAL", e.localizedMessage, e)
                    }
                },
                onError = { code, message ->
                    setStatus(STATUS_ERROR)
                    promise.reject(code, message)
                },
                onStopped = { message -> onHotspotStopped(message) }
            )
        }
    }

    /** Manual fallback (PC without Bluetooth): start the hotspot and return its details to show on screen. */
    @ReactMethod
    fun startHotspotOnly(port: Int, promise: Promise) {
        main.post {
            hotspot.start(
                onReady = { creds -> promise.resolve(credentialsMap(creds, port)) },
                onError = { code, message -> promise.reject(code, message) },
                onStopped = { message -> onHotspotStopped(message) }
            )
        }
    }

    @ReactMethod
    fun stopSession(promise: Promise) {
        main.post {
            stopInternal(releaseHotspot = true)
            promise.resolve(true)
        }
    }

    /** Stop BLE but keep the hotspot (the PC has the details and is joining it). */
    @ReactMethod
    fun stopAdvertisingOnly(promise: Promise) {
        main.post {
            stopInternal(releaseHotspot = false)
            promise.resolve(true)
        }
    }

    // ---------------------------------------------------------------------------------
    // GATT
    // ---------------------------------------------------------------------------------

    private fun buildService(): BluetoothGattService {
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                INFO_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
        )
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                HELLO_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )
        )
        val statusChar = BluetoothGattCharacteristic(
            STATUS_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        statusChar.addDescriptor(
            BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
        )
        service.addCharacteristic(statusChar)
        statusCharacteristic = statusChar
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                CREDS_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
        )
        return service
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onServiceAdded(gattStatus: Int, service: BluetoothGattService) {
            main.post {
                if (gattStatus == BluetoothGatt.GATT_SUCCESS) startAdvertising(includeName = true)
                else failStart("ERR_BT_GATT", "Bluetooth service registration failed ($gattStatus)")
            }
        }

        override fun onConnectionStateChange(device: BluetoothDevice, gattStatus: Int, newState: Int) {
            val address = device.address
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connected[address] = device
                return
            }
            connected.remove(address)
            mtu.remove(address)
            subscribers.remove(address)
            preparedWrites.remove(address)
            val waitingFor = synchronized(lock) { if (status == STATUS_WAITING && helloDevice == address) address else null }
            if (waitingFor != null) emitState("pc_disconnected", "The PC disconnected from Bluetooth")
        }

        override fun onMtuChanged(device: BluetoothDevice, newMtu: Int) {
            mtu[device.address] = newMtu
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            val value: ByteArray? = synchronized(lock) {
                when (characteristic.uuid) {
                    INFO_UUID -> infoBytes
                    STATUS_UUID -> byteArrayOf(status.toByte())
                    CREDS_UUID -> if (status == STATUS_READY && helloDevice == device.address) credsBlob else null
                    else -> null
                }
            }
            if (value == null) {
                reply(device, requestId, BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, null)
                return
            }
            if (offset > value.size) {
                reply(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
                return
            }
            val chunk = (mtu[device.address] ?: DEFAULT_MTU) - 1
            reply(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value.copyOfRange(offset, minOf(value.size, offset + chunk)))
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            val data = value ?: ByteArray(0)
            if (characteristic.uuid != HELLO_UUID) {
                if (responseNeeded) reply(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, offset, null)
                return
            }
            if (preparedWrite) {
                val buffer = preparedWrites.getOrPut(device.address) { ByteArrayOutputStream() }
                val result = when {
                    offset != buffer.size() -> BluetoothGatt.GATT_INVALID_OFFSET
                    buffer.size() + data.size > MAX_HELLO_BYTES -> BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH
                    else -> {
                        buffer.write(data)
                        BluetoothGatt.GATT_SUCCESS
                    }
                }
                if (responseNeeded) reply(device, requestId, result, offset, data)
                return
            }
            val result = if (offset != 0) {
                BluetoothGatt.GATT_INVALID_OFFSET
            } else if (handleHello(device, data)) {
                BluetoothGatt.GATT_SUCCESS
            } else {
                BluetoothGatt.GATT_FAILURE
            }
            if (responseNeeded) reply(device, requestId, result, offset, null)
        }

        override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
            val buffer = preparedWrites.remove(device.address)
            val ok = !execute || (buffer != null && handleHello(device, buffer.toByteArray()))
            reply(device, requestId, if (ok) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE, 0, null)
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (descriptor.uuid == CCCD_UUID) {
                val enabled = value != null && (
                    value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ||
                        value.contentEquals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)
                    )
                if (enabled) subscribers.add(device.address) else subscribers.remove(device.address)
                if (responseNeeded) reply(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
            } else if (responseNeeded) {
                reply(device, requestId, BluetoothGatt.GATT_WRITE_NOT_PERMITTED, offset, null)
            }
        }

        override fun onDescriptorReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            descriptor: BluetoothGattDescriptor
        ) {
            val value = if (subscribers.contains(device.address)) {
                BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            } else {
                BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
            }
            reply(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, value)
        }
    }

    /** Validate the PC's HELLO, derive the session secrets and ask the phone user. */
    private fun handleHello(device: BluetoothDevice, bytes: ByteArray): Boolean {
        val event: WritableMap
        synchronized(lock) {
            if (helloDevice != null) {
                // One PC per session; a retransmission of the same HELLO is harmless.
                return helloDevice == device.address && helloBytes?.contentEquals(bytes) == true
            }
            if (status != STATUS_IDLE || bytes.isEmpty() || bytes.size > MAX_HELLO_BYTES) return false
            val key = privateKey ?: return false
            try {
                val hello = JSONObject(String(bytes, Charsets.UTF_8))
                if (hello.optInt("v", -1) != PROTOCOL_VERSION) return false
                val pcId = hello.optString("d", "")
                if (!SAFE_ID.matches(pcId)) return false
                val pcKey = Base64.decode(hello.optString("pk", ""), Base64.NO_WRAP)
                val pcNonce = Base64.decode(hello.optString("nonce", ""), Base64.NO_WRAP)
                if (pcKey.size != BootstrapCrypto.PUBLIC_KEY_BYTES || pcNonce.size != BootstrapCrypto.NONCE_BYTES) return false

                val shared = BootstrapCrypto.sharedSecret(key, pcKey)
                val th = BootstrapCrypto.transcript(publicKey, pcKey, nonce, pcNonce)
                sessionKey = BootstrapCrypto.deriveKey(shared, th)
                transcript = th
                helloDevice = device.address
                helloBytes = bytes
                status = STATUS_WAITING
                event = Arguments.createMap().apply {
                    putString("pcDeviceId", pcId)
                    putString("pcName", hello.optString("n", "PC").take(128))
                    putString("pcFingerprint", hello.optString("fp", "").take(256))
                    putString("code", BootstrapCrypto.deriveCode(shared, th))
                }
            } catch (e: Exception) {
                Log.w(TAG, "Rejected an invalid PC hello", e)
                return false
            }
        }
        notifyStatus()
        sendEvent("OfflinePcHello", event)
        return true
    }

    private fun startAdvertising(includeName: Boolean) {
        val leAdvertiser = advertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        // The name goes in the scan response so the PC picker can show it; dropped if it does not fit.
        val scanResponse = AdvertiseData.Builder().setIncludeDeviceName(includeName).build()
        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                val promise = pendingStart
                pendingStart = null
                emitState("advertising", "")
                promise?.resolve(true)
            }

            override fun onStartFailure(errorCode: Int) {
                main.post {
                    if (errorCode == ADVERTISE_FAILED_DATA_TOO_LARGE && !triedWithoutName) {
                        triedWithoutName = true
                        startAdvertising(includeName = false)
                    } else {
                        failStart("ERR_BT_ADVERTISE", describeAdvertiseError(errorCode))
                    }
                }
            }
        }
        advertiseCallback = callback
        try {
            leAdvertiser.startAdvertising(settings, data, scanResponse, callback)
        } catch (e: SecurityException) {
            failStart("ERR_BT_PERMISSION", "LocalShare needs the Nearby devices (Bluetooth) permission")
        }
    }

    private fun failStart(code: String, message: String) {
        val promise = pendingStart
        pendingStart = null
        stopInternal(releaseHotspot = true)
        promise?.reject(code, message)
    }

    private fun setStatus(next: Int) {
        synchronized(lock) { status = next }
        notifyStatus()
    }

    private fun notifyStatus() {
        val server = gattServer ?: return
        val characteristic = statusCharacteristic ?: return
        val value = byteArrayOf(synchronized(lock) { status }.toByte())
        for (address in subscribers) {
            val device = connected[address] ?: continue
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    server.notifyCharacteristicChanged(device, characteristic, false, value)
                } else {
                    @Suppress("DEPRECATION")
                    characteristic.value = value
                    @Suppress("DEPRECATION")
                    server.notifyCharacteristicChanged(device, characteristic, false)
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "Bluetooth permission missing for notify", e)
            }
        }
    }

    private fun reply(device: BluetoothDevice, requestId: Int, gattStatus: Int, offset: Int, value: ByteArray?) {
        try {
            gattServer?.sendResponse(device, requestId, gattStatus, offset, value)
        } catch (e: SecurityException) {
            Log.w(TAG, "Bluetooth permission missing for GATT response", e)
        }
    }

    private fun onHotspotStopped(message: String) {
        synchronized(lock) {
            credsBlob = null
            if (status == STATUS_READY) status = STATUS_ERROR
        }
        notifyStatus()
        emitState("hotspot_stopped", message)
    }

    private fun stopInternal(releaseHotspot: Boolean) {
        try {
            advertiseCallback?.let { advertiser?.stopAdvertising(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Stopping BLE advertising failed", e)
        }
        advertiseCallback = null
        advertiser = null
        try {
            gattServer?.clearServices()
            gattServer?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Closing the GATT server failed", e)
        }
        gattServer = null
        statusCharacteristic = null
        connected.clear()
        mtu.clear()
        subscribers.clear()
        preparedWrites.clear()
        synchronized(lock) {
            if (releaseHotspot) {
                privateKey = null
                sessionKey = null
                transcript = null
                credsBlob = null
                helloDevice = null
                helloBytes = null
                status = STATUS_IDLE
            }
        }
        if (releaseHotspot) hotspot.stop()
    }

    private fun buildInfo(self: JSONObject): ByteArray {
        val deviceId = self.optString("deviceId", "")
        require(SAFE_ID.matches(deviceId)) { "Invalid device id" }
        val json = "{\"v\":$PROTOCOL_VERSION," +
            "\"d\":${BootstrapCrypto.jsonString(deviceId)}," +
            "\"n\":${BootstrapCrypto.jsonString(self.optString("displayName", "Phone").take(64))}," +
            "\"p\":\"android\"," +
            "\"fp\":${BootstrapCrypto.jsonString(self.optString("fingerprint", ""))}," +
            "\"pk\":\"${Base64.encodeToString(publicKey, Base64.NO_WRAP)}\"," +
            "\"nonce\":\"${Base64.encodeToString(nonce, Base64.NO_WRAP)}\"}"
        return json.toByteArray(Charsets.UTF_8)
    }

    private fun credentialsMap(creds: LocalHotspot.Credentials, port: Int): WritableMap =
        Arguments.createMap().apply {
            putString("ssid", creds.ssid)
            putString("password", creds.password)
            putString("security", creds.security)
            putString("ip", creds.ip)
            putInt("port", port)
        }

    private fun describeAdvertiseError(code: Int): String = when (code) {
        AdvertiseCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many Bluetooth advertisers are running; close other sharing apps"
        AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "This phone's Bluetooth cannot advertise"
        AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE -> "Bluetooth advertisement is too large"
        else -> "Bluetooth advertising failed (code $code)"
    }

    private fun emitState(state: String, message: String) {
        sendEvent("OfflinePcState", Arguments.createMap().apply {
            putString("state", state)
            putString("message", message)
        })
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for React Native NativeEventEmitter
    }

    override fun invalidate() {
        main.post { stopInternal(releaseHotspot = true) }
        super.invalidate()
    }

    companion object {
        private const val TAG = "LocalShareOfflinePc"
        const val PROTOCOL_VERSION = 1
        val SERVICE_UUID: UUID = UUID.fromString("6c4c6f63-616c-7368-6172-650000000010")
        val INFO_UUID: UUID = UUID.fromString("6c4c6f63-616c-7368-6172-650000000011")
        val HELLO_UUID: UUID = UUID.fromString("6c4c6f63-616c-7368-6172-650000000012")
        val STATUS_UUID: UUID = UUID.fromString("6c4c6f63-616c-7368-6172-650000000013")
        val CREDS_UUID: UUID = UUID.fromString("6c4c6f63-616c-7368-6172-650000000014")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        const val STATUS_IDLE = 0
        const val STATUS_WAITING = 1
        const val STATUS_READY = 2
        const val STATUS_DECLINED = 3
        const val STATUS_ERROR = 4
        private const val DEFAULT_MTU = 23
        private const val MAX_HELLO_BYTES = 1024
        private val SAFE_ID = Regex("^[A-Za-z0-9._-]{1,128}$")
    }
}
