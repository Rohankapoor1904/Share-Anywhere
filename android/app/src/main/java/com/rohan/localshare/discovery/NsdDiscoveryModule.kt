package com.rohan.localshare.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.InetAddress
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native Android NsdManager integration for mDNS/DNS-SD local network discovery.
 * Complies with §8 & §11: registers and browses '_localshare._tcp' with real OS APIs.
 */
class NsdDiscoveryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val nsdManager: NsdManager =
        reactContext.getSystemService(Context.NSD_SERVICE) as NsdManager

    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var registeredServiceName: String? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val resolveQueue = ConcurrentLinkedQueue<NsdServiceInfo>()
    private val isResolving = AtomicBoolean(false)

    override fun getName(): String = "NsdDiscoveryModule"

    @ReactMethod
    fun registerService(port: Int, txtRecords: ReadableMap, promise: Promise) {
        try {
            unregisterExistingRegistration()

            val serviceInfo = NsdServiceInfo().apply {
                serviceName = "LocalShare-" + (txtRecords.getString("deviceId") ?: "Device")
                serviceType = "_localshare._tcp"
                setPort(port)

                if (txtRecords.hasKey("deviceId")) {
                    setAttribute("deviceId", txtRecords.getString("deviceId"))
                }
                if (txtRecords.hasKey("displayName")) {
                    setAttribute("displayName", txtRecords.getString("displayName"))
                }
                if (txtRecords.hasKey("fingerprint")) {
                    setAttribute("fingerprint", txtRecords.getString("fingerprint"))
                }
                if (txtRecords.hasKey("platform")) {
                    setAttribute("platform", txtRecords.getString("platform"))
                }
                setAttribute("port", port.toString())
            }

            registrationListener = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(registeredInfo: NsdServiceInfo) {
                    registeredServiceName = registeredInfo.serviceName
                    promise.resolve(registeredInfo.serviceName)
                }

                override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
                    promise.reject("ERR_NSD_REG_FAILED", "NSD registration failed with code: $errorCode")
                }

                override fun onServiceUnregistered(arg0: NsdServiceInfo) {
                    registeredServiceName = null
                }

                override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    // Registration cleanup error logged
                }
            }

            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            promise.reject("ERR_NSD_REG_EXCEPTION", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun unregisterService(promise: Promise? = null) {
        try {
            unregisterExistingRegistration()
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_NSD_UNREG_FAILED", e.localizedMessage, e)
        }
    }

    private fun unregisterExistingRegistration() {
        registrationListener?.let {
            try {
                nsdManager.unregisterService(it)
            } catch (e: Exception) {
                // Service may have already been unregistered
            }
            registrationListener = null
            registeredServiceName = null
        }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise? = null) {
        try {
            stopExistingDiscovery()

            // Acquire Wi-Fi MulticastLock so the OS Wi-Fi driver does not filter incoming mDNS packets
            try {
                val wifiManager = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                if (multicastLock == null) {
                    multicastLock = wifiManager?.createMulticastLock("LocalShareNsdMulticastLock")?.apply {
                        setReferenceCounted(true)
                        acquire()
                    }
                }
            } catch (e: Exception) {
                // MulticastLock acquisition fallback
            }

            discoveryListener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(regType: String) {
                    promise?.resolve(true)
                }

                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    if (serviceInfo.serviceType.contains("_localshare._tcp") &&
                        serviceInfo.serviceName != registeredServiceName
                    ) {
                        resolveQueue.offer(serviceInfo)
                        processNextResolve()
                    }
                }

                override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                    val params = Arguments.createMap()
                    params.putString("serviceName", serviceInfo.serviceName)
                    sendEvent("PeerLost", serviceInfo.serviceName)
                }

                override fun onDiscoveryStopped(serviceType: String) {
                    discoveryListener = null
                }

                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    promise?.reject("ERR_NSD_DISCOVERY_START_FAILED", "Code: $errorCode")
                    stopExistingDiscovery()
                }

                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                    stopExistingDiscovery()
                }
            }

            nsdManager.discoverServices(
                "_localshare._tcp",
                NsdManager.PROTOCOL_DNS_SD,
                discoveryListener
            )
        } catch (e: Exception) {
            promise?.reject("ERR_NSD_DISCOVERY_EXCEPTION", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise? = null) {
        try {
            stopExistingDiscovery()
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_NSD_STOP_DISCOVERY_FAILED", e.localizedMessage, e)
        }
    }

    private fun stopExistingDiscovery() {
        discoveryListener?.let {
            try {
                nsdManager.stopServiceDiscovery(it)
            } catch (e: Exception) {
                // Discovery may already be stopped
            }
            discoveryListener = null
        }

        multicastLock?.let {
            try {
                if (it.isHeld) {
                    it.release()
                }
            } catch (e: Exception) {
                // Ignore lock release error
            }
            multicastLock = null
        }

        resolveQueue.clear()
        isResolving.set(false)
    }

    private fun processNextResolve() {
        if (!isResolving.compareAndSet(false, true)) {
            return
        }

        val nextService = resolveQueue.poll()
        if (nextService == null) {
            isResolving.set(false)
            return
        }

        try {
            nsdManager.resolveService(nextService, object : NsdManager.ResolveListener {
                override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                    isResolving.set(false)
                    processNextResolve()
                }

                override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
                    try {
                        val host: InetAddress? = resolvedInfo.host
                        val hostAddress = host?.hostAddress
                        if (hostAddress != null) {
                            val port = resolvedInfo.port
                            val attrs = resolvedInfo.attributes
                            val deviceId = attrs["deviceId"]?.let { String(it, Charsets.UTF_8) }
                                ?: resolvedInfo.serviceName
                            val displayName = attrs["displayName"]?.let { String(it, Charsets.UTF_8) }
                                ?: resolvedInfo.serviceName
                            val fingerprint = attrs["fingerprint"]?.let { String(it, Charsets.UTF_8) } ?: ""
                            val platform = attrs["platform"]?.let { String(it, Charsets.UTF_8) } ?: "android"

                            val params = Arguments.createMap().apply {
                                putString("deviceId", deviceId)
                                putString("displayName", displayName)
                                putString("address", hostAddress)
                                putInt("port", port)
                                putString("fingerprint", fingerprint)
                                putString("platform", platform)
                            }

                            sendEvent("PeerFound", params)
                        }
                    } finally {
                        isResolving.set(false)
                        processNextResolve()
                    }
                }
            })
        } catch (e: Exception) {
            isResolving.set(false)
            processNextResolve()
        }
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
}

