package com.rohan.localshare

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.rohan.localshare.bootstrap.OfflinePcModule
import com.rohan.localshare.crypto.EphemeralCertModule
import com.rohan.localshare.crypto.HashingModule
import com.rohan.localshare.discovery.BleDiscoveryModule
import com.rohan.localshare.discovery.NsdDiscoveryModule
import com.rohan.localshare.nearby.NearbyModule
import com.rohan.localshare.service.TransferForegroundServiceModule
import com.rohan.localshare.storage.StorageModule
import com.rohan.localshare.transfer.TransferClientModule
import com.rohan.localshare.transfer.TransferServerModule
import com.rohan.localshare.util.PinModule

/**
 * React Native package exporting all LocalShare native modules.
 */
class LocalSharePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val certModule = EphemeralCertModule(reactContext)
        return listOf(
            certModule,
            HashingModule(reactContext),
            PinModule(reactContext),
            NsdDiscoveryModule(reactContext),
            BleDiscoveryModule(reactContext),
            TransferServerModule(reactContext, certModule),
            TransferClientModule(reactContext),
            TransferForegroundServiceModule(reactContext),
            StorageModule(reactContext),
            NearbyModule(reactContext),
            OfflinePcModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}

