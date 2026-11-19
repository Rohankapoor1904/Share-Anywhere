package com.rohan.localshare.transfer

import java.io.File
import java.io.RandomAccessFile

/**
 * Handles chunked read and write operations for file streaming and resuming.
 * Complies with §11 & §12.3: chunk boundaries, last partial chunk, offset math.
 */
class ChunkEngine(private val baseDirectory: File) {

    init {
        if (!baseDirectory.exists()) {
            baseDirectory.mkdirs()
        }
    }

    /**
     * Compute the number of chunks for a given file size and chunk size.
     */
    fun computeChunkCount(totalBytes: Long, chunkSize: Int): Int {
        if (totalBytes <= 0 || chunkSize <= 0) return 0
        return ((totalBytes + chunkSize - 1) / chunkSize).toInt()
    }

    /**
     * Calculate offset for a given chunk index.
     */
    fun getChunkOffset(chunkIndex: Int, chunkSize: Int): Long {
        require(chunkIndex >= 0) { "chunkIndex must be non-negative" }
        require(chunkSize > 0) { "chunkSize must be positive" }
        return chunkIndex.toLong() * chunkSize.toLong()
    }

    /**
     * Calculate byte length of a chunk given file size and index.
     */
    fun getChunkLength(totalBytes: Long, chunkSize: Int, chunkIndex: Int): Int {
        val offset = getChunkOffset(chunkIndex, chunkSize)
        if (offset >= totalBytes) return 0
        val remaining = totalBytes - offset
        return if (remaining < chunkSize) remaining.toInt() else chunkSize
    }

    /**
     * Write chunk data to a target partial file at a specific offset.
     */
    @Synchronized
    fun writeChunk(fileName: String, offset: Long, data: ByteArray): Long {
        val targetFile = File(baseDirectory, "$fileName.localshare.part")
        RandomAccessFile(targetFile, "rw").use { raf ->
            raf.seek(offset)
            raf.write(data)
        }
        return targetFile.length()
    }

    /**
     * Read a chunk from a local file.
     */
    fun readChunk(file: File, offset: Long, length: Int): ByteArray {
        require(file.exists() && file.isFile) { "File does not exist: ${file.absolutePath}" }
        val buffer = ByteArray(length)
        RandomAccessFile(file, "r").use { raf ->
            raf.seek(offset)
            val bytesRead = raf.read(buffer, 0, length)
            if (bytesRead < length && bytesRead >= 0) {
                return buffer.copyOf(bytesRead)
            }
        }
        return buffer
    }

    /**
     * Get the existing size of a partial file for resume operations.
     */
    fun getResumeOffset(fileName: String): Long {
        val partFile = File(baseDirectory, "$fileName.localshare.part")
        return if (partFile.exists() && partFile.isFile) partFile.length() else 0L
    }

    /**
     * Finalize partial file by renaming it to the target file name.
     * @param partName Name under which chunks were streamed (usually the fileId).
     * @param targetName Final on-disk file name (defaults to partName when omitted).
     */
    fun commitFile(partName: String, targetName: String = partName): File {
        val partFile = File(baseDirectory, "$partName.localshare.part")
        val finalFile = File(baseDirectory, targetName)
        if (!partFile.exists()) {
            throw IllegalStateException("Cannot commit: partial file not found")
        }
        if (finalFile.exists()) {
            finalFile.delete()
        }
        if (!partFile.renameTo(finalFile)) {
            throw IllegalStateException("Failed renaming partial file to ${finalFile.absolutePath}")
        }
        return finalFile
    }
}

