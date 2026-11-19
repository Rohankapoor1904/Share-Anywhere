package com.rohan.localshare.storage

/**
 * Thread-safe shared state for clipboard hash synchronization between
 * TransferServerModule and StorageModule, preventing echo loops.
 */
object ClipboardSyncState {
    @Volatile
    var lastHash: String = ""
}
