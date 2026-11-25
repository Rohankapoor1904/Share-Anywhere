package com.rohan.localshare.bootstrap

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.SoftApConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Android Local-Only Hotspot: a phone-created Wi-Fi network with a random name and
 * password and no internet, which a PC joins so the normal HTTP transfer protocol works
 * without any shared router. One reservation is held until [stop] (or the system ends it).
 */
class LocalHotspot(context: Context) {

    data class Credentials(val ssid: String, val password: String, val security: String, val ip: String)

    private val appContext = context.applicationContext
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var reservation: AutoCloseable? = null
    @Volatile private var current: Credentials? = null
    @Volatile private var starting = false

    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    fun currentCredentials(): Credentials? = current

    /**
     * Start (or reuse) the hotspot. Callbacks run on the main thread.
     * @param onStopped called if the system later shuts the hotspot down.
     */
    fun start(
        onReady: (Credentials) -> Unit,
        onError: (code: String, message: String) -> Unit,
        onStopped: (message: String) -> Unit
    ) {
        if (!isSupported()) {
            onError("ERR_HOTSPOT_UNSUPPORTED", "Sharing without Wi-Fi to a PC needs Android 8.0 or newer")
            return
        }
        current?.let {
            onReady(it)
            return
        }
        if (starting) {
            onError("ERR_HOTSPOT_BUSY", "The hotspot is already starting")
            return
        }
        startApi26(onReady, onError, onStopped)
    }

    fun stop() {
        val res = reservation
        reservation = null
        current = null
        starting = false
        if (res != null) {
            try {
                res.close()
            } catch (e: Exception) {
                Log.w(TAG, "Closing the hotspot reservation failed", e)
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun startApi26(
        onReady: (Credentials) -> Unit,
        onError: (String, String) -> Unit,
        onStopped: (String) -> Unit
    ) {
        starting = true
        val callback = object : WifiManager.LocalOnlyHotspotCallback() {
            override fun onStarted(res: WifiManager.LocalOnlyHotspotReservation) {
                reservation = res
                val config = try {
                    readConfig(res)
                } catch (e: Exception) {
                    starting = false
                    stop()
                    onError("ERR_HOTSPOT_CONFIG", "Could not read the hotspot details: ${e.localizedMessage}")
                    return
                }
                // The interface gets its address a moment after onStarted.
                Thread {
                    val ip = waitForHotspotIp(IP_WAIT_MS)
                    main.post {
                        starting = false
                        if (reservation !== res) return@post
                        if (ip == null) {
                            stop()
                            onError("ERR_HOTSPOT_NO_IP", "The hotspot started but its address could not be found")
                        } else {
                            val creds = Credentials(config.first, config.second, config.third, ip)
                            current = creds
                            onReady(creds)
                        }
                    }
                }.start()
            }

            override fun onStopped() {
                val wasActive = current != null
                reservation = null
                current = null
                starting = false
                if (wasActive) onStopped("The phone's hotspot was turned off")
            }

            override fun onFailed(reason: Int) {
                starting = false
                reservation = null
                onError("ERR_HOTSPOT_FAILED", describeFailure(reason))
            }
        }
        try {
            wifi.startLocalOnlyHotspot(callback, main)
        } catch (e: SecurityException) {
            starting = false
            onError(
                "ERR_HOTSPOT_PERMISSION",
                "LocalShare needs the Nearby devices (Android 13+) or Location permission to start a hotspot"
            )
        } catch (e: IllegalStateException) {
            starting = false
            onError("ERR_HOTSPOT_BUSY", e.localizedMessage ?: "A hotspot request is already active")
        }
    }

    /** (ssid, password, security) of the reservation. */
    @RequiresApi(Build.VERSION_CODES.O)
    private fun readConfig(res: WifiManager.LocalOnlyHotspotReservation): Triple<String, String, String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val cfg = res.softApConfiguration
            val ssid = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                cfg.wifiSsid?.let { decodeWifiSsid(it.toString()) }
            } else {
                @Suppress("DEPRECATION")
                cfg.ssid
            }
            val security = when (cfg.securityType) {
                SoftApConfiguration.SECURITY_TYPE_OPEN -> "open"
                SoftApConfiguration.SECURITY_TYPE_WPA3_SAE_TRANSITION -> "wpa3-transition"
                SoftApConfiguration.SECURITY_TYPE_WPA3_SAE -> "wpa3"
                else -> "wpa2"
            }
            return Triple(
                ssid?.takeIf { it.isNotEmpty() } ?: throw IllegalStateException("Hotspot has no name"),
                cfg.passphrase ?: "",
                security
            )
        }
        @Suppress("DEPRECATION")
        val wc = res.wifiConfiguration ?: throw IllegalStateException("Hotspot configuration is unavailable")
        @Suppress("DEPRECATION")
        val ssid = wc.SSID?.removeSurrounding("\"") ?: throw IllegalStateException("Hotspot has no name")
        @Suppress("DEPRECATION")
        val pass = wc.preSharedKey?.removeSurrounding("\"") ?: ""
        return Triple(ssid, pass, if (pass.isEmpty()) "open" else "wpa2")
    }

    /** WifiSsid.toString(): quoted UTF-8 text, or unquoted hex when not valid UTF-8. */
    private fun decodeWifiSsid(raw: String): String {
        if (raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) return raw.substring(1, raw.length - 1)
        if (raw.matches(Regex("^[0-9a-fA-F]+$")) && raw.length % 2 == 0) {
            val bytes = ByteArray(raw.length / 2) { i -> raw.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
            return String(bytes, Charsets.UTF_8)
        }
        return raw
    }

    /** The hotspot interface's IPv4 address, excluding addresses of the phone's own Wi-Fi connection. */
    private fun waitForHotspotIp(timeoutMs: Long): String? {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val found = findHotspotIp(stationAddresses())
            if (found != null) return found
            try {
                Thread.sleep(200)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                return null
            }
        }
        return null
    }

    private fun stationAddresses(): Set<String> {
        val result = mutableSetOf<String>()
        try {
            val cm = appContext.getSystemService(ConnectivityManager::class.java) ?: return result
            @Suppress("DEPRECATION")
            for (network in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(network) ?: continue
                if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue
                cm.getLinkProperties(network)?.linkAddresses?.forEach { link ->
                    (link.address as? Inet4Address)?.hostAddress?.let(result::add)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not read Wi-Fi station addresses", e)
        }
        return result
    }

    private fun findHotspotIp(exclude: Set<String>): String? {
        var best: String? = null
        var bestScore = 0
        val interfaces = try {
            NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "Could not list network interfaces", e)
            return null
        }
        for (ni in interfaces) {
            val name = ni.name.lowercase()
            if (!ni.isUp || ni.isLoopback || EXCLUDED_INTERFACE.containsMatchIn(name)) continue
            val score = when {
                HOTSPOT_INTERFACE.containsMatchIn(name) -> 3
                name.startsWith("wlan") -> 2
                else -> 1
            }
            for (address in ni.inetAddresses) {
                if (address !is Inet4Address || !address.isSiteLocalAddress) continue
                val ip = address.hostAddress ?: continue
                if (ip in exclude) continue
                if (score > bestScore) {
                    best = ip
                    bestScore = score
                }
            }
        }
        return best
    }

    private fun describeFailure(reason: Int): String = when (reason) {
        WifiManager.LocalOnlyHotspotCallback.ERROR_NO_CHANNEL -> "No Wi-Fi channel is free for a hotspot"
        WifiManager.LocalOnlyHotspotCallback.ERROR_INCOMPATIBLE_MODE ->
            "Turn off the phone's regular hotspot (tethering) and try again"
        WifiManager.LocalOnlyHotspotCallback.ERROR_TETHERING_DISALLOWED -> "Hotspots are blocked on this phone (device policy)"
        else -> "The phone could not start a hotspot (code $reason)"
    }

    companion object {
        private const val TAG = "LocalShareHotspot"
        private const val IP_WAIT_MS = 4000L
        private val HOTSPOT_INTERFACE = Regex("^(ap|swlan|softap)\\d*")
        private val EXCLUDED_INTERFACE = Regex("^(rmnet|ccmni|dummy|tun|p2p|rndis|lo|v4-|clat|ip6tnl|sit|bt-pan|usb)")
    }
}
