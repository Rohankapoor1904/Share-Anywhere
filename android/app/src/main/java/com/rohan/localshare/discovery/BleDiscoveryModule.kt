package com.rohan.localshare.discovery

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

/**
 * Native Android BLE module managing Bluetooth Low Energy advertising and scanning.
 * Complies with §8 & §11 using real android.bluetooth.le APIs.
 */
class BleDiscoveryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null

    override fun getName(): String = "BleDiscoveryModule"

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startAdvertising(serviceUuidStr: String, payloadStr: String, promise: Promise) {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("ERR_BLE_DISABLED", "Bluetooth is disabled or unavailable")
            return
        }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            promise.reject("ERR_BLE_ADV_UNSUPPORTED", "BLE Advertising is not supported on this device")
            return
        }

        try {
            stopAdvertisingInternal()

            val serviceUuid = UUID.fromString(serviceUuidStr)
            val parcelUuid = ParcelUuid(serviceUuid)

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(false)
                .setTimeout(0)
                .build()

            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(parcelUuid)
                .addServiceData(parcelUuid, payloadStr.toByteArray(Charsets.UTF_8).take(20).toByteArray())
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    promise.resolve(true)
                }

                override fun onStartFailure(errorCode: Int) {
                    promise.reject("ERR_BLE_ADV_FAILED", "BLE advertise failed with code: $errorCode")
                }
            }

            advertiser?.startAdvertising(settings, data, advertiseCallback)
        } catch (e: Exception) {
            promise.reject("ERR_BLE_ADV_EXCEPTION", e.localizedMessage, e)
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun stopAdvertising(promise: Promise? = null) {
        try {
            stopAdvertisingInternal()
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_BLE_STOP_ADV_FAILED", e.localizedMessage, e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopAdvertisingInternal() {
        advertiseCallback?.let {
            try {
                advertiser?.stopAdvertising(it)
            } catch (e: Exception) {
                // Ignore cleanup error
            }
            advertiseCallback = null
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startScanning(serviceUuidStr: String, promise: Promise? = null) {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            promise?.reject("ERR_BLE_DISABLED", "Bluetooth is disabled or unavailable")
            return
        }

        scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            promise?.reject("ERR_BLE_SCAN_UNSUPPORTED", "BLE Scanner is not supported")
            return
        }

        try {
            stopScanningInternal()

            val serviceUuid = UUID.fromString(serviceUuidStr)
            val parcelUuid = ParcelUuid(serviceUuid)

            val filter = ScanFilter.Builder()
                .setServiceUuid(parcelUuid)
                .build()

            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()

            scanCallback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult?) {
                    result ?: return
                    val scanRecord = result.scanRecord ?: return
                    val serviceData = scanRecord.getServiceData(parcelUuid)
                    val payload = if (serviceData != null) String(serviceData, Charsets.UTF_8) else ""

                    val params = Arguments.createMap().apply {
                        putString("deviceId", payload.ifEmpty { result.device.address })
                        putString("displayName", result.device.name ?: "Nearby BLE Device")
                        putString("address", result.device.address)
                        putInt("rssi", result.rssi)
                        putString("platform", "ble")
                    }

                    sendEvent("BlePeerFound", params)
                }

                override fun onScanFailed(errorCode: Int) {
                    // Scanning failed
                }
            }

            scanner?.startScan(listOf(filter), settings, scanCallback)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_BLE_SCAN_EXCEPTION", e.localizedMessage, e)
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun stopScanning(promise: Promise? = null) {
        try {
            stopScanningInternal()
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_BLE_STOP_SCAN_FAILED", e.localizedMessage, e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScanningInternal() {
        scanCallback?.let {
            try {
                scanner?.stopScan(it)
            } catch (e: Exception) {
                // Ignore cleanup error
            }
            scanCallback = null
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }
}

